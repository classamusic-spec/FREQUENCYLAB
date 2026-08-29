"""Finding source assets, and giving each a stable identity.

Two rules shape this module.

Source files are authoritative and are never written to (§5); discovery opens
them read-only and everything downstream works from a decoded copy in memory.

And identity is derived from *content*, not from where a file happens to sit
(§7). A curator who reorganises `Bowls/` into `Bowls/Tibetan/` has not created
new assets, and their approvals and overrides must survive the move. The cost of
that choice is stated plainly in `asset_id`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from .config import PipelineConfig
from .schema import SUPPORTED_EXTENSIONS

# 48 bits. With a library in the hundreds the chance of two assets colliding is
# about one in a billion, and `validate` checks uniqueness regardless — but a
# collision would silently merge two identities, so the margin is worth the
# four extra characters.
ID_HASH_CHARS = 12


@dataclass
class Discovered:
    path: Path
    relative_path: str
    content_hash: str
    bytes_: int
    extension: str


def _is_ignored(path: Path, config: PipelineConfig) -> bool:
    if path.name.startswith("."):
        return True
    if path.name.startswith("~") or path.name.endswith(".tmp"):
        return True
    # AppleDouble sidecars and Windows metadata travel with licensed libraries
    # constantly and are not audio.
    if path.name in {"Thumbs.db", "desktop.ini"} or path.name.startswith("._"):
        return True
    return any(part in config.ignored_directories for part in path.parts)


def sha256_file(path: Path) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
    return digest.hexdigest(), size


def asset_id(content_hash: str) -> str:
    """A stable id for a piece of audio.

    Content-derived rather than sequential or name-derived, which is what makes
    it survive a rename and change when the audio itself is replaced — both
    required by §7.

    The spec's own example, `organic.bowl.0001`, couples identity to two things
    that legitimately change: the classifier's opinion of the instrument, and
    the position of the file in a sorted list. Either would silently orphan a
    curator's overrides. This scheme keeps the id fixed and puts the readable
    part in `label`, which reports and logs use.
    """
    return f"organic.{content_hash[:ID_HASH_CHARS]}"


def discover(config: PipelineConfig) -> tuple[list[Discovered], list[Path]]:
    """Walks the source tree. Returns the audio it found and the files it skipped.

    Skipped files are returned rather than dropped so the report can say what
    was ignored — a library arriving with 40 `.asd` sidecars should read as 40
    ignored files, not as a silently smaller library.
    """
    root = config.paths.source
    if not root.exists():
        return [], []

    found: list[Discovered] = []
    skipped: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if _is_ignored(relative, config):
            continue
        extension = path.suffix.lower()
        if extension not in SUPPORTED_EXTENSIONS:
            skipped.append(path)
            continue
        # A symlink pointing outside the source tree is the one way a scan can
        # be talked into reading somewhere it should not (§57).
        resolved = path.resolve()
        if not str(resolved).startswith(str(root.resolve())):
            skipped.append(path)
            continue
        content_hash, size = sha256_file(path)
        found.append(
            Discovered(
                path=path,
                relative_path=relative.as_posix(),
                content_hash=content_hash,
                bytes_=size,
                extension=extension,
            )
        )
    return found, skipped
