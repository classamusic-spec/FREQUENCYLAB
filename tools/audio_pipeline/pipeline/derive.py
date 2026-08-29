"""Optimised runtime copies of the source audio (§4, §5).

The library is 1.5 GB of 24-bit / 48 kHz stereo WAV. That is the right format
for an archive and an impossible one for an app: nobody downloads a gigabyte and
a half of meditation samples, and no phone holds them resident.

This stage writes a second, compressed copy and never touches the first. Source
files stay byte-for-byte as delivered — they are the authoritative assets, and
every measurement in the manifest refers to them.

Measured on this library, Vorbis at the encoder's default quality comes out
about 25 times smaller — roughly 60 MB for all 369 files at about 94 kbps,
against 1473 MB of WAV. That is small enough to ship whole.

**Why not the recommended gain.** It is tempting to bake `recommendedGainDb`
into the derivative and save the runtime a multiply. It would be wrong: §10 and
§11 both ask for natural dynamics to be preserved, the gain is a *suggestion* a
mixer may choose to apply, and a curator who later changes it would be stuck
with audio already altered by the old value. The derivative is a faithful copy
in a smaller container; every decision about level stays a decision.
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import soundfile as sf

#: Frames per read/write when transcoding.
#:
#: Not a tuning knob — a correctness one. Handing libsndfile a whole decoded
#: file at once segfaults its Vorbis encoder on anything long: a 152-second
#: asset takes the interpreter down with it, and the crash is silent enough to
#: look like a hang. Streaming in blocks encodes the same 152 seconds without
#: incident.
BLOCK_FRAMES = 65536

CODECS: dict[str, tuple[str, str, str]] = {
    # name: (extension, libsndfile format, subtype)
    "vorbis": (".ogg", "OGG", "VORBIS"),
    "flac": (".flac", "FLAC", "PCM_16"),
}


@dataclass
class Derivative:
    asset_id: str
    relative_path: str
    bytes_: int
    codec: str


def transcode(source: Path, target: Path, codec: str) -> int:
    """Writes one derivative, streaming. Returns its size in bytes."""
    extension, container, subtype = CODECS[codec]
    target.parent.mkdir(parents=True, exist_ok=True)
    with sf.SoundFile(str(source)) as reader:
        with sf.SoundFile(
            str(target),
            mode="w",
            samplerate=reader.samplerate,
            channels=reader.channels,
            format=container,
            subtype=subtype,
        ) as writer:
            while True:
                block = reader.read(BLOCK_FRAMES, dtype="float32")
                if len(block) == 0:
                    break
                writer.write(block)
    return target.stat().st_size
