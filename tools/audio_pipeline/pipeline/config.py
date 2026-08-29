"""Where things live, and the knobs that are meant to be turned."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .schema import DEFAULT_DURATION_BANDS, DurationBand

# Directory names that never contain source material, whatever they hold.
IGNORED_DIRECTORIES = frozenset({
    ".git", ".svn", "node_modules", "__pycache__", ".cache", "cache",
    "processed", "derivatives", "generated", "build", "dist", ".vercel",
    ".expo", "venv", ".venv",
})


@dataclass
class Paths:
    root: Path
    source: Path
    metadata: Path
    generated: Path

    @property
    def overrides(self) -> Path:
        return self.metadata / "organic_audio_overrides.json"

    @property
    def approval(self) -> Path:
        return self.metadata / "organic_audio_approval.json"

    @property
    def cache(self) -> Path:
        return self.generated / "organic_audio_analysis_cache.json"

    @property
    def manifest(self) -> Path:
        return self.generated / "organic_audio_manifest.json"

    @property
    def report_json(self) -> Path:
        return self.generated / "organic_audio_report.json"

    @property
    def report_html(self) -> Path:
        return self.generated / "organic_audio_report.html"

    @property
    def types(self) -> Path:
        return self.root / "packages" / "dsp-core" / "src" / "organic" / "manifest.generated.ts"


# Where the licensed library actually sits.
#
# §2 suggests `assets/audio/organic/source/`, and the library arrived at a
# vendor-named path instead. Moving 1.5 GB of binaries would rewrite git history
# for every one of them to buy a tidier tree, so the scanner is pointed at where
# they are rather than the other way round — which is also what §2 asks for when
# it says to inspect the existing architecture first and not to require assets
# to be perfectly arranged. `--source` overrides it, and a second pack can be
# added by listing another root here.
LIBRARY_SOURCES: tuple[Path, ...] = (
    Path("Healing Sounds - Bells & Chimes"),
    Path("Water and Aquatic Bible"),
)

#: Fallback when none of the named packs is present.
FALLBACK_SOURCE = Path("assets/audio/organic/source")


def library_roots(root: Path) -> list[Path]:
    """The packs that are actually on disk, in the order they are listed.

    Order matters only for reading a report: asset ids are content-derived, so
    a pack arriving or leaving never renumbers anything else.
    """
    present = [root / pack for pack in LIBRARY_SOURCES if (root / pack).exists()]
    if present:
        return present
    fallback = root / FALLBACK_SOURCE
    return [fallback] if fallback.exists() else []


def default_paths(root: Path) -> Paths:
    # `source` is the repository root once there is more than one pack, because
    # a `relativePath` in the manifest is now pack-qualified — `derive`, `bundle`
    # and the validator all resolve `source / relativePath`, and that only works
    # if the two halves agree about where the pack name lives.
    return Paths(
        root=root,
        source=root,
        metadata=root / "assets" / "audio" / "organic" / "metadata",
        generated=root / "generated" / "audio",
    )


@dataclass
class AnalysisConfig:
    """Thresholds the analysis uses. Every one is a judgement call, so every one
    is named and adjustable rather than buried as a literal."""

    duration_bands: tuple[DurationBand, ...] = DEFAULT_DURATION_BANDS

    # A frame quieter than this is treated as silence when measuring lead-in and
    # tail. Deliberately low: a singing bowl's tail is very quiet and very much
    # not dead air, and trimming it would be the single most destructive thing
    # this pipeline could get wrong (§13).
    silence_floor_db: float = -60.0
    # The tail has to stay below the floor for this long before it counts as
    # silence rather than as a dip between partials.
    silence_hold_seconds: float = 0.25

    # Decay is measured as the time from the peak until the envelope has fallen
    # by this much — a T60-style figure, reported honestly as an estimate.
    decay_drop_db: float = 60.0

    # Pitch below this confidence is reported as unknown rather than guessed.
    # Bells and bowls are frequently inharmonic and a confident wrong note is
    # worse than an honest blank (§14).
    pitch_confidence_floor: float = 0.55
    pitch_min_hz: float = 30.0
    pitch_max_hz: float = 4200.0

    # Brightness maps spectral centroid onto 0..1 across this range, which spans
    # a deep bowl to a bright chime.
    brightness_min_hz: float = 150.0
    brightness_max_hz: float = 6000.0

    # Target for the recommended playback trim. Not a normalisation target: the
    # gain is a suggestion the mixer may use to bring assets into a sensible
    # relationship while keeping their natural dynamics (§11).
    target_lufs: float = -23.0
    max_gain_db: float = 12.0
    min_gain_db: float = -18.0

    resonant_peak_count: int = 6
    analysis_sample_rate: int = 22050


@dataclass
class PipelineConfig:
    paths: Paths
    analysis: AnalysisConfig = field(default_factory=AnalysisConfig)
    ignored_directories: frozenset[str] = IGNORED_DIRECTORIES
