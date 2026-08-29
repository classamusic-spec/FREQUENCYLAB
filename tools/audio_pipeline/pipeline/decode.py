"""Reading audio into memory, without touching the file on disk."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

from .schema import FFMPEG_EXTENSIONS


class DecodeError(RuntimeError):
    pass


@dataclass
class Decoded:
    """One asset, decoded.

    `samples` is float32 in [-1, 1], shape (frames, channels). `mono` is the
    channel mean, which every analysis except the channel count works from —
    measuring a stereo bowl per-channel would double the work to produce two
    numbers that a mixer would immediately average anyway.
    """

    samples: np.ndarray
    mono: np.ndarray
    sample_rate: int
    channels: int
    frames: int
    bit_depth: int | None
    format_name: str

    @property
    def duration_seconds(self) -> float:
        return self.frames / float(self.sample_rate) if self.sample_rate else 0.0


_SUBTYPE_BITS = {
    "PCM_S8": 8, "PCM_U8": 8, "PCM_16": 16, "PCM_24": 24, "PCM_32": 32,
    "FLOAT": 32, "DOUBLE": 64, "ALAC_16": 16, "ALAC_20": 20, "ALAC_24": 24,
    "ALAC_32": 32, "VORBIS": None, "MPEG_LAYER_III": None,
}

_ffmpeg = shutil.which("ffmpeg")


def ffmpeg_available() -> bool:
    return _ffmpeg is not None


def decode(path: Path) -> Decoded:
    extension = path.suffix.lower()
    if extension in FFMPEG_EXTENSIONS:
        return _decode_via_ffmpeg(path)
    return _decode_native(path)


def _decode_native(path: Path) -> Decoded:
    try:
        with sf.SoundFile(str(path)) as handle:
            data = handle.read(dtype="float32", always_2d=True)
            return _pack(
                data,
                handle.samplerate,
                _SUBTYPE_BITS.get(handle.subtype),
                handle.format,
            )
    except Exception as error:  # noqa: BLE001 — surfaced as a readable failure
        raise DecodeError(f"could not decode {path.name}: {error}") from error


def _decode_via_ffmpeg(path: Path) -> Decoded:
    """M4A and AAC, which libsndfile does not read.

    ffmpeg is optional: a library without these formats never needs it, and one
    with them gets a named warning rather than a mysterious failure. The decode
    goes to a temporary WAV and never back to the source.
    """
    if _ffmpeg is None:
        raise DecodeError(
            f"{path.name} is {path.suffix} which needs ffmpeg to decode, and ffmpeg was not found "
            "on PATH. Install it, or convert the asset to WAV or FLAC before adding it."
        )
    with tempfile.TemporaryDirectory() as work:
        target = Path(work) / "decoded.wav"
        result = subprocess.run(
            [_ffmpeg, "-v", "error", "-i", str(path), "-c:a", "pcm_f32le", str(target)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not target.exists():
            raise DecodeError(f"ffmpeg could not decode {path.name}: {result.stderr.strip()[:200]}")
        decoded = _decode_native(target)
        return Decoded(
            samples=decoded.samples,
            mono=decoded.mono,
            sample_rate=decoded.sample_rate,
            channels=decoded.channels,
            frames=decoded.frames,
            bit_depth=None,
            format_name=path.suffix.lstrip(".").upper(),
        )


def _pack(data: np.ndarray, sample_rate: int, bit_depth: int | None, format_name: str) -> Decoded:
    if data.size == 0:
        raise DecodeError("file decoded to zero samples")
    mono = data.mean(axis=1).astype(np.float32, copy=False)
    return Decoded(
        samples=data,
        mono=mono,
        sample_rate=int(sample_rate),
        channels=int(data.shape[1]),
        frames=int(data.shape[0]),
        bit_depth=bit_depth,
        format_name=format_name,
    )
