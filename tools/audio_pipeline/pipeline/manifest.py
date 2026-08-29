"""Merging overrides, validating, and writing the canonical manifest."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .schema import (
    ANALYSIS_VERSION,
    ENUM_FIELDS,
    FIELD_SPEC,
    LIBRARY_VERSION,
    LIST_ELEMENT_SPEC,
    LIST_FIELDS,
    ListElement,
    MANIFEST_FIELDS,
    MANIFEST_HEADER,
    SCHEMA_VERSION,
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


def load_approval(path: Path) -> tuple[dict[str, Any], list[ValidationIssue]]:
    """The library-wide approval policy, if the owner has written one.

    Separate from the overrides file because it answers a different question.
    An override says *this asset's record was wrong and here is the correction*;
    the policy says *this pack is cleared to ship*. Writing the second as 369
    override entries would set `manualOverride` on every asset in the library
    and claim a per-file review that did not happen, which is the one thing the
    review section exists to keep straight (§18).
    """
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
        return {}, [ValidationIssue(True, None, f"{path.name} must hold an object.")]

    policy = data.get("policy")
    if policy not in {None, "approve-all"}:
        return data, [
            ValidationIssue(
                True,
                None,
                f"{path.name} has policy {policy!r}. The only policy this pipeline implements is "
                '"approve-all"; anything narrower belongs in the overrides file, one asset at a time.',
            )
        ]
    issues: list[ValidationIssue] = []
    if policy == "approve-all":
        for name in ("approvedAt", "approvedBy", "basis"):
            if not data.get(name):
                issues.append(
                    ValidationIssue(
                        True, None,
                        f"{path.name} approves the whole library but has no {name}. A blanket approval "
                        "with nobody's name and no date on it is not a record of a decision.",
                    )
                )
    return data, issues


def apply_approval(assets: list[dict[str, Any]], approval: dict[str, Any]) -> int:
    """Marks the library approved, leaving individually reviewed assets alone.

    Returns how many assets the policy itself approved. An asset already
    approved by name in the overrides file keeps `approvalSource = "curator"`:
    the blanket policy is the weaker claim of the two, and overwriting the
    stronger one with it would lose the fact that somebody checked that file.
    """
    if approval.get("policy") != "approve-all":
        # Approval still has to be *sourced*, even without a policy: an asset
        # approved in the overrides file was approved by a curator.
        for asset in assets:
            review = asset.setdefault("review", {})
            review["approvalSource"] = "curator" if review.get("approved") else None
        return 0

    excluded = set(approval.get("excludedAssetIds") or [])
    approved_here = 0
    for asset in assets:
        review = asset.setdefault("review", {})
        if asset.get("assetId") in excluded:
            review["approved"] = False
            review["approvalSource"] = None
            continue
        if review.get("approved"):
            review["approvalSource"] = "curator"
            continue
        review["approved"] = True
        review["approvalSource"] = "library"
        approved_here += 1
    return approved_here


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
        issues.extend(_check_enums(asset_id, asset))

        classification = asset.get("classification", {})
        spectral = asset.get("spectral", {})

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
        review = asset.get("review", {})
        source = review.get("approvalSource")
        if review.get("approved") and not source:
            issues.append(
                ValidationIssue(
                    True, asset_id,
                    "is approved but records no approval source. Approval has to say where it came "
                    "from, or a later screen cannot tell a checked file from a whole pack cleared at once.",
                )
            )
        if source and not review.get("approved"):
            issues.append(
                ValidationIssue(
                    True, asset_id,
                    f"is not approved but records an approval source of {source!r}. That is a record of "
                    "a decision that was not taken.",
                )
            )

        if review.get("approved"):
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


def _check_enums(asset_id: str, asset: dict[str, Any]) -> list[ValidationIssue]:
    """Every closed-set field, checked against the one table that defines it.

    Walking `ENUM_FIELDS` rather than naming the sets here is the point: the
    validator, the emitted TypeScript union types and the classifier's output
    are then three readings of the same declaration instead of three lists that
    have to be remembered together (§25).
    """
    issues: list[ValidationIssue] = []
    for binding in ENUM_FIELDS:
        block = asset.get(binding.section)
        if not isinstance(block, dict):
            continue  # `_check_types` already reported the missing section.
        value = block.get(binding.field)

        if binding.is_list:
            items = value if isinstance(value, list) else []
        else:
            # A null in a field that allows one is not an unknown value. A null
            # in a field that does not is reported here as well as by the type
            # check, because both sentences are true and a curator reading
            # either one learns what to fix.
            nullable = FIELD_SPEC[binding.section][binding.field][1]
            if value is None and nullable:
                continue
            items = [value]

        for item in items:
            if item not in binding.values:
                issues.append(ValidationIssue(binding.fatal, asset_id, binding.message.format(value=item)))
    return issues



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
            items = block.get(name)
            if not isinstance(items, list):
                issues.append(ValidationIssue(True, asset_id, f"is missing the list {section}.{name}."))
                continue
            element = LIST_ELEMENT_SPEC.get((section, name))
            if element is not None:
                issues.extend(_check_elements(asset_id, section, name, items, element))
    return issues


def _check_elements(
    asset_id: str,
    section: str,
    name: str,
    items: list[Any],
    element: ListElement,
) -> list[ValidationIssue]:
    """The objects inside a list field.

    Fatal, like the scalar checks: `resonantPeaksHz` is read as numbers by
    anything that draws or tunes to it, and a string where a hertz value should
    be is not a degraded reading, it is a crash somewhere further downstream.
    """
    issues: list[ValidationIssue] = []
    for position, item in enumerate(items):
        if not isinstance(item, dict):
            issues.append(
                ValidationIssue(True, asset_id, f"has {section}.{name}[{position}] = {item!r}, which is not an object.")
            )
            continue
        for field_name, (kind, nullable) in element.fields.items():
            if field_name not in item:
                issues.append(ValidationIssue(True, asset_id, f"is missing {section}.{name}[{position}].{field_name}."))
                continue
            value = item[field_name]
            if value is None:
                if not nullable:
                    issues.append(
                        ValidationIssue(True, asset_id, f"has a null {section}.{name}[{position}].{field_name}, which may not be null.")
                    )
                continue
            if isinstance(value, bool) or not isinstance(value, _PY_TYPES[kind]):
                issues.append(
                    ValidationIssue(True, asset_id, f"has {section}.{name}[{position}].{field_name} = {value!r}, which is not a {kind}.")
                )
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
    values = {
        "_comment": MANIFEST_HEADER,
        "schemaVersion": SCHEMA_VERSION,
        "analysisVersion": ANALYSIS_VERSION,
        "organicLibraryVersion": LIBRARY_VERSION,
        "assetCount": len(assets),
        "counts": _round(counts),
        "assets": _round(sorted(assets, key=lambda item: item["assetId"])),
    }
    # Assembled through the declared envelope rather than returned directly, so
    # the file and the emitted `OrganicAudioManifest` type cannot come apart: a
    # key added here and not to `MANIFEST_FIELDS` never reaches the JSON, and one
    # declared there and not built here fails on the next run instead of
    # silently arriving as `undefined` in the app.
    return {name: values[name] for name, _kind, _doc in MANIFEST_FIELDS}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n")
