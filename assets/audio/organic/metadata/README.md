# Curator's metadata

`organic_audio_overrides.json` is the only file in the audio pipeline a person
edits by hand. Everything else under `generated/audio/` is written by
`tools/audio_pipeline/index_audio.py` and carries a header saying so.

## The merge order

```
  automatic analysis  ──▶  manual override  ──▶  validation  ──▶  manifest
   measures the file      this file, keyed        both together     what the
   and guesses at         by asset id             are checked       app reads
   what it is
```

Four stages, in that order, every run. The analysis never sees this file, so it
cannot be talked into a measurement; the override is applied to the analysis's
output; and validation runs on the *merged* record, which means a manual value
is held to exactly the same standard as a measured one. An override that names
an instrument outside the known set, or a pitch class that is not a note name,
fails the run rather than reaching the manifest.

**Manual values win.** Where this file and the analysis disagree, this file is
the answer. That is the whole point of it: the classifier is a set of readable
rules that will be wrong sometimes, and the correction has to outrank it.

## Writing an entry

Keys are asset ids. Values are the sections of an asset record — `classification`,
`spectral`, `runtime`, `levels`, `timing`, `review` — carrying only the fields
you want to change:

```json
{
  "organic.b038ead23555": {
    "review": { "approved": true, "notes": "why" }
  }
}
```

Find an id in `generated/audio/organic_audio_manifest.json`, or in the HTML
report, where the id sits beside the filename and a play button. `assetId` and
`label` in an override are ignored — the id is the key, and the label is derived.

Three things to know before you write one.

**The merge is shallow, per section.** The fields you name replace the fields
that were there; the rest of the section survives untouched. Nothing is
re-derived. So if you correct `classification.instrument` from `BELL` to
`CHIME`, the roles the classifier suggested for a bell are still sitting there
and you have to set `recommendedRoles` in the same entry. This is deliberate: a
curator who replaces `characterTags` means *those* tags, not those tags merged
with whatever the classifier guessed, and a list that quietly accumulated both
would be impossible to correct.

**Asset ids are content-derived**, `organic.` plus the first twelve hex
characters of the file's SHA-256. Renaming a file or moving it to another folder
keeps its id, so your work follows it. *Replacing* the audio changes the id, and
the entry you wrote is now keyed to something that no longer exists — which
validation reports as an error rather than dropping in silence, because a
silently orphaned approval is how an unreviewed asset ends up shipping.

**`spectral.noteSource` is a closed set**, `measured` or `filename`, and there
is no third value for "a person decided". Do not invent one: the app reads that
field as a two-value union and a curator's judgement announcing itself as a
measurement is precisely what the field exists to prevent. Set `pitchClass`, say
what you did in `review.notes`, and let `review.manualOverride` — which the merge
sets for you — be the flag that a human was here.

## Approval

`review.approved` is the gate. Nothing else in the manifest means "this is
ready"; the classifier's confidence does not, and neither does a clean analysis.
An approved asset is held to a higher bar by the validator — it must have a real
instrument and at least one recommended role — because approving is the moment an
asset stops being data and becomes something the app will play to somebody.

## After you edit this file

```bash
python3 tools/audio_pipeline/index_audio.py all
```

Then commit the regenerated `generated/audio/organic_audio_manifest.json` and
`organic_audio_report.json` alongside your edit. CI compares the two, and
re-applies every override to the manifest to check it is not describing an older
version of this file.

## The entries that are here now

The three entries in `organic_audio_overrides.json` are a worked example, one
for each kind of correction: an approval, an instrument the folder name got
wrong, and a pitch class the analysis declined to guess. They use real asset ids
and each one explains itself in `review.notes`. They are examples of the
mechanism, not the beginning of a curation pass — curation has not started, and
these three are the only assets in the library anyone has touched.
