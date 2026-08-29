"""Putting the runtime derivatives where the app can actually reach them.

`derive` produces one compressed copy per asset under `generated/`, which is
the right place for a build artefact and the wrong place for something Metro
has to bundle: Metro bundles what is *referenced*, and nothing in the app
references a directory.

So this stage does two things and neither is clever. It copies the derivatives
into the app's own asset tree, and it writes a TypeScript module holding one
`require()` per asset. The requires are what make the files real to the
bundler — on device they end up in the binary, on web Metro emits each as a
separate file the page fetches on demand.

**Why a generated file and not a directory walk.** `require()` takes a literal
in every React Native bundler there is; a computed path resolves to nothing and
fails at runtime with an unhelpful message. 369 literals is not a thing to type,
so it is a thing to generate — from the manifest, so the map cannot contain an
asset the library does not have, or miss one it does.

**Why the ids and not the vendor's filenames.** §44: a filename is the one piece
of vendor metadata that must not reach the runtime. The derivative is named for
its content-derived asset id, and so is everything downstream of it.
"""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

HEADER = """/**
 * AUTO-GENERATED — DO NOT EDIT DIRECTLY.
 *
 * Emitted by `tools/audio_pipeline/pipeline/bundle.py`. To change anything
 * here, change that and run:
 *
 *     python3 tools/audio_pipeline/index_audio.py bundle
 *
 * One `require()` per approved asset, keyed by asset id. The literal paths are
 * the point: a bundler resolves `require()` at build time and a computed path
 * resolves to nothing, so this file is what makes the audio exist in the app at
 * all. It is generated from the manifest, so it cannot name an asset the
 * library does not have or miss one it does.
 */

/*
 * `require()` is not a style choice here and cannot be an import: a bundler
 * resolves these at build time to produce the asset files, and `import` of a
 * non-module asset is not the same operation. The rule is disabled for this
 * file only, in the generator, so regenerating cannot quietly drop it.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

/** What a bundler hands back for an asset — a module id on native, a URL on web. */
export type BundledAssetModule = number | string | { uri: string };

"""


@dataclass
class BundleResult:
    copied: int
    skipped: int
    removed: int
    total_bytes: int
    map_path: Path
    asset_dir: Path


def bundle(
    assets: list[dict[str, Any]],
    derivative_dir: Path,
    asset_dir: Path,
    map_path: Path,
    extension: str,
    approved_only: bool = True,
) -> tuple[BundleResult, list[str]]:
    """Copies derivatives into the app tree and writes the require map.

    Returns the result and a list of asset ids that have no derivative, which
    the caller reports: an approved asset with nothing to play is a hole in the
    library, not a detail.
    """
    wanted = [a for a in assets if a["review"].get("approved")] if approved_only else list(assets)
    wanted.sort(key=lambda a: a["assetId"])

    asset_dir.mkdir(parents=True, exist_ok=True)
    expected = {f"{a['assetId']}{extension}" for a in wanted}

    # Anything the app tree holds that the library no longer approves is stale.
    # Left behind it would be bundled into the binary and never referenced.
    removed = 0
    for existing in asset_dir.iterdir():
        if existing.is_file() and existing.name not in expected:
            existing.unlink()
            removed += 1

    copied = skipped = total = 0
    missing: list[str] = []
    entries: list[tuple[str, str]] = []
    for asset in wanted:
        asset_id = asset["assetId"]
        source = derivative_dir / f"{asset_id}{extension}"
        if not source.exists():
            missing.append(asset_id)
            continue
        target = asset_dir / source.name
        # Size is enough to spot a re-encode: the transcode is deterministic, so
        # an unchanged source produces a byte-identical derivative.
        if target.exists() and target.stat().st_size == source.stat().st_size:
            skipped += 1
        else:
            shutil.copy2(source, target)
            copied += 1
        total += source.stat().st_size
        entries.append((asset_id, source.name))

    relative = _relative_import(map_path.parent, asset_dir)
    lines = [HEADER, "export const BUNDLED_ASSETS: Record<string, BundledAssetModule> = {\n"]
    for asset_id, filename in entries:
        lines.append(f"  '{asset_id}': require('{relative}/{filename}'),\n")
    lines.append("};\n\n")
    lines.append(
        "/** How many assets this build carries. Asserted in tests against the manifest. */\n"
        f"export const BUNDLED_ASSET_COUNT = {len(entries)};\n\n"
        "/** The container every bundled asset is in. */\n"
        f"export const BUNDLED_ASSET_EXTENSION = '{extension}';\n"
    )
    map_path.parent.mkdir(parents=True, exist_ok=True)
    map_path.write_text("".join(lines))

    return BundleResult(copied, skipped, removed, total, map_path, asset_dir), missing


def _relative_import(from_dir: Path, to_dir: Path) -> str:
    """A POSIX relative specifier, always starting with `./` or `../`."""
    import os

    rel = os.path.relpath(to_dir, from_dir).replace(os.sep, "/")
    return rel if rel.startswith(".") else f"./{rel}"
