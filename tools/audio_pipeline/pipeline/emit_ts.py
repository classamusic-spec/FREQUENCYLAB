"""TypeScript types for the manifest, emitted from the schema (§25).

The application reads the manifest, so the application needs a type for it. The
obvious way to get one is to write the interfaces by hand in `dsp-core` next to
the code that consumes them — and that is exactly the failure §25 names. A
hand-kept mirror is a second schema. It agrees with `schema.py` on the day it is
written and stops agreeing on the day somebody adds a field to one of them, and
because both sides still compile and still parse, nothing says so. The drift is
found later, by a runtime `undefined` in a query that used to work.

So the types are generated. Everything structural is read out of the
declarations in `schema.py`:

  ``FIELD_SPEC``          the scalar fields of each section, their JSON types
                          and their nullability;
  ``LIST_FIELDS``         which fields hold lists;
  ``LIST_ELEMENT_SPEC``   the shape of a list's items where they are objects;
  ``ENUM_FIELDS``         which fields are drawn from a closed set, which turns
                          `string` into a union type on the TypeScript side;
  ``MANIFEST_FIELDS``     the envelope the asset list is written inside;
  ``Asset``               the record's own composition, read off the dataclass
                          so `assetId` and `label` are not named twice.

What is *not* read out of the schema is the prose: the section and field
comments below. They document the same fields the tables declare, and they are
kept here rather than in the generated file for the same reason the types are
generated at all — a sentence written into `manifest.generated.ts` is erased by
the next run. Prose drifting is a smaller defect than a shape drifting, and it
is the one thing a person genuinely has to write.

Determinism (§56): declaration order throughout, no timestamp, no host path, no
absolute path, LF newlines. Two runs over the same schema produce identical
bytes, so a diff in this file always means the schema moved.
"""

from __future__ import annotations

import dataclasses
from pathlib import Path

from .schema import (
    ANALYSIS_VERSION,
    DEFAULT_DURATION_BANDS,
    ENUM_FIELDS,
    FIELD_SPEC,
    LIBRARY_VERSION,
    LIST_ELEMENT_SPEC,
    LIST_FIELDS,
    MANIFEST_FIELDS,
    SCHEMA_VERSION,
    Asset,
    DurationBand,
)

# JSON type name to TypeScript type. `integer` and `number` both land on
# `number` because JavaScript has one numeric type; the distinction still
# matters to the Python validator, which is where it is enforced.
TS_SCALARS = {
    "string": "string",
    "number": "number",
    "integer": "number",
    "boolean": "boolean",
}

# What each section is for. One sentence per section, written for someone
# reading the type in an editor rather than reading the pipeline.
SECTION_DOCS: dict[str, str] = {
    "source": (
        "Where the audio came from.\n\n"
        "Storage detail, carried so a tool can find the file again. Runtime code "
        "must not read meaning out of these strings (§44): the pipeline's own "
        "classifier proved why, by reading this library's root folder name and "
        "classifying all 369 assets as chimes."
    ),
    "audio": "The decoded facts: how long, how fast, how many channels.",
    "levels": (
        "Loudness, measured once so nothing has to measure it again.\n\n"
        "`recommendedGainDb` is a suggestion for the mixer, not a normalisation "
        "target: the natural dynamics stay in the audio (§11)."
    ),
    "timing": (
        "Where the sound actually starts and stops inside the file.\n\n"
        "Silence is measured with a hold, because a bowl's partials beat against "
        "each other and dip below any fixed threshold on the way down. Without "
        "the hold the first dip reads as the end of the sound (§13)."
    ),
    "spectral": (
        "What the spectrum says: pitch, colour, decay.\n\n"
        "Every field here is nullable and means it. An unknown pitch is a fact "
        "about a bell, not a gap to be filled with a guess (§14)."
    ),
    "classification": (
        "What the asset is, and what it is good for.\n\n"
        "Read from the path where the library names the instrument, and from the "
        "audio where it does not (§19). A curator's override wins over both (§21)."
    ),
    "runtime": "Playback hints: memory strategy, looping, and how many may sound at once (§23).",
    "review": "Curation state. Nothing is approved until a person approves it.",
}

