#!/usr/bin/env python3
"""Cheap integrity check on the committed audio manifest.

    python tools/audio_pipeline/check_manifest.py

This is what CI runs. It answers one question — *is the manifest in the tree a
believable, current, self-consistent product of the pipeline?* — and it answers
it without decoding a single sample. The full spectral analysis takes ten
seconds on a warm cache and several minutes on a cold one, needs numpy, scipy,
soundfile and pyloudnorm, and re-measures 1.5 GB of audio to reproduce numbers
that are already committed. Making every push pay that to learn nothing new
would be the wrong trade (§49).

So this checks the *contract* rather than the *measurements*: that the manifest
parses, that its versions match the code that would have written it, that every
record satisfies the schema, that ids are unique and derived from the content
hash they claim, that every referenced file is really in the source tree, and
that the overrides file and the manifest agree with each other.

Nothing here re-implements the schema. The record-level validation is
`pipeline.manifest.validate` — the same function the pipeline itself runs — so a
rule can never be enforced in one place and not the other. That import is also
why this script has no third-party dependencies: `pipeline.manifest`,
`pipeline.schema` and `pipeline.config` are pure standard library, and only
`analyze`, `decode` and `report` reach for numpy.

What it deliberately does *not* do is re-hash the audio, re-measure it, or
regenerate the manifest and diff it. Those are the things a real run does, and
they belong to a person with the library on disk, not to a push.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline.config import default_paths  # noqa: E402
from pipeline.manifest import _round, apply_overrides, load_overrides, validate  # noqa: E402
from pipeline.schema import (  # noqa: E402
    ANALYSIS_VERSION,
    LIBRARY_VERSION,
    MANIFEST_HEADER,
    SCHEMA_VERSION,
)

ASSET_ID = re.compile(r"^organic\.[0-9a-f]{12}$")
CONTENT_HASH = re.compile(r"^[0-9a-f]{64}$")


class Failures:
    """Collected problems. Everything is checked before anything is reported, so
    one run tells a contributor the whole story rather than the first line of it."""

    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, message: str) -> None:
        self.items.append(message)

    def __bool__(self) -> bool:
        return bool(self.items)


def check_versions(manifest: dict[str, Any], fail: Failures) -> None:
    """The three version numbers, against the code that would have written them.

    This is the stale-manifest check. Bumping ANALYSIS_VERSION without re-running
    the pipeline leaves a manifest whose numbers came from code that no longer
    exists, and nothing else in the tree would notice (§33).
    """
    expected = {
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": ANALYSIS_VERSION,
        "organicLibraryVersion": LIBRARY_VERSION,
    }
    for key, want in expected.items():
        got = manifest.get(key)
        if got != want:
            fail.add(
                f"manifest {key} is {got!r} but the pipeline declares {want!r}. "
                "Re-run `python tools/audio_pipeline/index_audio.py all` so the "
                "committed manifest comes from the current code."
            )
    if manifest.get("_comment") != MANIFEST_HEADER:
        fail.add("manifest is missing its generated-file header, which suggests it was edited by hand.")


def check_shape(manifest: dict[str, Any], fail: Failures) -> list[dict[str, Any]]:
    assets = manifest.get("assets")
    if not isinstance(assets, list):
        fail.add("manifest has no `assets` array.")
        return []
    if manifest.get("assetCount") != len(assets):
        fail.add(f"manifest says assetCount {manifest.get('assetCount')!r} but carries {len(assets)} assets.")
    ids = [asset.get("assetId") for asset in assets]
    if ids != sorted(ids):
        fail.add(
            "assets are not sorted by asset id. The manifest is meant to be byte-identical "
            "across runs, and sort order is half of that (§56)."
        )
    return assets


def check_identity(assets: list[dict[str, Any]], fail: Failures) -> None:
    """Ids are unique, well-formed, and derived from the hash they carry.

    An id is the first twelve hex characters of the file's SHA-256, which is what
    makes it survive a rename and change when the audio is replaced (§7). An id
    that does not match its own contentHash means one of the two was edited by
    hand, and every override keyed to it is now pointing at a fiction.
    """
    seen: dict[str, str] = {}
    for asset in assets:
        asset_id = asset.get("assetId")
        path = asset.get("source", {}).get("relativePath", "?")
        if not isinstance(asset_id, str) or not ASSET_ID.match(asset_id):
            fail.add(f"{path}: asset id {asset_id!r} is not `organic.` plus twelve lowercase hex characters.")
            continue
        if asset_id in seen:
            fail.add(f"{asset_id}: duplicate id, shared with {seen[asset_id]}.")
            continue
        seen[asset_id] = path

        content_hash = asset.get("source", {}).get("contentHash")
        if not isinstance(content_hash, str) or not CONTENT_HASH.match(content_hash):
            fail.add(f"{asset_id}: contentHash {content_hash!r} is not a 64-character SHA-256 digest.")
            continue
        expected = f"organic.{content_hash[:12]}"
        if asset_id != expected:
            fail.add(f"{asset_id}: id does not match its own content hash, which would give {expected}.")


def check_paths(assets: list[dict[str, Any]], source: Path, fail: Failures) -> None:
    """Every referenced path is a relative path inside the source tree.

    Whether the file is actually *there* is left to `validate`, which asks the
    same question and words the answer better; this asks the one thing it does
    not, which is whether the path is entitled to be asked at all. Discovery
    refuses to follow a symlink out of the tree (§57); this refuses to describe a
    file outside it.
    """
    for asset in assets:
        asset_id = asset.get("assetId", "?")
        relative = asset.get("source", {}).get("relativePath")
        if not isinstance(relative, str) or not relative:
            fail.add(f"{asset_id}: has no source path.")
            continue
        if relative.startswith("/") or ".." in Path(relative).parts:
            fail.add(f"{asset_id}: source path {relative!r} escapes the source tree.")


def check_overrides(assets: list[dict[str, Any]], overrides: dict[str, Any], fail: Failures) -> None:
    """The overrides file and the manifest have to be the same age.

    `validate` already rejects an override keyed to an unknown asset. What it
    cannot see is an override that was edited after the last run, so the manifest
    no longer reflects it. Re-applying an override to an already-merged record is
    a no-op when the manifest is current, so that is the test — and it costs a
    dictionary merge per entry rather than a re-analysis of the library.
    """
    by_id = {asset.get("assetId"): asset for asset in assets}
    for asset_id, override in overrides.items():
        asset = by_id.get(asset_id)
        if asset is None:
            # validate() reports this with the fuller message; nothing to add.
            continue
        if not isinstance(override, dict):
            fail.add(f"{asset_id}: override must be an object of sections, not {type(override).__name__}.")
            continue
        # _round is the manifest's own float rounding. Re-applying an override
        # that carries a float would otherwise fail on the rounding alone.
        if _round(apply_overrides(asset, override)) != asset:
            fail.add(
                f"{asset_id}: the overrides file says something the manifest does not reflect. "
                "Re-run `python tools/audio_pipeline/index_audio.py all` and commit the result."
            )

    # And the other direction: a record still flagged as overridden after its
    # entry was deleted is just as stale.
    for asset in assets:
        asset_id = asset.get("assetId")
        if asset.get("review", {}).get("manualOverride") and asset_id not in overrides:
            fail.add(
                f"{asset_id}: is marked manualOverride but has no entry in the overrides file. "
                "Re-run the pipeline so the manifest forgets the override that was removed."
            )


def check_report(manifest: dict[str, Any], report_path: Path, fail: Failures) -> None:
    """The committed report came from the run that wrote the committed manifest.

    Both artefacts embed the same summary object, so comparing them proves they
    are the same age without re-deriving a single count. The text report is not
    checked: it is written for a person, and machine-checking it would make its
    layout a contract nobody meant to sign.
    """
    if not report_path.exists():
        fail.add(f"the JSON report is missing from {report_path}.")
        return
    try:
        report = json.loads(report_path.read_text())
    except json.JSONDecodeError as error:
        fail.add(f"{report_path.name} is not valid JSON: {error.msg} at line {error.lineno}.")
        return
    if report.get("summary") != manifest.get("counts"):
        fail.add(
            f"{report_path.name} and the manifest carry different summaries, so one of them is "
            "from an older run. Re-run the pipeline and commit both."
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, help="source tree the manifest describes")
    parser.add_argument(
        "--allow-missing-source",
        action="store_true",
        help="tolerate a checkout without the licensed library, and check everything but "
        "whether the audio files are really there",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[2]
    paths = default_paths(root)
    source = args.source.resolve() if args.source else paths.source

    fail = Failures()

    if not paths.manifest.exists():
        print(f"FAIL  no manifest at {paths.manifest}")
        print("      Run `python tools/audio_pipeline/index_audio.py all` and commit the result.")
        return 1
    try:
        manifest = json.loads(paths.manifest.read_text())
    except json.JSONDecodeError as error:
        print(f"FAIL  {paths.manifest.name} is not valid JSON: {error.msg} at line {error.lineno}, column {error.colno}")
        return 1

    check_versions(manifest, fail)
    assets = check_shape(manifest, fail)
    check_identity(assets, fail)
    check_paths(assets, source, fail)

    overrides, override_issues = load_overrides(paths.overrides)
    for issue in override_issues:
        fail.add(issue.message)
    check_overrides(assets, overrides, fail)
    check_report(manifest, paths.report_json, fail)

    # The pipeline's own validator, run against the committed record: every
    # closed set, every field type, every null that may not be null, and the
    # stricter bar an approved asset has to clear. It never opens an audio file.
    # Its one filesystem call is `exists()` per asset, which is the check that
    # every referenced file is really in the tree.
    missing_source = not source.exists()
    if missing_source and not args.allow_missing_source:
        fail.add(
            f"the source tree is not at {source}. This check stats the audio files; it never "
            "reads them. Point it somewhere with --source, or pass --allow-missing-source to "
            "check everything except whether they are there."
        )
    issues = validate(assets, overrides, source)
    if missing_source or args.allow_missing_source:
        # Without the library on disk every asset would report as missing, which
        # is one true fact repeated 369 times and no help to anybody.
        issues = [issue for issue in issues if "not in the source tree" not in issue.message]
        print("note       not checking whether the audio files exist")
    fatal = [issue for issue in issues if issue.fatal]
    advisory = [issue for issue in issues if not issue.fatal]
    for issue in fatal:
        fail.add(issue.render().removeprefix("ERROR  "))

    print(f"manifest   {len(assets)} assets, schema {manifest.get('schemaVersion')}, "
          f"analysis {manifest.get('analysisVersion')}, library {manifest.get('organicLibraryVersion')}")
    print(f"overrides  {len(overrides)} entries in {paths.overrides.name if paths.overrides.exists() else '(none)'}")
    print(f"advisory   {len(advisory)} warnings, which are facts about the library and not failures")

    if fail:
        print()
        print(f"FAIL       {len(fail.items)} problems")
        for message in fail.items[:40]:
            print(f"  {message}")
        if len(fail.items) > 40:
            print(f"  ... and {len(fail.items) - 40} more")
        return 1

    print("ok         the manifest, the overrides and the report agree")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
