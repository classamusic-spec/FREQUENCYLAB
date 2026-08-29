"""Merging overrides, validating, and writing the canonical manifest."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schema import (
    ANALYSIS_VERSION,
    CHARACTER_TAGS,
    DURATION_CLASSES,
    FIELD_SPEC,
    INSTRUMENTS,
    LIBRARY_VERSION,
    LIST_FIELDS,
    MANIFEST_HEADER,
    PITCH_CLASSES,
    ROLES,
    SCHEMA_VERSION,
    TONALITY,
    ValidationIssue,
)


def load_overrides(path: Path) -> tuple[dict[str, Any], list[ValidationIssue]]:
    if not path.exists():
        return {}, []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as error:
        return {}, [
            ValidationIssue(
                True,
                None,
                f"{path.name} is not valid JSON: {error.msg} at line {error.lineno}, column {error.colno}.",
            )
        ]
    if not isinstance(data, dict):
        return {}, [ValidationIssue(True, None, f"{path.name} must hold an object keyed by asset id.")]
    return data, []


def apply_overrides(asset: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Manual values win (§21).

    A shallow merge per section rather than a deep one: a curator replacing
    `characterTags` means those tags and not those tags plus whatever the
    classifier guessed, and a list that silently accumulated both would be
    impossible to correct.
    """
    merged = {key: dict(value) if isinstance(value, dict) else value for key, value in asset.items()}
    for section, values in override.items():
        if section in {"assetId", "label"}:
            continue
        if isinstance(values, dict) and isinstance(merged.get(section), dict):
            merged[section] = {**merged[section], **values}
        else:
            merged[section] = values
    merged.setdefault("review", {})
    merged["review"] = {**merged["review"], "manualOverride": True}
    return merged


def validate(assets: list[dict[str, Any]], overrides: dict[str, Any], source_root: Path) -> list[ValidationIssue]:
    """Everything §26 requires, with §27's split between fatal and advisory."""
    issues: list[ValidationIssue] = []
    seen_ids: dict[str, str] = {}

    for asset in assets:
        asset_id = asset.get("assetId")
        if not asset_id:
            issues.append(ValidationIssue(True, None, "an asset has no id."))
            continue

        if asset_id in seen_ids:
            issues.append(
                ValidationIssue(
                    True,
                    asset_id,
                    f"duplicate asset id — already used by {seen_ids[asset_id]}. Two files hashed "
                    "to the same id, which should be impossible; check for a corrupted scan.",
                )
            )
            continue
        seen_ids[asset_id] = asset["source"].get("relativePath", "?")

        source = asset.get("source", {})
        relative = source.get("relativePath")
        if not relative:
            issues.append(ValidationIssue(True, asset_id, "has no source path."))
        elif not (source_root / relative).exists():
            issues.append(
                ValidationIssue(
                    True, asset_id, f"references {relative}, which is not in the source tree."
                )
            )
        if not source.get("contentHash"):
            issues.append(ValidationIssue(True, asset_id, "has no content hash."))

        audio = asset.get("audio", {})
        duration = audio.get("durationSeconds")
        if not isinstance(duration, (int, float)) or duration <= 0:
            issues.append(ValidationIssue(True, asset_id, f"has a duration of {duration!r}; it must be above zero."))
        sample_rate = audio.get("sampleRate")
        if not isinstance(sample_rate, int) or not (8000 <= sample_rate <= 384000):
            issues.append(ValidationIssue(True, asset_id, f"has an implausible sample rate of {sample_rate!r}."))
        channels = audio.get("channels")
        if channels not in (1, 2):
            issues.append(
                ValidationIssue(True, asset_id, f"has {channels!r} channels; only mono and stereo are supported.")
            )

        issues.extend(_check_types(asset_id, asset))

        classification = asset.get("classification", {})
        if classification.get("instrument") not in INSTRUMENTS:
            issues.append(
                ValidationIssue(True, asset_id, f"has instrument {classification.get('instrument')!r}, which is not a known category.")
            )
        if classification.get("durationClass") not in DURATION_CLASSES:
            issues.append(
                ValidationIssue(True, asset_id, f"has duration class {classification.get('durationClass')!r}, which is not known.")
            )
        for role in classification.get("recommendedRoles", []):
            if role not in ROLES:
                issues.append(ValidationIssue(False, asset_id, f"has an unrecognised role {role!r}."))
        for tag in classification.get("characterTags", []):
            if tag not in CHARACTER_TAGS:
                issues.append(ValidationIssue(False, asset_id, f"has an unrecognised tag {tag!r}."))

        spectral = asset.get("spectral", {})
        if spectral.get("tonality") not in TONALITY:
            issues.append(ValidationIssue(True, asset_id, f"has tonality {spectral.get('tonality')!r}, which is not known."))
        pitch_class = spectral.get("pitchClass")
        if pitch_class is not None and pitch_class not in PITCH_CLASSES:
            issues.append(ValidationIssue(True, asset_id, f"has pitch class {pitch_class!r}, which is not a note name."))

        # Advisory only: an unknown pitch is a fact about a bell, not a defect
        # in the library (§27).
        if spectral.get("note") is None:
            issues.append(ValidationIssue(False, asset_id, "has no confident pitch, so no note is recorded."))
        if asset.get("levels", {}).get("integratedLufs") is None:
            issues.append(ValidationIssue(False, asset_id, "has no integrated loudness measurement."))
        if classification.get("instrument") == "UNKNOWN":
            issues.append(ValidationIssue(False, asset_id, "could not be classified and needs a curator."))

        # An approved asset is one the app will actually ship, so it is held to
        # a higher standard than one still under review (§26).
        if asset.get("review", {}).get("approved"):
            if classification.get("instrument") == "UNKNOWN":
                issues.append(
                    ValidationIssue(True, asset_id, "is approved but has no instrument. Approve it with a classification, or set one in the overrides.")
                )
            if not classification.get("recommendedRoles"):
                issues.append(ValidationIssue(True, asset_id, "is approved but has no recommended roles."))

    for asset_id in overrides:
        if asset_id not in seen_ids:
            issues.append(
                ValidationIssue(
                    True,
                    None,
                    f"organic_audio_overrides.json references unknown asset id {asset_id}. "
                    "Either the file was removed, or its audio changed and it has a new id.",
                )
            )
    return issues


