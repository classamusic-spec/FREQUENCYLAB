"""Measuring an asset.

Everything expensive happens here, once, offline, and is cached against the
content hash (§32, §50). The runtime never repeats any of it.

The measurements are deliberately conservative. Several of them are estimates of
things that do not have exact answers for this material — a singing bowl has no
single pitch, and where its decay "ends" is a judgement — so each one reports a
confidence or is allowed to come back `None`. A blank field is a fact about the
audio; a fabricated number is not (§14).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .config import AnalysisConfig
from .decode import Decoded
from .schema import PITCH_CLASSES

try:
    import pyloudnorm

    _HAS_LOUDNORM = True
except Exception:  # pragma: no cover - optional dependency
    _HAS_LOUDNORM = False

EPSILON = 1e-12
A4_HZ = 440.0
#: Harmonics beyond this are too densely spaced to be evidence. See `_estimate_pitch`.
MAX_HARMONIC = 8


def _db(value: float) -> float | None:
    if value <= EPSILON:
        return None
    return float(20.0 * math.log10(value))


@dataclass
class Analysis:
    levels: dict[str, Any] = field(default_factory=dict)
    timing: dict[str, Any] = field(default_factory=dict)
    spectral: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Levels (§11)
# ---------------------------------------------------------------------------

def measure_levels(decoded: Decoded, config: AnalysisConfig) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    mono = decoded.mono
    peak = float(np.max(np.abs(decoded.samples))) if decoded.samples.size else 0.0
    rms = float(np.sqrt(np.mean(np.square(mono)))) if mono.size else 0.0

    integrated: float | None = None
    if _HAS_LOUDNORM and decoded.duration_seconds >= 0.4:
        try:
            meter = pyloudnorm.Meter(decoded.sample_rate)
            measured = meter.integrated_loudness(decoded.samples)
            if math.isfinite(measured):
                integrated = float(measured)
        except Exception as error:  # noqa: BLE001
            warnings.append(f"loudness measurement failed ({error})")
    elif not _HAS_LOUDNORM:
        warnings.append("pyloudnorm is not installed, so integrated LUFS is unavailable")
    else:
        # EBU R128 needs a 400 ms block. Shorter than that there is nothing to
        # integrate, and reporting a number anyway would be inventing one.
        warnings.append("shorter than one loudness block, so integrated LUFS is not measurable")

    # A suggestion, not a normalisation. Assets keep their natural dynamics: the
    # gain only says what would bring this asset into a sensible relationship
    # with the rest of the library if a mixer chooses to use it (§11).
    recommended: float | None = None
    if integrated is not None:
        recommended = float(
            np.clip(config.target_lufs - integrated, config.min_gain_db, config.max_gain_db)
        )

    return (
        {
            "peakDbFS": _db(peak),
            "truePeakDbFS": _true_peak_db(decoded),
            "rmsDbFS": _db(rms),
            "integratedLufs": integrated,
            "recommendedGainDb": recommended,
        },
        warnings,
    )


def _true_peak_db(decoded: Decoded) -> float | None:
    """Inter-sample peak, by oversampling around the loudest moments.

    Sample peak misses what a converter actually produces between samples, which
    is how an asset measuring -0.1 dBFS clips on playback.

    Only the neighbourhoods of the highest sample peaks are oversampled, not the
    whole file. A 90-second asset is four million samples and oversampling all of
    them would cost more than the rest of the analysis put together, for a number
    that can only occur next to a sample peak in the first place.
    """
    mono = decoded.mono
    if mono.size == 0:
        return None
    if mono.size < 64:
        return _db(float(np.max(np.abs(mono))))

    magnitude = np.abs(mono)
    sample_peak = float(np.max(magnitude))
    if sample_peak <= EPSILON:
        return None

    # Every sample within 1 dB of the loudest one is a candidate; the true peak
    # cannot hide anywhere else.
    threshold = sample_peak * 10 ** (-1.0 / 20.0)
    candidates = np.nonzero(magnitude >= threshold)[0]
    if candidates.size == 0:
        return _db(sample_peak)

    # Collapse runs into a bounded number of windows so a sustained loud passage
    # does not turn into thousands of overlapping ones.
    windows: list[tuple[int, int]] = []
    span = 64
    for index in candidates:
        start = max(0, int(index) - span)
        end = min(mono.size, int(index) + span)
        if windows and start <= windows[-1][1]:
            windows[-1] = (windows[-1][0], max(windows[-1][1], end))
        else:
            windows.append((start, end))
        if len(windows) >= 48:
            break

    best = sample_peak
    for start, end in windows:
        chunk = mono[start:end].astype(np.float64)
        if chunk.size < 8:
            continue
        # Zero-padded FFT interpolation: exact for a band-limited signal.
        spectrum = np.fft.rfft(chunk)
        upsampled = np.fft.irfft(spectrum, n=chunk.size * 4) * 4.0
        best = max(best, float(np.max(np.abs(upsampled))))
    return _db(best)


# ---------------------------------------------------------------------------
# Timing: silence and decay (§13, §17)
# ---------------------------------------------------------------------------

def _envelope(mono: np.ndarray, sample_rate: int, window_ms: float = 20.0) -> tuple[np.ndarray, int]:
    hop = max(1, int(sample_rate * window_ms / 1000.0))
    usable = (mono.size // hop) * hop
    if usable == 0:
        return np.array([float(np.sqrt(np.mean(np.square(mono))))]), hop
    frames = mono[:usable].reshape(-1, hop)
    return np.sqrt(np.mean(np.square(frames), axis=1)), hop


def measure_timing(decoded: Decoded, config: AnalysisConfig) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    mono = decoded.mono
    envelope, hop = _envelope(mono, decoded.sample_rate)
    seconds_per_frame = hop / float(decoded.sample_rate)
    floor = 10 ** (config.silence_floor_db / 20.0)
    audible = envelope > floor

    if not audible.any():
        warnings.append("never rises above the silence floor — the file may be empty")
        return (
            {
                "leadingSilenceSeconds": None,
                "trailingSilenceSeconds": None,
                "recommendedStartOffset": None,
                "recommendedEndOffset": None,
            },
            warnings,
        )

    first = int(np.argmax(audible))
    last = int(len(audible) - 1 - np.argmax(audible[::-1]))
    leading = first * seconds_per_frame
    trailing = (len(audible) - 1 - last) * seconds_per_frame

    # The tail only counts as silence once it has stayed below the floor for a
    # held stretch. A bowl's partials beat against each other and dip below any
    # fixed threshold repeatedly on the way down; without the hold, the first
    # dip would be read as the end of the sound (§13).
    hold_frames = max(1, int(config.silence_hold_seconds / seconds_per_frame))
    if trailing > 0 and (len(audible) - last - 1) < hold_frames:
        trailing = 0.0

    # Offsets are suggestions and stop short of the audio: a little of the
    # lead-in is left in place so a strike never begins mid-attack.
    start_offset = max(0.0, leading - 0.06) if leading > 0.12 else None
    end_offset = None
    if trailing > 1.0:
        end_offset = max(0.0, decoded.duration_seconds - trailing + 0.5)

    return (
        {
            "leadingSilenceSeconds": float(leading),
            "trailingSilenceSeconds": float(trailing),
            "recommendedStartOffset": None if start_offset is None else float(start_offset),
            "recommendedEndOffset": None if end_offset is None else float(end_offset),
        },
        warnings,
    )


def measure_decay(decoded: Decoded, config: AnalysisConfig) -> float | None:
    """Time from the loudest moment until the envelope has fallen `decay_drop_db`.

    Reported as an estimate. For material that fades into the noise floor of the
    recording rather than to digital silence, this returns the time to the floor
    and no more — it does not extrapolate a decay curve it cannot see.
    """
    envelope, hop = _envelope(decoded.mono, decoded.sample_rate)
    if envelope.size < 2:
        return None
    seconds_per_frame = hop / float(decoded.sample_rate)
    peak_index = int(np.argmax(envelope))
    peak = float(envelope[peak_index])
    if peak <= EPSILON:
        return None
    target = peak * (10 ** (-config.decay_drop_db / 20.0))
    tail = envelope[peak_index:]
    below = np.nonzero(tail <= target)[0]
    if below.size == 0:
        # Still audible at the end of the file: the decay is at least this long.
        return float((envelope.size - peak_index) * seconds_per_frame)
    return float(below[0] * seconds_per_frame)


def measure_transient(decoded: Decoded) -> float | None:
    """How sharply the sound arrives, 0..1.

    The ratio of the fastest rise in the envelope to the envelope's own peak: a
    struck bell reaches full level in one or two frames and scores near 1, a
    bowed bowl swells over hundreds and scores near 0. This is what later stops
    the scheduler stacking three hard attacks at once (§12).
    """
    envelope, _ = _envelope(decoded.mono, decoded.sample_rate, window_ms=10.0)
    if envelope.size < 3:
        return None
    peak = float(np.max(envelope))
    if peak <= EPSILON:
        return None
    rises = np.diff(envelope)
    fastest = float(np.max(rises)) if rises.size else 0.0
    return float(np.clip(fastest / peak, 0.0, 1.0))


# ---------------------------------------------------------------------------
# Spectrum, pitch and resonance (§14, §15, §16)
# ---------------------------------------------------------------------------

def _sustained_spectrum(decoded: Decoded) -> tuple[np.ndarray, np.ndarray]:
    """Average magnitude spectrum over the body of the sound.

    The attack is skipped: a strike's first moments are broadband noise that
    tells you nothing about which partials actually ring, and including them
    drags the centroid up and buries the resonances.
    """
    mono = decoded.mono
    if mono.size < 4096:
        padded = np.zeros(4096, dtype=np.float32)
        padded[: mono.size] = mono
        mono = padded
    envelope, hop = _envelope(mono, decoded.sample_rate, window_ms=10.0)
    peak_index = int(np.argmax(envelope)) if envelope.size else 0
    start = min(mono.size - 2048, (peak_index + 3) * hop)
    start = max(0, start)
    body = mono[start:]
    if body.size < 2048:
        body = mono[-min(2048, mono.size):]

    # 16384 points is 2.9 Hz per bin at 48 kHz, against 11.7 for a 4096 window.
    # That matters: half a bin at the coarse size is 79 cents at 128 Hz, which is
    # most of a semitone, and this pipeline is not allowed to name a note it
    # cannot actually resolve. Short assets fall back to whatever they can fill.
    window_size = 16384
    while window_size > 2048 and window_size > body.size:
        window_size //= 2
    step = window_size // 2
    windows = []
    for offset in range(0, max(1, body.size - window_size + 1), step):
        chunk = body[offset : offset + window_size]
        if chunk.size < window_size:
            break
        windows.append(np.abs(np.fft.rfft(chunk * np.hanning(window_size))))
        if len(windows) >= 64:
            break
    if not windows:
        chunk = np.zeros(window_size, dtype=np.float32)
        chunk[: min(window_size, body.size)] = body[:window_size]
        windows.append(np.abs(np.fft.rfft(chunk * np.hanning(window_size))))
    magnitude = np.mean(np.stack(windows), axis=0)
    freqs = np.fft.rfftfreq(window_size, d=1.0 / decoded.sample_rate)
    return freqs, magnitude


def _peaks(freqs: np.ndarray, magnitude: np.ndarray, count: int, min_hz: float, max_hz: float):
    """The strongest spectral peaks, located to sub-bin accuracy.

    Two corrections that matter for this material.

    The first few bins above DC are excluded. A Hanning window leaks energy from
    the DC component into its neighbours, and that leakage forms local maxima
    that look exactly like peaks — the same two "partials" turned up in every
    file measured before this guard existed, which is what gave them away.

    And each surviving peak is refined by fitting a parabola through it and its
    neighbours. A bin is a bucket, not a frequency, so a peak reported at its
    bin centre carries up to half a bin of error; at 128 Hz with a coarse window
    that is more than half a semitone, which would be enough to name the wrong
    note with high confidence.
    """
    if freqs.size < 4:
        return []
    bin_width = float(freqs[1] - freqs[0])
    # Four bins clears the window's main lobe without reaching into the range
    # where this library's real fundamentals live.
    floor_hz = max(min_hz, bin_width * 4.0)

    band = (freqs >= floor_hz) & (freqs <= max_hz)
    if not band.any():
        return []
    indices_in_band = np.nonzero(band)[0]
    start = int(indices_in_band[0])
    f = freqs[band]
    m = magnitude[band]
    if m.size < 3:
        return []

    local = (m[1:-1] > m[:-2]) & (m[1:-1] > m[2:])
    indices = np.nonzero(local)[0] + 1
    if indices.size == 0:
        return []
    strongest = indices[np.argsort(m[indices])[::-1][:count]]
    ceiling = float(np.max(m[indices])) or 1.0

    out = []
    for index in sorted(strongest, key=lambda i: f[i]):
        absolute = start + int(index)
        hz = float(f[index])
        if 0 < absolute < magnitude.size - 1:
            left, centre, right = (float(magnitude[absolute - 1]), float(magnitude[absolute]), float(magnitude[absolute + 1]))
            denominator = left - 2.0 * centre + right
            if denominator != 0.0:
                offset = 0.5 * (left - right) / denominator
                if -1.0 < offset < 1.0:
                    hz = float(freqs[absolute] + offset * bin_width)
        strength = float(np.clip(m[index] / ceiling, 0.0, 1.0))
        # Anything more than 40 dB below the strongest partial is the room, not
        # the instrument. Measured on the tuning forks, whose one real partial
        # sits at 1.000 while the rumble around it sits at 0.002-0.012, so a
        # peak list without this floor is mostly noise wearing a frequency.
        if strength < 0.01:
            continue
        out.append({"hz": hz, "strength": strength})
    return out


def note_for(hz: float) -> tuple[str, str]:
    midi = 69 + 12 * math.log2(hz / A4_HZ)
    nearest = int(round(midi))
    pitch_class = PITCH_CLASSES[nearest % 12]
    octave = nearest // 12 - 1
    return f"{pitch_class}{octave}", pitch_class


def measure_spectral(decoded: Decoded, config: AnalysisConfig) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    freqs, magnitude = _sustained_spectrum(decoded)
    total = float(np.sum(magnitude))

    centroid = None
    rolloff = None
    brightness = None
    if total > EPSILON:
        centroid = float(np.sum(freqs * magnitude) / total)
        cumulative = np.cumsum(magnitude)
        index = int(np.searchsorted(cumulative, 0.85 * cumulative[-1]))
        rolloff = float(freqs[min(index, freqs.size - 1)])
        span = math.log2(config.brightness_max_hz / config.brightness_min_hz)
        position = math.log2(max(centroid, config.brightness_min_hz) / config.brightness_min_hz)
        brightness = float(np.clip(position / span, 0.0, 1.0))

    peaks = _peaks(freqs, magnitude, config.resonant_peak_count, config.pitch_min_hz, config.pitch_max_hz)
    fundamental, confidence, tonality = _estimate_pitch(peaks, config)

    note = pitch_class = None
    if fundamental is not None and confidence is not None and confidence >= config.pitch_confidence_floor:
        note, pitch_class = note_for(fundamental)
    else:
        if fundamental is not None:
            warnings.append(
                f"pitch is only {0.0 if confidence is None else confidence:.2f} confident, "
                "so no note is claimed"
            )
        fundamental = fundamental if confidence is not None and confidence >= 0.25 else None

    return (
        {
            "fundamentalHz": None if fundamental is None else float(fundamental),
            "pitchConfidence": None if confidence is None else float(confidence),
            "note": note,
            "pitchClass": pitch_class,
            "tonality": tonality,
            "spectralCentroidHz": centroid,
            "spectralRolloffHz": rolloff,
            "brightness": brightness,
            "resonantPeaksHz": peaks,
        },
        warnings,
    )


def _estimate_pitch(peaks, config: AnalysisConfig):
    """Fundamental and how much to believe it.

    Harmonic-series scoring rather than autocorrelation, because bowls, bells and
    struck metal are inharmonic: their partials are *not* integer multiples, and
    a tracker built for voice returns a confident note for a sound that does not
    have one. Asking instead how much of the *other* measured energy sits on a
    candidate's harmonic series means an inharmonic sound scores low by
    construction, which is both the honest answer and exactly what `tonality`
    reports (§14).

    The candidate's own peak is deliberately excluded from its score. An earlier
    version counted it, which made every candidate match itself and handed the
    result to whichever partial happened to be loudest: a bowl whose spectrum
    read 442 / 883 / 1243 Hz — a textbook fundamental and its octave, plus a
    high inharmonic partial — was reported as 1243 Hz at 0.84 confidence,
    because 1243 was the strongest peak and its self-match outweighed the two
    genuine harmonics below it. Fourteen of the sixty-eight bowls were being
    named an octave or two above their actual pitch that way.

    Ties break downwards. If both 442 and 884 explain the spectrum equally well,
    the fundamental is 442; the other is its octave.
    """
    if not peaks:
        return None, None, "UNKNOWN"

    loudest = max(peak["strength"] for peak in peaks) or 1.0
    scored: list[tuple[float, float]] = []
    for candidate in peaks:
        f0 = candidate["hz"]
        if f0 < config.pitch_min_hz:
            continue
        # A fundamental may be weaker than its overtones — bells routinely are —
        # but it cannot be a hundred times weaker. Without this floor, a 1%
        # rumble peak steals the result whenever the real note happens to sit
        # near one of its multiples: `kalimba_single_note_C#` has exactly two
        # peaks, 79 Hz at 0.01 and 557 Hz at 1.00, and 557 is 7.05 x 79, so the
        # noise was named the fundamental of a sample whose actual pitch is
        # sitting right there at full strength.
        if candidate["strength"] < 0.08 * loudest:
            continue
        support = 0.0
        other = 0.0
        for peak in peaks:
            if peak is candidate:
                continue
            ratio = peak["hz"] / f0
            # Peaks at or below the candidate are neither for nor against it:
            # a fundamental is evidenced by what sits above it.
            if ratio < 1.5:
                continue
            # Only the first few harmonics count as evidence.
            #
            # Without this bound the estimator walks octaves *downward*: a
            # candidate at 49 Hz has a harmonic every 49 Hz, so at 1600 Hz its
            # multiples are dense enough that roughly a third of all peaks land
            # within tolerance by chance. Unbounded, the median bell "fundamental"
            # came out at 49 Hz — the room rumble, supported entirely by
            # coincidence. A real fundamental is evidenced by its low harmonics
            # or not at all.
            if ratio > MAX_HARMONIC + 0.5:
                continue
            nearest = round(ratio)
            # Low harmonics carry more evidence than high ones, so every peak is
            # weighted the same way whether it supports the candidate or not.
            # Weighting only the supporting side would cap the best possible
            # score at one over the harmonic number and leave almost nothing
            # above the confidence floor.
            weight = peak["strength"] / max(2, nearest)
            other += weight
            # A peak below the candidate is evidence against it, not for it.
            if nearest < 2:
                continue
            if abs(ratio - nearest) / nearest <= 0.03:
                support += weight
        if other <= 0:
            # A dominant partial with nothing above it to corroborate it.
            #
            # This is not evidence of a fundamental, and it must not be scored as
            # though it were: 91 of the 103 bells landed here and were handed an
            # identical confidence, which is a constant wearing a measurement's
            # clothes. A bell's named pitch is frequently its hum or strike tone
            # rather than its loudest partial — of the 87 bells whose filename
            # states a note, this branch agreed with only 35. So the frequency is
            # reported, because the peak is real and useful, at a confidence that
            # deliberately sits below the floor for naming a note.
            scored.append((f0, min(0.5, 0.5 * candidate["strength"] + 0.1)))
            continue
        # A candidate nothing else supports is not a fundamental, however loud.
        score = (support / other) * (0.5 + 0.5 * candidate["strength"])
        scored.append((f0, score))

    if not scored:
        return None, None, "UNKNOWN"

    best_score = max(score for _, score in scored)
    if best_score <= 0.0:
        # Nothing sits on anybody's harmonic series: the spectrum is inharmonic.
        # Report the strongest partial as the pitch, at a confidence that says
        # not to trust it as a note.
        strongest = max(peaks, key=lambda p: p["strength"])
        return strongest["hz"], 0.0, "ATONAL"

    # Within a hair of the best, prefer the lowest — that is the fundamental,
    # and the others are its octaves.
    close = [f0 for f0, score in scored if score >= best_score * 0.92]
    best_candidate = min(close)

    if best_score >= 0.85:
        tonality = "TONAL"
    elif best_score >= 0.55:
        tonality = "PARTIALLY_TONAL"
    elif best_score >= 0.3:
        tonality = "INHARMONIC"
    else:
        tonality = "ATONAL"
    return best_candidate, best_score, tonality


def analyse(decoded: Decoded, config: AnalysisConfig) -> Analysis:
    levels, level_warnings = measure_levels(decoded, config)
    timing, timing_warnings = measure_timing(decoded, config)
    spectral, spectral_warnings = measure_spectral(decoded, config)
    spectral["decaySeconds"] = measure_decay(decoded, config)
    spectral["transientStrength"] = measure_transient(decoded)
    return Analysis(
        levels=levels,
        timing=timing,
        spectral=spectral,
        warnings=[*level_warnings, *timing_warnings, *spectral_warnings],
    )
