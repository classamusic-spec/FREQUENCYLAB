"""Reports for a human curator (§28, §30, §31)."""

from __future__ import annotations

import html
import json
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np


def waveform_peaks(mono: np.ndarray, buckets: int = 240) -> list[float]:
    """A compact envelope for drawing (§31).

    240 numbers instead of four million samples, so nothing in a UI ever decodes
    a file to draw a preview of it.
    """
    if mono.size == 0:
        return []
    usable = (mono.size // buckets) * buckets
    if usable == 0:
        return [round(float(np.max(np.abs(mono))), 4)]
    frames = np.abs(mono[:usable]).reshape(buckets, -1)
    return [round(float(value), 4) for value in frames.max(axis=1)]


def summarise(assets: list[dict[str, Any]], extra: dict[str, Any]) -> dict[str, Any]:
    instruments = Counter(a["classification"]["instrument"] for a in assets)
    durations = Counter(a["classification"]["durationClass"] for a in assets)
    tonality = Counter(a["spectral"]["tonality"] for a in assets)
    rates = Counter(a["audio"]["sampleRate"] for a in assets)
    channels = Counter(a["audio"]["channels"] for a in assets)
    depths = Counter(a["audio"].get("bitDepth") for a in assets)

    lufs = [a["levels"]["integratedLufs"] for a in assets if a["levels"].get("integratedLufs") is not None]
    peaks = [a["levels"]["peakDbFS"] for a in assets if a["levels"].get("peakDbFS") is not None]
    seconds = [a["audio"]["durationSeconds"] for a in assets]

    return {
        "totalDiscovered": len(assets),
        "approved": sum(1 for a in assets if a["review"]["approved"]),
        "needsReview": sum(1 for a in assets if not a["review"]["approved"]),
        "manualOverrides": sum(1 for a in assets if a["review"].get("manualOverride")),
        "instruments": dict(sorted(instruments.items())),
        "durationClasses": {k: durations.get(k, 0) for k in ("MICRO", "SHORT", "MEDIUM", "LONG", "EXTENDED")},
        "tonality": dict(sorted(tonality.items())),
        "withNote": sum(1 for a in assets if a["spectral"].get("note")),
        "withoutNote": sum(1 for a in assets if not a["spectral"].get("note")),
        "sampleRates": {str(k): v for k, v in sorted(rates.items())},
        "channels": {str(k): v for k, v in sorted(channels.items())},
        "bitDepths": {str(k): v for k, v in sorted(depths.items(), key=lambda kv: (kv[0] is None, kv[0]))},
        "loopable": sum(1 for a in assets if a["runtime"]["loopable"]),
        "totalSeconds": round(sum(seconds), 2),
        "durationSecondsRange": [round(min(seconds), 3), round(max(seconds), 3)] if seconds else None,
        "integratedLufsRange": [round(min(lufs), 2), round(max(lufs), 2)] if lufs else None,
        "peakDbFSRange": [round(min(peaks), 2), round(max(peaks), 2)] if peaks else None,
        **extra,
    }


def render_text(summary: dict[str, Any]) -> str:
    lines = ["AUDIO ASSET REPORT", ""]

    def block(title: str, mapping: dict[str, Any]) -> None:
        lines.append(title)
        width = max((len(str(k)) for k in mapping), default=0)
        for key, value in mapping.items():
            lines.append(f"  {str(key):<{width}}  {value}")
        lines.append("")

    block("Totals", {
        "Total discovered": summary["totalDiscovered"],
        "Approved": summary["approved"],
        "Needs review": summary["needsReview"],
        "Manual overrides": summary["manualOverrides"],
        "Loopable": summary["loopable"],
        "Analysis failures": summary.get("analysisFailures", 0),
        "Duplicate content": summary.get("duplicateGroups", 0),
        "Ignored files": summary.get("ignoredFiles", 0),
    })
    block("Instruments", summary["instruments"])
    block("Duration classes", summary["durationClasses"])
    block("Tonality", summary["tonality"])
    block("Pitch", {"With a note": summary["withNote"], "Without a note": summary["withoutNote"]})
    block("Sample rates", summary["sampleRates"])
    block("Channels", summary["channels"])
    block("Bit depths", summary["bitDepths"])
    ranges = {}
    if summary.get("durationSecondsRange"):
        ranges["Duration (s)"] = f"{summary['durationSecondsRange'][0]} to {summary['durationSecondsRange'][1]}"
    if summary.get("integratedLufsRange"):
        ranges["Integrated LUFS"] = f"{summary['integratedLufsRange'][0]} to {summary['integratedLufsRange'][1]}"
    if summary.get("peakDbFSRange"):
        ranges["Peak dBFS"] = f"{summary['peakDbFSRange'][0]} to {summary['peakDbFSRange'][1]}"
    ranges["Total material"] = f"{summary['totalSeconds'] / 60.0:.1f} minutes"
    block("Ranges", ranges)
    return "\n".join(lines)


def render_html(summary: dict[str, Any], assets: list[dict[str, Any]], source_root: Path) -> str:
    """A local curation page (§30).

    Explicitly a developer tool. It points `<audio>` at the source files on the
    developer's own disk, which is why it is generated into `generated/` and
    never shipped: it would be the one thing in the product that redistributes
    the licensed source material (§37).
    """
    rows = []
    for asset in assets:
        spectral = asset["spectral"]
        peaks = asset.get("_waveform") or []
        points = " ".join(f"{i},{50 - value * 48:.1f}" for i, value in enumerate(peaks)) if peaks else ""
        note = spectral.get("note") or "—"
        lufs = asset["levels"].get("integratedLufs")
        src = html.escape((source_root / asset["source"]["relativePath"]).as_uri())
        rows.append(f"""
<tr class="{'ok' if asset['review']['approved'] else 'review'}">
  <td><code>{html.escape(asset['assetId'])}</code><br><span class="path">{html.escape(asset['source']['relativePath'])}</span></td>
  <td>{asset['audio']['durationSeconds']:.2f}s<br><span class="dim">{asset['classification']['durationClass']}</span></td>
  <td>{html.escape(asset['classification']['instrument'])}</td>
  <td><svg viewBox="0 0 {max(len(peaks),1)} 100" preserveAspectRatio="none" class="wave"><polyline points="{points}"/></svg></td>
  <td>{html.escape(note)}<br><span class="dim">{html.escape(spectral.get('tonality',''))}</span></td>
  <td>{'—' if lufs is None else f'{lufs:.1f} LUFS'}</td>
  <td>{html.escape(', '.join(asset['classification']['characterTags'][:6]))}</td>
  <td>{'approved' if asset['review']['approved'] else 'needs review'}</td>
  <td><audio controls preload="none" src="{src}"></audio></td>
</tr>""")

    counts = "".join(f"<li><b>{html.escape(str(k))}</b> {v}</li>" for k, v in summary["instruments"].items())
    return f"""<!doctype html>
<meta charset="utf-8"><title>Organic audio asset report</title>
<style>
 body {{ font: 13px/1.5 -apple-system, system-ui, sans-serif; margin: 24px; color: #171B21; }}
 h1 {{ font-size: 20px; }} ul {{ display: flex; gap: 18px; list-style: none; padding: 0; flex-wrap: wrap; }}
 table {{ border-collapse: collapse; width: 100%; margin-top: 18px; }}
 th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #E6EAF0; vertical-align: top; }}
 th {{ font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5C6675; }}
 code {{ font-size: 12px; }} .path, .dim {{ color: #8B95A2; font-size: 11px; }}
 .wave {{ width: 150px; height: 34px; }} .wave polyline {{ fill: none; stroke: #3B8BF5; stroke-width: 1; }}
 tr.review {{ background: #FFF8EC; }}
 audio {{ width: 190px; height: 30px; }}
</style>
<h1>Organic audio asset report</h1>
<p><b>{summary['totalDiscovered']}</b> assets · <b>{summary['approved']}</b> approved ·
   <b>{summary['needsReview']}</b> need review · {summary['totalSeconds'] / 60:.0f} minutes of material</p>
<ul>{counts}</ul>
<p class="dim">Developer tool. Audio is played from your local source tree and is never bundled with the app.</p>
<table><thead><tr>
  <th>Asset</th><th>Duration</th><th>Instrument</th><th>Waveform</th>
  <th>Pitch</th><th>Loudness</th><th>Tags</th><th>State</th><th>Preview</th>
</tr></thead><tbody>{''.join(rows)}</tbody></table>
"""


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