# Field-level notes, for the fields where the number alone is not enough to use
# it correctly. Every statement here is a description of what the pipeline
# actually computes; a field with nothing worth saying gets no comment.
FIELD_DOCS: dict[tuple[str, str], str] = {
    ("source", "contentHash"): (
        "SHA-256 of the file's bytes. The asset id is derived from it, so a rename "
        "keeps the id and a re-encode changes it (§7)."
    ),
    ("source", "bytes"): "Size of the source file on disk.",
    ("audio", "durationSeconds"): (
        "The whole file, including any silence at either end. `timing` says where "
        "the sound is inside it."
    ),
    ("audio", "bitDepth"): "Null for formats that do not carry one.",
    ("levels", "integratedLufs"): "Integrated loudness. Null when it could not be measured.",
    ("levels", "recommendedGainDb"): (
        "dB the mixer may apply to bring this asset toward the pipeline's target "
        "loudness. Null means unmeasured, which is not the same as 0 dB — decide "
        "what to do about it rather than treating it as unity."
    ),
    ("levels", "truePeakDbFS"): "Inter-sample peak, which can sit above the sample peak.",
    ("timing", "leadingSilenceSeconds"): "Silence before the first audible frame.",
    ("timing", "trailingSilenceSeconds"): "Silence after the last audible frame.",
    ("timing", "recommendedStartOffset"): (
        "Where playback may begin. Stops short of the audio so a strike never "
        "starts mid-attack. Null when there is no lead-in worth skipping."
    ),
    ("timing", "recommendedEndOffset"): (
        "Where the sound is finished, half a second past the last audible frame. "
        "Null when the file has under a second of trailing silence."
    ),
    ("spectral", "fundamentalHz"): "Estimated fundamental. Null when no estimate was confident enough.",
    ("spectral", "pitchConfidence"): (
        "0..1. Below the pipeline's floor no note is recorded at all: a confident "
        "wrong note is worse than an honest blank (§14)."
    ),
    ("spectral", "note"): "Note name with octave, such as `A#6`. Only ever a measured note.",
    ("spectral", "pitchClass"): (
        "The note without its octave. Present when either the spectrum or the "
        "library's filename supplied one — `noteSource` says which."
    ),
    ("spectral", "noteSource"): (
        "Where the note came from, and never blank when a note is present.\n\n"
        "`measured` means the spectrum corroborated it. `filename` means the "
        "library labelled it and the audio could neither confirm nor deny, which "
        "for inharmonic material is often the better answer and is still not a "
        "measurement. A caller that cannot tell the two apart will eventually "
        "present a vendor's label as an analysis (§18)."
    ),
    ("spectral", "brightness"): "Spectral centroid mapped onto 0..1 across the range this library spans.",
    ("spectral", "transientStrength"): (
        "0..1 attack sharpness. Sharp attacks stack badly, which is what "
        "`maxRecommendedVoices` limits (§12)."
    ),
    ("spectral", "decaySeconds"): (
        "Seconds from the peak until the envelope has fallen 60 dB. A T60-style "
        "estimate, reported as an estimate."
    ),
    ("spectral", "resonantPeaksHz"): (
        "The strongest partials the analysis kept, in ascending frequency order. "
        "`strength` is relative to the loudest of them, which is therefore 1."
    ),
    ("classification", "durationClass"): (
        "The band `durationSeconds` falls in. Carried so nothing downstream has to "
        "re-derive it, and so a change to the bands is a pipeline change rather "
        "than a change in what the app happens to compute."
    ),
    ("classification", "recommendedRoles"): "What this asset can do in a session (§10).",
    ("classification", "characterTags"): "How it sounds, in words a query can use (§20).",
    ("runtime", "streamingRecommended"): "Too long to hold decoded in memory on a phone (§23).",
    ("runtime", "preloadRecommended"): "Short enough to hold decoded in memory (§23).",
    ("runtime", "loopable"): (
        "The library's own statement that a file is meant to repeat, never a guess "
        "from the audio. A seamless loop point is a property of how a file was "
        "produced, and guessing wrong clicks on every repeat."
    ),
    ("runtime", "maxRecommendedVoices"): (
        "How many copies may sound at once before the attacks pile up (§12)."
    ),
    ("review", "approved"): "Cleared to ship. False until a person says otherwise.",
    ("review", "manualOverride"): "True when a curator's overrides were merged into this record (§21).",
    ("review", "notes"): "A curator's note, for a human reader.",
}

