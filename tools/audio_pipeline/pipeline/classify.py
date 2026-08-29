"""Turning measurements and filenames into instrument, roles and tags.

Rule-based, as §19 permits. The rules are readable and every one of them is
overridable by a curator, which matters more here than sophistication: a wrong
guess a human can see and correct beats a right guess nobody can explain.

The ordering principle throughout is that **the directory and the filename are
hints, and the audio is evidence** (§18). Where the two disagree the disagreement
is recorded rather than silently resolved, so the report can show a curator
exactly which files need a human decision.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from .config import AnalysisConfig
from .schema import PITCH_CLASSES, duration_class

# ---------------------------------------------------------------------------
# Filename and directory hints (§18)
# ---------------------------------------------------------------------------

# Longest first: `tuning_fork` must win over `fork`, and `singing_bowl` over
# `bowl`, or a specific name loses to a generic substring of itself.
INSTRUMENT_TOKENS: tuple[tuple[str, str], ...] = (
    ("tuning_fork", "TUNING_FORK"),
    ("tuning fork", "TUNING_FORK"),
    ("singing_bowl", "SINGING_BOWL"),
    ("tuning_forks", "TUNING_FORK"),
    ("koshi", "CHIME"),
    ("kalimba", "KALIMBA"),
    ("kailani", "CHIME"),
    ("chime", "CHIME"),
    ("forks", "TUNING_FORK"),
    ("fork", "TUNING_FORK"),
    ("bowls", "SINGING_BOWL"),
    ("bowl", "SINGING_BOWL"),
    ("bells", "BELL"),
    ("bell", "BELL"),
    ("drone", "DRONE"),
    ("texture", "TEXTURE"),
    ("ambient", "AMBIENT"),
    ("pad", "AMBIENT"),
)

# A trailing note name: `..._Ab.wav`, `..._C#.wav`, `..._G.wav`. Anchored to the
# end because `_A` in the middle of a word is not a note.
NOTE_SUFFIX = re.compile(r"_([A-G][#b]?)$")
# An explicit frequency in the name, as the tuning forks carry: `128hz`.
HZ_TOKEN = re.compile(r"(\d{2,5})\s*hz", re.IGNORECASE)
# Loop libraries carry tempo as a path or name segment: `.../Kalimba/90/...`.
BPM_TOKEN = re.compile(r"(?:^|_)(\d{2,3})(?:_|$)")

ELEMENTS = ("air", "earth", "fire", "water")


# Path segments that mean the file is a musical passage rather than one sound.
PASSAGE_SEGMENTS = ("loops", "phrase", "phrases", "multiple_notes", "double_hits")


@dataclass
class Hints:
    """What the name and the folder claim, before any audio is examined."""

    instrument: str | None = None
    #: The path segment the instrument was read from, for the report.
    instrument_source: str | None = None
    note: str | None = None
    #: What the note in the filename is *about*. A single strike is named after
    #: its own pitch; a loop or a phrase is named after its key. Comparing a
    #: measured fundamental against the second kind is a category error — see
    #: `note_is_comparable`.
    note_kind: str | None = None
    hz: float | None = None
    bpm: int | None = None
    loop: bool = False
    words: tuple[str, ...] = ()
    element: str | None = None

    def as_json(self) -> dict[str, Any]:
        return {
            "instrument": self.instrument,
            "note": self.note,
            "hz": self.hz,
            "bpm": self.bpm,
            "loop": self.loop,
            "element": self.element,
            "instrumentSource": self.instrument_source,
            "noteKind": self.note_kind,
        }

    @property
    def note_is_comparable(self) -> bool:
        """True when the filename's note can be checked against measurement.

        Measured against this library: filename and measurement agree on 72% of
        single notes, 46% of hits, 40% of phrases and 12% of loops. That
        gradient is not 151 mislabelled files — it is the word `_A` meaning two
        different things. On a single strike it names the pitch of that sound.
        On a loop it names the key of a passage, whose strongest partial is
        routinely the fifth or the third instead. Only the first is a claim this
        pipeline can check (§18).
        """
        return self.note is not None and self.note_kind == "note"


def read_hints(relative_path: str) -> Hints:
    lowered = relative_path.lower()
    stem = relative_path.rsplit("/", 1)[-1].rsplit(".", 1)[0]

    instrument, instrument_source = _instrument_from_path(relative_path)

    note = None
    match = NOTE_SUFFIX.search(stem)
    if match:
        candidate = match.group(1)
        normalised = candidate.replace("b", "b")
        if normalised in PITCH_CLASSES or _flat_to_sharp(normalised) in PITCH_CLASSES:
            note = _flat_to_sharp(normalised)

    hz = None
    hz_match = HZ_TOKEN.search(stem)
    if hz_match:
        value = float(hz_match.group(1))
        if 20.0 <= value <= 20000.0:
            hz = value

    # `Loops/` in the path is the library's own statement that a file is meant
    # to repeat. That is a stronger claim than anything measurable, so it is
    # taken as the hint and confirmed against duration later.
    loop = "/loops/" in f"/{lowered}"
    segments = [segment.lower() for segment in relative_path.split("/") if segment]
    passage = loop or any(any(word in segment for word in PASSAGE_SEGMENTS) for segment in segments)
    note_kind = None if note is None else ("key" if passage else "note")

    bpm = None
    for segment in lowered.split("/"):
        bpm_match = BPM_TOKEN.search(segment)
        if bpm_match:
            value = int(bpm_match.group(1))
            if 40 <= value <= 200:
                bpm = value
                break

    element = next((name for name in ELEMENTS if f"_{name}_" in f"_{lowered}_" or f"/{name}/" in f"/{lowered}"), None)

    words = tuple(part for part in re.split(r"[^a-z0-9#]+", lowered) if part)
    return Hints(
        instrument=instrument,
        instrument_source=instrument_source,
        note=note,
        note_kind=note_kind,
        hz=hz,
        bpm=bpm,
        loop=loop,
        words=words,
        element=element,
    )


def _instrument_from_path(relative_path: str) -> tuple[str | None, str | None]:
    """Reads the instrument from the path, nearest the file first.

    Scanning the whole path as one string does not work, and the way it fails is
    instructive: this library's own root folder is called
    `Healing_Sounds_-_Bells_&_Chimes`, so every one of the 369 paths contains
    both "bells" and "chimes". A substring search over the full path classified
    all 369 assets from the vendor's folder name — 259 chimes, no bells, no
    bowls at all — while the real answer was sitting two directories further
    down in `One_Shots/Bowls/`.

    So each path segment is examined on its own, from the filename outwards. The
    segment closest to the file is the most specific statement anybody made
    about it, and a folder six levels up is the least. Within a single segment
    the token order decides, which is what lets `koshi` win over `bells` for a
    Koshi chime whose filename says both.
    """
    segments = [segment.lower() for segment in relative_path.split("/") if segment]
    for segment in reversed(segments):
        for token, value in INSTRUMENT_TOKENS:
            if token in segment:
                return value, segment
    return None, None


def _flat_to_sharp(name: str) -> str:
    return {
        "Ab": "G#", "Bb": "A#", "Db": "C#", "Eb": "D#", "Gb": "F#",
    }.get(name, name)


# ---------------------------------------------------------------------------
# Instrument (§19)
# ---------------------------------------------------------------------------

def choose_instrument(hints: Hints, spectral: dict[str, Any], seconds: float) -> tuple[str, str]:
    """Returns the instrument and a one-line reason.

    The reason is carried into the report so a curator reviewing hundreds of
    rows can see *why* something was classified, and correct the rule rather
    than the row when the rule is what is wrong.
    """
    if hints.instrument:
        return hints.instrument, f"named by path segment '{hints.instrument_source}'"

    transient = spectral.get("transientStrength")
    brightness = spectral.get("brightness")
    decay = spectral.get("decaySeconds")

    # Nothing in the name: fall back to what the audio sounds like. These
    # thresholds are deliberately coarse — the point is to sort the unlabelled
    # remainder into something a human can review, not to be clever.
    if seconds >= 60.0 and (transient is None or transient < 0.2):
        return "AMBIENT", "over a minute long with no sharp attack"
    if transient is not None and transient > 0.5 and seconds < 6.0:
        if brightness is not None and brightness > 0.55:
            return "CHIME", "short, bright and sharply struck"
        return "BELL", "short and sharply struck"
    if decay is not None and decay > 12.0:
        return "SINGING_BOWL", "long ringing decay"
    return "UNKNOWN", "no name hint and no decisive acoustic signature"


# ---------------------------------------------------------------------------
# Roles (§10)
# ---------------------------------------------------------------------------

ROLES_BY_DURATION: dict[str, tuple[str, ...]] = {
    "MICRO": ("ACCENT", "TRANSITION", "DETAIL"),
    "SHORT": ("ACCENT", "BELL_STRIKE"),
    "MEDIUM": ("FOREGROUND_GESTURE", "RESONANT_HIT", "SECONDARY_LAYER"),
    "LONG": ("PRIMARY_BOWL", "LONG_RESONANCE", "MAJOR_EVENT"),
    "EXTENDED": ("BED", "EXTENDED_TEXTURE", "LONG_PERFORMANCE"),
}


def suggest_roles(instrument: str, seconds: float, config: AnalysisConfig, hints: Hints) -> list[str]:
    band = duration_class(seconds, config.duration_bands)
    roles = list(ROLES_BY_DURATION[band])

    # The duration bands give the shape of the role; the instrument corrects the
    # name of it. A short chime is a CHIME_STRIKE rather than a BELL_STRIKE, and
    # a long bowl phrase is a PRIMARY_BOWL rather than a generic long event.
    if band in {"SHORT", "MICRO"}:
        if instrument == "CHIME":
            roles = ["CHIME_STRIKE", *[r for r in roles if r != "BELL_STRIKE"]]
        elif instrument == "TUNING_FORK":
            roles = ["FORK_EVENT", *[r for r in roles if r != "BELL_STRIKE"]]
        elif instrument not in {"BELL", "UNKNOWN"}:
            roles = [r for r in roles if r != "BELL_STRIKE"]
    if band == "MEDIUM" and instrument == "KALIMBA":
        roles.insert(0, "PHRASE")
    if band in {"LONG", "EXTENDED"} and instrument != "SINGING_BOWL":
        roles = [r for r in roles if r != "PRIMARY_BOWL"]
        if "LONG_RESONANCE" not in roles:
            roles.append("LONG_RESONANCE")

    seen: list[str] = []
    for role in roles:
        if role not in seen:
            seen.append(role)
    return seen


# ---------------------------------------------------------------------------
# Character tags (§20)
# ---------------------------------------------------------------------------

def suggest_tags(spectral: dict[str, Any], levels: dict[str, Any], seconds: float, hints: Hints) -> list[str]:
    tags: list[str] = []
    brightness = spectral.get("brightness")
    centroid = spectral.get("spectralCentroidHz")
    decay = spectral.get("decaySeconds")
    transient = spectral.get("transientStrength")
    tonality = spectral.get("tonality")

    if brightness is not None:
        if brightness < 0.28:
            tags += ["dark", "deep", "warm"]
        elif brightness < 0.45:
            tags.append("warm")
        elif brightness > 0.72:
            tags += ["bright", "airy", "shimmering"]
        elif brightness > 0.58:
            tags.append("bright")

    if centroid is not None:
        tags.append("low" if centroid < 500 else "high" if centroid > 2500 else "mid")

    if decay is not None:
        tags.append("short_decay" if decay < 1.5 else "long_decay" if decay > 8.0 else "medium_decay")

    if transient is not None:
        tags.append("percussive" if transient > 0.45 else "smooth" if transient < 0.12 else "gentle")

    if seconds >= 20.0:
        tags.append("sustained")
    if tonality == "TONAL":
        tags.append("tonal")
    elif tonality in {"INHARMONIC", "ATONAL"}:
        tags.append("inharmonic")

    # A struck metal instrument is metallic whatever the spectrum says; this is
    # the one place a name hint adds something measurement cannot.
    if hints.instrument in {"BELL", "CHIME", "TUNING_FORK", "SINGING_BOWL"}:
        tags.append("metallic")

    peak = levels.get("peakDbFS")
    if peak is not None and peak < -20.0:
        tags.append("gentle")
    elif peak is not None and peak > -3.0:
        tags.append("strong")

    seen: list[str] = []
    for tag in tags:
        if tag not in seen:
            seen.append(tag)
    return seen


# ---------------------------------------------------------------------------
# Runtime hints (§23)
# ---------------------------------------------------------------------------

# Roughly 10 MB decoded as float32 stereo at 48 kHz — about 27 seconds. Past
# that, holding every asset resident stops being reasonable on a phone, which is
# the whole reason §23 exists.
PRELOAD_LIMIT_SECONDS = 27.0


def runtime_hints(seconds: float, instrument: str, hints: Hints, spectral: dict[str, Any]) -> dict[str, Any]:
    preload = seconds <= PRELOAD_LIMIT_SECONDS
    transient = spectral.get("transientStrength") or 0.0
    return {
        "streamingRecommended": not preload,
        "preloadRecommended": preload,
        # Only the library's own `Loops/` folders claim to loop. Nothing here
        # tries to infer loopability from the audio: a seamless loop point is a
        # property of how a file was produced, and guessing wrong produces an
        # audible click on every repeat.
        "loopable": hints.loop,
        # Sharp attacks stack badly. Capping the voices for percussive material
        # is what later stops three hard bells landing together (§12).
        "maxRecommendedVoices": 1 if transient > 0.6 else 2 if transient > 0.3 else 4,
    }
