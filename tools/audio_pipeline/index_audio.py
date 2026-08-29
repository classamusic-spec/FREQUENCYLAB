#!/usr/bin/env python3
"""Offline audio asset preprocessing for the organic sound-bath library.

    python tools/audio_pipeline/index_audio.py all

Discovers every source asset, measures it, classifies it, applies the curator's
overrides, validates the result and writes a canonical manifest the application
can consume without ever opening an audio file at runtime.

Run `--help` for the individual stages.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline.analyze import analyse  # noqa: E402
from pipeline.cache import AnalysisCache  # noqa: E402
from pipeline.classify import choose_instrument, read_hints, runtime_hints, suggest_roles, suggest_tags  # noqa: E402
from pipeline.config import AnalysisConfig, PipelineConfig, default_paths  # noqa: E402
from pipeline.decode import DecodeError, decode, ffmpeg_available  # noqa: E402
from pipeline.derive import CODECS, transcode  # noqa: E402
from pipeline.discovery import Discovered, asset_id, discover  # noqa: E402
from pipeline import emit_ts  # noqa: E402
from pipeline import manifest as manifest_module  # noqa: E402
from pipeline import report as report_module  # noqa: E402
from pipeline.schema import duration_class  # noqa: E402


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


# ---------------------------------------------------------------------------
# Analysis of one file. Module level so it can be sent to a worker process.
# ---------------------------------------------------------------------------

def _measure(job: tuple[str, str, str]) -> dict[str, Any]:
    path_text, relative, content_hash = job
    path = Path(path_text)
    try:
        decoded = decode(path)
    except DecodeError as error:
        return {"contentHash": content_hash, "relativePath": relative, "error": str(error)}

    config = AnalysisConfig()
    analysis = analyse(decoded, config)
    return {
        "contentHash": content_hash,
        "relativePath": relative,
        "audio": {
            "durationSeconds": round(decoded.duration_seconds, 6),
            "sampleRate": decoded.sample_rate,
            "channels": decoded.channels,
            "bitDepth": decoded.bit_depth,
            "frameCount": decoded.frames,
        },
        "levels": analysis.levels,
        "timing": analysis.timing,
        "spectral": analysis.spectral,
        "waveform": report_module.waveform_peaks(decoded.mono),
        "warnings": analysis.warnings,
    }


def _assemble(found: Discovered, measured: dict[str, Any], config: PipelineConfig) -> dict[str, Any]:
    hints = read_hints(found.relative_path)
    audio = measured["audio"]
    spectral = dict(measured["spectral"])
    seconds = audio["durationSeconds"]

    instrument, reason = choose_instrument(hints, spectral, seconds)
    band = duration_class(seconds, config.analysis.duration_bands)

    # The filename claims a note. Where the audio is confident enough to have an
    # opinion, the two are compared and any disagreement is recorded rather than
    # quietly resolved — §18's "never assume filename metadata is correct
    # without validation where validation is possible", at the one point in this
    # library where it genuinely is possible.
    name_note_conflict = None
    if hints.note_is_comparable and spectral.get("pitchClass") and hints.note != spectral["pitchClass"]:
        name_note_conflict = f"filename says {hints.note}, measured {spectral['pitchClass']}"

    # Where the spectrum could not corroborate a note, fall back to the note the
    # library itself put in the filename — labelled as such, never merged into
    # the measured fields as though it had been observed. For inharmonic material
    # the vendor's label is very often the better answer, and §21 lets a curator
    # override either way.
    if spectral.get("note"):
        spectral["noteSource"] = "measured"
    elif hints.note_is_comparable:
        spectral["note"] = None
        spectral["pitchClass"] = hints.note
        spectral["noteSource"] = "filename"
    else:
        spectral["noteSource"] = None

    resonant = spectral.pop("resonantPeaksHz", [])
    asset = {
        "assetId": asset_id(found.content_hash),
        "label": f"{instrument.lower()}/{Path(found.relative_path).stem}",
        "source": {
            "filename": Path(found.relative_path).name,
            "relativePath": found.relative_path,
            "contentHash": found.content_hash,
            "format": found.extension.lstrip("."),
            "bytes": found.bytes_,
        },
        "audio": audio,
        "levels": measured["levels"],
        "timing": measured["timing"],
        "spectral": {**spectral, "resonantPeaksHz": resonant},
        "classification": {
            "instrument": instrument,
            "durationClass": band,
            "recommendedRoles": suggest_roles(instrument, seconds, config.analysis, hints),
            "characterTags": suggest_tags(spectral, measured["levels"], seconds, hints),
        },
        "runtime": runtime_hints(seconds, instrument, hints, spectral),
        "review": {"approved": False, "approvalSource": None, "manualOverride": False, "notes": None},
        "_hints": {**hints.as_json(), "instrumentReason": reason, "noteConflict": name_note_conflict},
        "_warnings": measured.get("warnings", []),
        "_waveform": measured.get("waveform", []),
    }
    return asset


# ---------------------------------------------------------------------------
# Stages
# ---------------------------------------------------------------------------

def stage_scan(config: PipelineConfig, quiet: bool = False) -> tuple[list[Discovered], list[Path]]:
    found, skipped = discover(config)
    if not quiet:
        print(f"scan       {len(found)} audio files under {config.paths.source}")
        if skipped:
            print(f"           {len(skipped)} non-audio files ignored")
        if not found:
            print(f"           nothing to do — no supported audio under {config.paths.source}")
    return found, skipped


def stage_analyze(config: PipelineConfig, found: list[Discovered], jobs: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cache = AnalysisCache(config.paths.cache)
    measured: dict[str, dict[str, Any]] = {}
    pending: list[tuple[str, str, str]] = []

    for item in found:
        hit = cache.get(item.content_hash)
        if hit is not None:
            measured[item.content_hash] = hit
        else:
            pending.append((str(item.path), item.relative_path, item.content_hash))

    print(f"analyze    {cache.hits} cached, {len(pending)} to measure")
    failures: list[dict[str, Any]] = []
    if pending:
        started = time.time()
        done = 0
        with ProcessPoolExecutor(max_workers=jobs) as pool:
            for result in pool.map(_measure, pending, chunksize=1):
                done += 1
                if "error" in result:
                    failures.append(result)
                    print(f"           FAILED {result['relativePath']}: {result['error']}")
                else:
                    measured[result["contentHash"]] = result
                    cache.put(result["contentHash"], result)
                if done % 25 == 0 or done == len(pending):
                    rate = done / max(time.time() - started, 0.001)
                    print(f"           {done}/{len(pending)} measured ({rate:.1f}/s)")
        cache.save()

    assets = []
    for item in found:
        result = measured.get(item.content_hash)
        if result is None:
            continue
        assets.append(_assemble(item, result, config))
    return assets, failures


def stage_overrides(config: PipelineConfig, assets: list[dict[str, Any]]):
    overrides, issues = manifest_module.load_overrides(config.paths.overrides)
    applied = 0
    merged = []
    for asset in assets:
        override = overrides.get(asset["assetId"])
        if override:
            merged.append(manifest_module.apply_overrides(asset, override))
            applied += 1
        else:
            merged.append(asset)
    print(f"overrides  {applied} applied from {config.paths.overrides.name if config.paths.overrides.exists() else '(no override file)'}")
    return merged, overrides, issues


def stage_approval(config: PipelineConfig, assets: list[dict[str, Any]]):
    """Applies the library approval policy, after the overrides have had theirs.

    Order matters and is the whole reason this is its own stage: an override
    that approves one asset by name is a curator's judgement about that file,
    and it has to already be on the record before the blanket policy runs, or
    the policy would relabel it as its own weaker claim.
    """
    approval, issues = manifest_module.load_approval(config.paths.approval)
    approved_here = manifest_module.apply_approval(assets, approval)
    total = sum(1 for asset in assets if asset["review"].get("approved"))
    if approval.get("policy") == "approve-all":
        excluded = len(approval.get("excludedAssetIds") or [])
        print(
            f"approval   {total} of {len(assets)} approved "
            f"({approved_here} by library policy, {total - approved_here} by curator"
            + (f", {excluded} excluded" if excluded else "")
            + ")"
        )
    else:
        print(f"approval   {total} of {len(assets)} approved (no library policy; curator entries only)")
    return assets, approval, issues


def duplicate_groups(found: list[Discovered]) -> list[list[str]]:
    by_hash: dict[str, list[str]] = defaultdict(list)
    for item in found:
        by_hash[item.content_hash].append(item.relative_path)
    return [sorted(paths) for paths in by_hash.values() if len(paths) > 1]


def run(config: PipelineConfig, jobs: int, write_html: bool, strict: bool) -> int:
    if not ffmpeg_available():
        print("note       ffmpeg not found; .m4a/.aac assets would be skipped with a named error")

    found, skipped = stage_scan(config)
    if not found:
        return 0

    assets, failures = stage_analyze(config, found, jobs)
    assets, overrides, override_issues = stage_overrides(config, assets)
    assets, _approval, approval_issues = stage_approval(config, assets)

    issues = [
        *override_issues,
        *approval_issues,
        *manifest_module.validate(assets, overrides, config.paths.source),
    ]
    fatal = [issue for issue in issues if issue.fatal]
    warnings = [issue for issue in issues if not issue.fatal]

    duplicates = duplicate_groups(found)
    conflicts = [a for a in assets if a["_hints"].get("noteConflict")]

    summary = report_module.summarise(
        assets,
        {
            "analysisFailures": len(failures),
            "duplicateGroups": len(duplicates),
            "ignoredFiles": len(skipped),
            "filenameNoteConflicts": len(conflicts),
        },
    )

    # Strip the private working fields before the manifest is written: they are
    # for the report and the curator, not part of the runtime contract.
    public = []
    for asset in assets:
        clean = {k: v for k, v in asset.items() if not k.startswith("_")}
        public.append(clean)

    manifest_module.write_json(config.paths.manifest, manifest_module.build(public, summary))

    # The app's types come out of the same run that writes the manifest, from the
    # same schema, so the two cannot be out of step with each other (§25). Emitted
    # here rather than in a separate command precisely because a separate command
    # is one somebody forgets to run.
    types_changed = emit_ts.write(config.paths.types, config.analysis.duration_bands)
    manifest_module.write_json(
        config.paths.report_json,
        {
            "summary": summary,
            "duplicates": duplicates,
            "analysisFailures": failures,
            "filenameNoteConflicts": [
                {"assetId": a["assetId"], "path": a["source"]["relativePath"], "detail": a["_hints"]["noteConflict"]}
                for a in conflicts
            ],
            "issues": [{"fatal": i.fatal, "assetId": i.assetId, "message": i.message} for i in issues],
        },
    )
    report_module.write_text(config.paths.generated / "organic_audio_report.txt", report_module.render_text(summary))
    if write_html:
        report_module.write_text(
            config.paths.report_html, report_module.render_html(summary, assets, config.paths.source)
        )

    print()
    print(report_module.render_text(summary))
    print(f"manifest   {config.paths.manifest}")
    print(f"types      {config.paths.types}{'' if types_changed else '  (unchanged)'}")
    print(f"report     {config.paths.report_json}")
    if write_html:
        print(f"           {config.paths.report_html}")
    print()
    print(f"validate   {len(fatal)} errors, {len(warnings)} warnings")
    for issue in fatal[:20]:
        print("  " + issue.render())
    if len(fatal) > 20:
        print(f"  ... and {len(fatal) - 20} more")

    if fatal:
        return 1
    if strict and warnings:
        return 1
    return 0


def stage_derive(config: PipelineConfig, codec: str, approved_only: bool) -> int:
    """Writes compressed runtime copies of the manifest's assets.

    Reads the committed manifest rather than re-scanning, so a derivative always
    corresponds to an asset the app actually knows about, and skips anything
    already written at the right size — re-running is cheap.
    """
    manifest_path = config.paths.manifest
    if not manifest_path.exists():
        print(f"derive     no manifest at {manifest_path} — run `all` first")
        return 1

    manifest = json.loads(manifest_path.read_text())
    assets = manifest.get("assets", [])
    if approved_only:
        assets = [asset for asset in assets if asset["review"]["approved"]]
        print(f"derive     {len(assets)} approved of {len(manifest.get('assets', []))}")
        if not assets:
            print("           nothing is approved yet, so there is nothing to ship")
            return 0

    extension = CODECS[codec][0]
    out_root = config.paths.root / "generated" / "audio" / "runtime" / codec
    source_bytes = derived_bytes = 0
    written = skipped = failed = 0

    for index, asset in enumerate(assets, start=1):
        source = config.paths.source / asset["source"]["relativePath"]
        target = out_root / (asset["assetId"] + extension)
        source_bytes += asset["source"]["bytes"]
        if target.exists() and target.stat().st_size > 0:
            derived_bytes += target.stat().st_size
            skipped += 1
            continue
        try:
            derived_bytes += transcode(source, target, codec)
            written += 1
        except Exception as error:  # noqa: BLE001 — reported, never fatal
            failed += 1
            print(f"           FAILED {asset['assetId']} ({asset['source']['filename']}): {error}")
        if index % 50 == 0 or index == len(assets):
            print(f"           {index}/{len(assets)}")

    print(f"derive     {written} written, {skipped} already present, {failed} failed")
    if derived_bytes:
        print(
            f"           {source_bytes / 1e6:.0f} MB source -> {derived_bytes / 1e6:.0f} MB {codec} "
            f"({source_bytes / derived_bytes:.0f}x smaller)"
        )
    print(f"           {out_root}")
    return 1 if failed else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "command",
        nargs="?",
        default="all",
        choices=["scan", "analyze", "validate", "build-manifest", "report", "derive", "all"],
    )
    parser.add_argument("--source", type=Path, help="source tree to scan (default: the configured library)")
    parser.add_argument("--jobs", type=int, default=0, help="worker processes (default: one per CPU)")
    parser.add_argument("--no-html", action="store_true", help="skip the HTML curation report")
    parser.add_argument("--strict", action="store_true", help="treat warnings as failures")
    parser.add_argument("--codec", default="vorbis", choices=sorted(CODECS), help="derivative codec")
    parser.add_argument(
        "--all-assets",
        action="store_true",
        help="derive every asset rather than only the approved ones",
    )
    args = parser.parse_args()

    root = repo_root()
    paths = default_paths(root)
    if args.source:
        paths.source = args.source.resolve()
    config = PipelineConfig(paths=paths)

    jobs = args.jobs or None
    if args.command == "derive":
        return stage_derive(config, args.codec, approved_only=not args.all_assets)

    if args.command == "scan":
        found, skipped = stage_scan(config)
        duplicates = duplicate_groups(found)
        if duplicates:
            print(f"           {len(duplicates)} groups of identical files")
            for group in duplicates[:10]:
                print("             " + " == ".join(group))
        return 0

    return run(config, jobs, write_html=not args.no_html, strict=args.strict)


if __name__ == "__main__":
    raise SystemExit(main())