MANIFEST_ENVELOPE_TYPES = {
    "counts": "OrganicManifestCounts",
    "assets": "readonly OrganicManifestAsset[]",
}

HEADER = """/**
 * AUTO-GENERATED — DO NOT EDIT DIRECTLY.
 *
 * Emitted by `tools/audio_pipeline/pipeline/emit_ts.py` from the declarations in
 * `tools/audio_pipeline/pipeline/schema.py`, which is the one definition of what
 * an asset record is (§25). To change anything in this file, change the schema
 * and run:
 *
 *     python3 tools/audio_pipeline/index_audio.py all
 *
 * An edit made here survives until the next run and no longer. Until then it is
 * a second schema quietly disagreeing with the first, which is the failure §25
 * exists to prevent and the whole reason these types are generated instead of
 * being kept by hand beside the code that consumes them.
 *
 * Nothing time-varying, machine-specific or absolute is written, and every list
 * is in declaration order, so re-running the pipeline over an unchanged schema
 * leaves this file byte-identical (§56). A diff here always means the schema
 * moved.
 */"""


def _number(value: float) -> str:
    """A float as TypeScript would write it, and the same way every run."""
    if value == int(value):
        return str(int(value))
    return repr(value)


def _block_comment(text: str, indent: str = "") -> list[str]:
    """A JSDoc block, one line for a sentence and several for a paragraph."""
    lines = text.split("\n")
    if len(lines) == 1:
        return [f"{indent}/** {lines[0]} */"]
    out = [f"{indent}/**"]
    for line in lines:
        out.append(f"{indent} *" if not line else f"{indent} * {line}")
    out.append(f"{indent} */")
    return out


def _wrap(text: str, width: int, prefix: str) -> list[str]:
    """Greedy wrap. Deterministic, and it never splits a word."""
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = word if not current else f"{current} {word}"
        if len(prefix) + len(candidate) > width and current:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _doc(text: str, indent: str = "") -> list[str]:
    """A wrapped JSDoc block. Paragraphs are separated by a blank line."""
    paragraphs = text.split("\n\n")
    wrapped: list[str] = []
    for index, paragraph in enumerate(paragraphs):
        if index:
            wrapped.append("")
        wrapped.extend(_wrap(paragraph.replace("\n", " "), 88, f"{indent} * "))
    if len(wrapped) == 1:
        return [f"{indent}/** {wrapped[0]} */"]
    return _block_comment("\n".join(wrapped), indent)


def _ts_type(section: str, field: str) -> str:
    """The TypeScript type of one scalar field, union types included."""
    kind, nullable = FIELD_SPEC[section][field]
    binding = _enum_for(section, field)
    base = binding.ts_type if binding is not None else TS_SCALARS[kind]
    return f"{base} | null" if nullable else base


def _enum_for(section: str, field: str):
    for binding in ENUM_FIELDS:
        if binding.section == section and binding.field == field:
            return binding
    return None