_PY_TYPES = {"string": str, "number": (int, float), "integer": int, "boolean": bool}


def _check_types(asset_id: str, asset: dict[str, Any]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for section, fields in FIELD_SPEC.items():
        block = asset.get(section)
        if not isinstance(block, dict):
            issues.append(ValidationIssue(True, asset_id, f"is missing its {section} section."))
            continue
        for name, (kind, nullable) in fields.items():
            if name not in block:
                issues.append(ValidationIssue(True, asset_id, f"is missing {section}.{name}."))
                continue
            value = block[name]
            if value is None:
                if not nullable:
                    issues.append(ValidationIssue(True, asset_id, f"has a null {section}.{name}, which may not be null."))
                continue
            expected = _PY_TYPES[kind]
            if kind == "integer" and isinstance(value, bool):
                issues.append(ValidationIssue(True, asset_id, f"has a boolean in {section}.{name}, which expects an integer."))
            elif not isinstance(value, expected):
                issues.append(
                    ValidationIssue(True, asset_id, f"has {section}.{name} = {value!r}, which is not a {kind}.")
                )
        for name in LIST_FIELDS.get(section, ()):  # noqa: PERF203
            if not isinstance(block.get(name), list):
                issues.append(ValidationIssue(True, asset_id, f"is missing the list {section}.{name}."))
    return issues


def _round(value: Any) -> Any:
    """Rounds every float in the manifest to four decimals.

    Full double precision serialises numbers like -21.09981608789666, which is a
    megabyte of digits nobody can use: four decimals is a ten-thousandth of a
    decibel and a thousandth of a cent at these frequencies. Deterministic, so it
    does not disturb the byte-for-byte reproducibility the manifest depends on.
    """
    if isinstance(value, float):
        rounded = round(value, 4)
        return 0.0 if rounded == 0 else rounded
    if isinstance(value, dict):
        return {key: _round(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_round(item) for item in value]
    return value


def build(assets: list[dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    """The canonical manifest.

    Sorted by asset id and written with sorted keys, so two runs over identical
    inputs produce identical bytes (§56). Nothing time-varying goes in: a
    generation timestamp would change the file on every run and make it
    impossible to tell a real change from a re-run.
    """
    return {
        "_comment": MANIFEST_HEADER,
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": ANALYSIS_VERSION,
        "organicLibraryVersion": LIBRARY_VERSION,
        "assetCount": len(assets),
        "counts": _round(counts),
        "assets": _round(sorted(assets, key=lambda item: item["assetId"])),
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
