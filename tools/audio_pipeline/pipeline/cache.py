"""Analysis cache (§32).

Keyed by content hash *and* analysis version. Content answers "is this the same
audio"; the version answers "would this code still produce the same numbers".
Either changing invalidates the entry, which is what makes it safe to keep a
cache across a change to the measuring code.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schema import ANALYSIS_VERSION


class AnalysisCache:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._entries: dict[str, Any] = {}
        self.hits = 0
        self.misses = 0
        if path.exists():
            try:
                stored = json.loads(path.read_text())
                if stored.get("analysisVersion") == ANALYSIS_VERSION:
                    self._entries = stored.get("entries", {})
            except (json.JSONDecodeError, OSError):
                # A damaged cache is a performance problem, not a correctness
                # one: drop it and measure everything again.
                self._entries = {}

    def get(self, content_hash: str) -> dict[str, Any] | None:
        entry = self._entries.get(content_hash)
        if entry is None:
            self.misses += 1
            return None
        self.hits += 1
        return entry

    def put(self, content_hash: str, payload: dict[str, Any]) -> None:
        self._entries[content_hash] = payload

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(
                {"analysisVersion": ANALYSIS_VERSION, "entries": dict(sorted(self._entries.items()))},
                indent=2,
                sort_keys=True,
            )
            + "\n"
        )