def _list_type(section: str, field: str) -> str:
    binding = _enum_for(section, field)
    if binding is not None:
        return f"readonly {binding.ts_type}[]"
    element = LIST_ELEMENT_SPEC.get((section, field))
    if element is not None:
        return f"readonly {element.ts_type}[]"
    # Reached only by adding a list to `LIST_FIELDS` and declaring nothing about
    # what is in it. Refusing beats emitting `unknown[]`, which would compile and
    # would push the question onto whoever consumes it next.
    raise ValueError(
        f"{section}.{field} is a list with no element declaration. Add it to "
        "ENUM_FIELDS or LIST_ELEMENT_SPEC in schema.py."
    )


def _section_interface_name(section: str) -> str:
    return f"OrganicAsset{section[0].upper()}{section[1:]}"


def render(bands: tuple[DurationBand, ...] = DEFAULT_DURATION_BANDS) -> str:
    """The whole file.

    `bands` is the table the run actually used rather than the default, because
    `config.py` is allowed to replace it. Emitting the defaults while a run
    classified against something else would put a table in the app that does not
    describe the manifest sitting beside it.
    """
    out: list[str] = [HEADER, ""]

    # --- versions ----------------------------------------------------------
    out += _doc(
        "The record shape this file describes. A manifest carrying a different "
        "number is not a manifest these types describe, and should be refused "
        "rather than read (§33)."
    )
    out.append(f"export const ORGANIC_SCHEMA_VERSION = {SCHEMA_VERSION};")
    out.append("")
    out += _doc(
        "What the measuring code did. Changes whenever a number the pipeline "
        "computes would come out differently, which is what invalidates the "
        "analysis cache."
    )
    out.append(f"export const ORGANIC_ANALYSIS_VERSION = '{ANALYSIS_VERSION}';")
    out.append("")
    out += _doc(
        "The content of the sample library itself, which is a curatorial fact "
        "rather than a technical one (§34)."
    )
    out.append(f"export const ORGANIC_LIBRARY_VERSION = '{LIBRARY_VERSION}';")
    out.append("")

    # --- closed sets -------------------------------------------------------
    out.append("// " + "-" * 74)
    out.append("// Closed sets")
    out.append("//")
    out.append("// Each one is emitted twice: as a frozen array, so a UI can offer exactly the")
    out.append("// values that exist, and as the union type derived from it, so a typo in a")
    out.append("// query is a compile error rather than an empty result.")
    out.append("// " + "-" * 74)
    out.append("")

    emitted: set[str] = set()
    for binding in ENUM_FIELDS:
        if binding.ts_const in emitted:
            continue
        emitted.add(binding.ts_const)
        out.append(f"export const {binding.ts_const} = [")
        for value in binding.values:
            out.append(f"  '{value}',")
        out.append("] as const;")
        out.append(f"export type {binding.ts_type} = (typeof {binding.ts_const})[number];")
        out.append("")

    # --- duration bands ----------------------------------------------------
    out += _doc(
        "One duration class and the range that puts an asset in it. Bounds are "
        "seconds, lower-inclusive and upper-exclusive, so an asset of exactly "
        "2.0 s lands in SHORT rather than in both or neither."
    )
    out.append("export interface OrganicDurationBand {")
    out.append("  readonly name: OrganicDurationClass;")
    out.append("  readonly minSeconds: number;")
    out.append("  /** Null on the last band, which has no upper bound. */")
    out.append("  readonly maxSeconds: number | null;")
    out.append("}")
    out.append("")
    out += _doc(
        "The bands this manifest was classified with.\n\n"
        "Here so a label can say what LONG means, not so anything can re-derive a "
        "class: every asset carries the class it was given, and computing a second "
        "opinion at runtime is how the app and the manifest come to disagree."
    )
    out.append("export const ORGANIC_DURATION_BANDS: readonly OrganicDurationBand[] = [")
    for band in bands:
        maximum = "null" if band.max_seconds is None else _number(band.max_seconds)
        out.append(
            f"  {{ name: '{band.name}', minSeconds: {_number(band.min_seconds)}, maxSeconds: {maximum} }},"
        )
    out.append("];")
    out.append("")

    # --- list element shapes -----------------------------------------------
    for (section, field), element in LIST_ELEMENT_SPEC.items():
        doc = FIELD_DOCS.get((section, field))
        if doc:
            out += _doc(f"One item of `{section}.{field}`. {doc}")
        out.append(f"export interface {element.ts_type} {{")
        for name, (kind, nullable) in element.fields.items():
            ts = TS_SCALARS[kind] + (" | null" if nullable else "")
            out.append(f"  readonly {name}: {ts};")
        out.append("}")
        out.append("")

    # --- record sections ---------------------------------------------------
    out.append("// " + "-" * 74)
    out.append("// The record, section by section")
    out.append("// " + "-" * 74)
    out.append("")

    for section, fields in FIELD_SPEC.items():
        out += _doc(SECTION_DOCS[section])
        out.append(f"export interface {_section_interface_name(section)} {{")
        for name in fields:
            doc = FIELD_DOCS.get((section, name))
            if doc:
                out += _doc(doc, "  ")
            out.append(f"  readonly {name}: {_ts_type(section, name)};")
        for name in LIST_FIELDS.get(section, ()):
            doc = FIELD_DOCS.get((section, name))
            if doc:
                out += _doc(doc, "  ")
            out.append(f"  readonly {name}: {_list_type(section, name)};")
        out.append("}")
        out.append("")

    # --- the record --------------------------------------------------------
    out += _doc(
        "One analysed asset, exactly as the manifest stores it.\n\n"
        "This is the storage shape. What a sound-bath engine consumes is "
        "`OrganicAsset` in `registry.ts`, which is a different and smaller thing "
        "on purpose (§46) — an engine that reaches into `source` is an engine "
        "that has started reading filenames."
    )
    out.append("export interface OrganicManifestAsset {")
    for field in dataclasses.fields(Asset):
        if field.name in FIELD_SPEC:
            out.append(f"  readonly {field.name}: {_section_interface_name(field.name)};")
        elif field.type == "str":
            out.append(f"  readonly {field.name}: string;")
        else:
            # A field added to the dataclass that is neither a declared section
            # nor a plain string. Guessing its type here is how a generated file
            # starts telling a lie.
            raise ValueError(
                f"Asset.{field.name} is typed {field.type!r}, which the emitter has no "
                "rule for. Add a section to FIELD_SPEC, or teach emit_ts.py about it."
            )
    out.append("}")
    out.append("")

    # --- the envelope ------------------------------------------------------
    out += _doc(
        "The summary block, deliberately not typed field by field.\n\n"
        "It is produced by the pipeline's report rather than by the record "
        "schema, so spelling its keys out here would be a copy of a function "
        "nothing keeps in step with it — the second-schema problem again, one "
        "level up. It is for a person looking at the file. Anything a program "
        "depends on should be counted from `assets`."
    )
    out.append("export type OrganicManifestCounts = Readonly<Record<string, unknown>>;")
    out.append("")

    out += _doc(
        "The manifest file.\n\n"
        "Written by `tools/audio_pipeline`, read at startup, and the only thing "
        "the app knows about the sample library. Nothing at runtime opens an "
        "audio file to find any of this out (§44)."
    )
    out.append("export interface OrganicAudioManifest {")
    for name, kind, doc in MANIFEST_FIELDS:
        out += _doc(doc, "  ")
        ts = MANIFEST_ENVELOPE_TYPES.get(kind) or TS_SCALARS[kind]
        out.append(f"  readonly {name}: {ts};")
    out.append("}")

    return "\n".join(out) + "\n"


def write(path: Path, bands: tuple[DurationBand, ...] = DEFAULT_DURATION_BANDS) -> bool:
    """Writes the types, and says whether anything actually changed.

    `newline='\\n'` rather than the platform default: this file is committed, and
    a Windows checkout re-running the pipeline should not produce a diff of every
    line (§56).
    """
    text = render(bands)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")
    return True
