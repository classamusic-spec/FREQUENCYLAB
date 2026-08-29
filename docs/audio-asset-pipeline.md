# The audio asset pipeline

There is a licensed library of recorded bells, bowls, chimes, kalimba and tuning
forks in this repository, and there is code that needs to choose between those
recordings at runtime and lay them into a session. The pipeline is what stands
between the two. It runs offline, on a developer's machine, and turns 1.5 GB of
audio into a JSON file under a megabyte describing every asset in it — so that nothing at
runtime ever has to open a WAV to find out what it is.

That is the whole idea, and it is worth saying what it excludes. **This is not
the sound bath engine.** It never plays anything, never mixes anything and never
decides when a bell should ring. It measures, classifies and records. The
engine — `packages/dsp-core/src/organic/` — reads what it wrote and does the
deciding. The pipeline knows what each sound *is*; the scheduler knows what to do
with that.

One command runs all of it:

```bash
python3 tools/audio_pipeline/index_audio.py all
```

## Where the audio lives

```
Healing Sounds - Bells & Chimes/
└── Healing_Sounds_-_Bells_&_Chimes/
    ├── Loops/
    │   ├── Bells/
    │   └── Kalimba/{90,100,110,120}/
    └── One_Shots/
        ├── Bells/{Bell,Koshi_Bells,Tibetan_Bells}/
        ├── Bowls/{Hits,Long_Hits,Long_Phrases}/
        ├── Kailani/{Hits,Long_Phrases}/
        ├── Kalimba/{Phrases,Single_Notes}/
        └── Tuning_Forks/
```

369 WAV files, all of them 48 kHz, stereo and 24-bit, 89.4 minutes of material in
total, in a folder named by the vendor rather than by us.

The original plan put source audio under `assets/audio/organic/source/`, and the
library did not arrive there. Moving it would mean rewriting the history of 1.5 GB
of binaries to buy a tidier tree, so the scanner is pointed at where the files
actually are instead — `LIBRARY_SOURCE` in `tools/audio_pipeline/pipeline/config.py`.
`default_paths` still falls back to `assets/audio/organic/source/` if the vendor
folder is absent, and `--source` overrides both:

```bash
python3 tools/audio_pipeline/index_audio.py all --source ~/packs/new-bowls
```

**Nothing ever writes to the source tree.** Discovery opens files read-only,
hashes them, and everything downstream works from a decoded copy in memory. A
file that decodes through ffmpeg goes to a temporary WAV in a temp directory and
never back. If the pipeline has modified a source file, that is a bug.

## Installing and running it

Python 3.11, which is what CI runs, and four pinned dependencies:

```bash
python3 -m pip install -r tools/audio_pipeline/requirements.txt
python3 tools/audio_pipeline/index_audio.py all
```

The pins are not housekeeping. The numbers in the manifest are the output of
those exact implementations of numpy, scipy, soundfile and pyloudnorm, and
`analysisVersion` is only a meaningful promise if the code behind it is fixed
too.

Measuring all 369 files took about ten seconds on the machine that first ran it,
across one worker process per CPU. A re-run against a warm cache takes about two
and a half seconds, because nothing is measured twice — see *The cache* below.
Useful flags:

| Flag | What it does |
|---|---|
| `--source PATH` | scan somewhere else |
| `--jobs N` | worker processes; the default is one per CPU |
| `--no-html` | skip the HTML curation page |
| `--strict` | treat advisory warnings as failures too |

`scan` on its own walks the tree, hashes everything and reports duplicates
without measuring anything, which is the fast way to see what a new pack
contains.

**ffmpeg is optional and is not installed in this environment.** libsndfile reads
WAV, AIFF, FLAC, OGG, MP3, W64 and CAF directly; `.m4a`, `.aac` and `.mp4` need
ffmpeg, and without it every run prints

```
note       ffmpeg not found; .m4a/.aac assets would be skipped with a named error
```

and any such file fails its decode with a message naming the file, the reason and
the fix rather than a stack trace. This library is 100% WAV, so today it costs
nothing. Note that a decode failure is *reported* — in the console, in
`analysisFailures`, and in the JSON report — but does not by itself fail the run;
the asset is simply absent from the manifest.

## What the stages do

```
  discover ──▶ decode ──▶ analyse ──▶ classify ──▶ override ──▶ validate ──▶ write
   walk +      read-only   measure    name it      the curator   check it    manifest,
   SHA-256     into RAM    it          from name    wins          against     reports,
                                       and audio                  the schema  TS types
```

**Discover** walks the source tree, ignores dotfiles, AppleDouble sidecars,
`Thumbs.db`, temporary files and a list of directories that never hold source
material, and refuses to follow a symlink that points outside the tree. Every
audio file is SHA-256'd, and that hash is the asset's identity: **`assetId` is
`organic.` plus the first twelve hex characters of the digest.** Not a sequence
number and not the filename, because a curator who reorganises `Bowls/` into
`Bowls/Tibetan/` has not created new assets and their approvals must survive the
move — while replacing the audio behind a name genuinely *is* a new asset and
must not silently inherit an old approval. Files the scanner does not recognise
are counted as ignored rather than dropped, so a pack arriving with forty `.asd`
sidecars reads as forty ignored files and not as a mysteriously smaller library.

**Decode** reads the file into float32 in memory. Everything except the channel
count is measured from the channel mean.

**Analyse** measures level (peak, true peak, RMS, integrated LUFS, and a
recommended playback trim toward −23 LUFS), timing (leading and trailing silence
against a −60 dB floor that must hold for a quarter of a second, so a bowl's very
quiet tail is never mistaken for dead air), and spectrum (fundamental, pitch
confidence, note, tonality, centroid, rolloff, brightness, transient strength,
decay, and the six strongest resonant peaks).

**Classify** turns those numbers plus the file's path into an instrument, a
duration class, recommended roles and character tags. The rule that governs it is
that **the directory and the filename are hints, and the audio is evidence.**
Where the two disagree the disagreement is recorded rather than resolved.

**Override** merges `assets/audio/organic/metadata/organic_audio_overrides.json`
over the result. **Validate** checks the merged record. **Write** emits the
manifest, the JSON and text reports, the HTML curation page, and the TypeScript
types.

## How much of the metadata is actually measured

This is the part worth reading slowly, because the honest answer is *some of it*,
and the manifest says which.

Every asset gets a full set of level, timing and spectral measurements. What not
every asset gets is a **note**. Bells and bowls are inharmonic: a bell's named
pitch is usually its hum or strike tone rather than its strongest partial, and a
confident wrong note is worse than an honest blank. So pitch below a confidence
of 0.55 is not reported as a note at all. Where the spectrum cannot corroborate a
pitch but the vendor put a note in the filename, that label is recorded — and
marked as a label:

| `spectral.noteSource` | Meaning | Count in this library |
|---|---|---|
| `measured` | the spectrum corroborated the pitch | 87 |
| `filename` | the library labelled it; the audio could not confirm or deny | 121 |
| `null` | nobody knows | 161 |

There is no third value for "a curator decided", and one must not be invented:
the app reads that field as a two-value union, and a human judgement announcing
itself as a measurement is the exact failure the field exists to prevent. A
curator setting a pitch by hand sets `pitchClass` and leaves `noteSource` alone;
`review.manualOverride` is what says a person was there.

The filename is only checked against the measurement where the comparison means
something. On a single strike, `_A` names the pitch of that sound. On a loop or a
phrase it names the *key*, and the strongest partial in a passage in A is
routinely the fifth. Agreement runs 72% on single notes, 46% on hits, 40% on
phrases and 12% on loops — a gradient that is not mislabelled files but one
letter meaning two things. So only comparable cases are compared, and the 26
genuine disagreements are listed in `organic_audio_report.json` under
`filenameNoteConflicts` for a person to settle.

What the automatic pass produced on this library:

| | |
|---|---|
| Instruments | BELL 103, KALIMBA 100, CHIME 88, SINGING_BOWL 68, TUNING_FORK 10 |
| Duration classes | MICRO 1, SHORT 144, MEDIUM 142, LONG 71, EXTENDED 11 |
| Tonality | INHARMONIC 253, PARTIALLY_TONAL 44, TONAL 43, ATONAL 29 |
| Durations | 1.333 s to 152.0 s |
| Loudness | −31.44 to −6.25 LUFS; every file peaks at exactly −1.0 dBFS |
| Loopable | 65, every one of them from the library's own `Loops/` folders |
| Failures | 0 analysis failures, 0 duplicate files, 0 validation errors |

Loopability is never inferred from audio. A seamless loop point is a property of
how a file was produced, and guessing wrong produces an audible click on every
repeat — so only the vendor's own `Loops/` directories set the flag.

The instrument row above is the classifier's tally. The manifest as committed
reads BELL 102 and CHIME 89, because the example override described below moves
one Tibetan bell into CHIME. That difference is the merge order working, and it
is the reason both numbers are given here rather than one.

## Overrides

`assets/audio/organic/metadata/organic_audio_overrides.json` is the only file in
this pipeline a person edits by hand. It is keyed by asset id; each value carries
the sections of the record you want to change:

```json
{
  "organic.17cab606e89a": {
    "classification": {
      "instrument": "CHIME",
      "recommendedRoles": ["CHIME_STRIKE", "ACCENT"]
    },
    "review": { "notes": "why you did this" }
  }
}
```

Manual values win. The order is **automatic analysis → manual override →
validation → manifest**: the analysis never sees the override file, so it cannot
be talked into a measurement, and validation runs on the *merged* record, so a
hand-written value is held to exactly the same standard as a measured one. An
instrument outside the known set or a pitch class that is not a note name fails
the run.

Three things to know before writing one, all of which have bitten somebody:

The merge is **shallow, per section**. Named fields replace what was there; the
rest of the section survives; nothing is re-derived. Correct
`classification.instrument` from `BELL` to `CHIME` and the roles the classifier
picked for a bell are still sitting there — set `recommendedRoles` in the same
entry. This is deliberate, because a curator replacing `characterTags` means
*those* tags and not those plus whatever was guessed.

Ids are **content-derived**. Rename or move a file and its id is unchanged.
Replace the audio and the id changes, at which point your entry points at
nothing — which validation reports as a fatal error rather than dropping, because
a silently orphaned approval is how an unreviewed asset ends up shipping.

`assetId` and `label` inside an override are **ignored**. The id is the key; the
label is derived from the instrument and the filename.

`assets/audio/organic/metadata/README.md` is the short version of this section,
kept next to the file it describes. The three entries currently in the overrides
file are a worked example — an approval, an instrument correction and a pitch
class the analysis declined to guess — using real asset ids, each explaining
itself in `review.notes`.

## Approval

`review.approved` is the gate, and nothing else means "ready". Not a clean
analysis, not a high pitch confidence, not the absence of warnings. An approved
asset is held to a stricter bar by the validator — it must have a real instrument
and at least one recommended role — because approval is the moment an asset stops
being data and becomes something the app will play to somebody.

**Curation has not started.** One asset in the manifest is approved, and it is
the worked example in the overrides file, not a decision anybody made about the
library. The other 368 are analysed, classified and waiting for a person.

The tool for that person is the HTML report, written to
`generated/audio/organic_audio_report.html` by every run that does not pass
`--no-html`. It is a table of every asset with its measurements, its waveform and
a play button, with the ones still needing review highlighted. It is a developer
tool and it is deliberately not committed: it points `<audio>` at the licensed
source files on your own disk, which makes it the one artefact in this repository
that would redistribute the library if it ever shipped.

## Rebuilding and validating

```bash
python3 tools/audio_pipeline/index_audio.py all           # rebuild everything
python3 tools/audio_pipeline/check_manifest.py            # check without rebuilding
```

Validation splits into two kinds, and the split is the point. **Fatal** issues
fail the run: a missing field, a wrong type, an unknown instrument, a duration of
zero, an override keyed to an asset that does not exist, an approved asset with
no roles. **Advisory** warnings do not: 282 of them in this library, every one the same
sentence — "has no confident pitch, so no note is recorded" — which is a fact
about a bell and not a defect. `--strict` promotes warnings to failures, which is useful when
you want to know that a change introduced *new* uncertainty.

Two runs over identical inputs produce byte-identical output. There is no
timestamp anywhere in the manifest, assets are sorted by id, keys are sorted, and
every float is rounded to four decimals. That is what makes a diff meaningful: if
the manifest changed, something real changed.

## The three version numbers

Every manifest carries three, because they answer different questions and move
independently. They are declared together at the top of
`tools/audio_pipeline/pipeline/schema.py`.

**`ANALYSIS_VERSION`** — currently `1.7.0` — describes *what the measuring code
does*. Bump it whenever a number this pipeline computes would come out
differently: a new FFT size, a changed confidence floor, a fixed bug in the pitch
scorer. Bumping it invalidates every cache entry and forces the whole library to
be re-measured, which is exactly what you want, because the alternative is a
manifest half of whose numbers came from code that no longer exists.

**`SCHEMA_VERSION`** — currently `1` — describes *the shape of the record*. Bump
it when a field moves, changes type, or stops existing. It is a compatibility
gate: a consumer that understands schema 1 can refuse a schema 2 manifest
outright rather than reading fields that have moved under it. Adding a new
optional field that older readers can ignore does not need a bump; changing what
an existing field means does.

**`LIBRARY_VERSION`** — currently `0.1.0` — describes *the content of the sample
library*, which is a curatorial fact and not a technical one. Bump it when assets
are added, removed or replaced, or when a curation pass changes what is approved.
Protocol DNA will reference it, which is what makes it matter: a session that
reproduces has to be able to say which library it reproduced against.

They are independent on purpose. Re-running the analysis with better pitch
detection bumps the first and neither of the others. Adding a pack bumps the
third alone. Restructuring the record bumps the second while the audio and the
measurements stay exactly as they were.

## The cache

`generated/audio/organic_audio_analysis_cache.json` is keyed by **content hash
and analysis version together**. The hash answers "is this the same audio"; the
version answers "would today's code still produce these numbers". Either changing
invalidates the entry, which is what makes it safe to keep a cache across a
change to the measuring code — the cache cannot serve you a stale measurement,
because a stale measurement is by definition one whose version no longer matches.

It is not committed. It is a local speed-up, it is regenerated from the audio,
and a corrupted one is a performance problem rather than a correctness one: the
loader drops it and measures everything again. `.gitignore` says the same thing
in fewer words.

## What the app reads

The manifest is the boundary. `generated/audio/organic_audio_manifest.json` is
committed, the app consumes it, and **nothing at runtime opens an audio file to
learn anything about it.** A phone deciding which bowl to ring next reads a JSON
record; it does not decode 1.5 GB of WAV to find out how long a bowl rings.

The same run that writes the manifest also emits
`packages/dsp-core/src/organic/manifest.generated.ts` from the same schema
declarations — the record interfaces, the closed sets as TypeScript union types,
the duration bands and the three version constants. Generated rather than
hand-written for one reason: a hand-kept mirror is a second schema, it agrees on
the day it is written, and it stops agreeing on the day somebody adds a field —
silently, because both sides still compile and still parse.

`packages/dsp-core/src/organic/soundbath.ts` narrows that record to a
`SchedulableAsset`: id, duration, instrument, duration class, roles, tags,
brightness, transient strength, recommended gain, pitch class, `noteSource`,
maximum voices, loopable, approved. Notice what is missing — there is no file
path in it. The scheduler chooses assets by what they *are* and never by where
they live, so reorganising the library cannot change what a session sounds like.
Resolving an id to a playable file happens at the edge, once, in the app.

That consumer is being written now. The manifest and its emitted types are the
contract it is being written against.

## Adding a new sound pack

A second pack means one extra decision beyond the walkthrough below: where it
lives. `LIBRARY_SOURCE` in `pipeline/config.py` names the single root the scanner
walks, and a second pack means either dropping it inside that root or listing
another root there. Then bump `LIBRARY_VERSION`, because the library's content
has changed, and re-run. Asset ids being content-derived, existing assets keep
their ids and every override written against them keeps working; the new files
simply appear.

Check the report's *Ignored files* count afterwards. A pack that arrives as
`.m4a` on a machine without ffmpeg, or with its audio inside a folder named
`cache/`, will index as fewer assets than it contains, and that count is where it
shows.

## The walkthrough: adding assets, start to finish

Everything above is context. This is the procedure, and it assumes you have read
none of the source.

**1. Put the files where the scanner will find them.** Copy the new audio
anywhere inside `Healing Sounds - Bells & Chimes/`, in whatever folder structure
the pack came with. Do not rename anything to make it tidier — the filenames
carry the vendor's own claims about instrument, note, tempo and whether a file is
a loop, and the classifier reads them. Nested folders are fine and are read from
the filename outwards, so the folder nearest the file wins.

**2. Install the dependencies.** Once per machine:

```bash
python3 -m pip install -r tools/audio_pipeline/requirements.txt
```

If your pack contains `.m4a` or `.aac`, also install ffmpeg. If it does not, skip
it; the run will mention that ffmpeg is missing and it will not matter.

**3. Run the pipeline.**

```bash
python3 tools/audio_pipeline/index_audio.py all
```

Files already in the cache are not re-measured, so this is fast for everything
except your new material. The last lines are the ones that matter:

```
validate   0 errors, 282 warnings
```

Errors mean the manifest was still written but something in it is wrong and must
be fixed. Warnings are advisory and are usually the library telling you that a
bell has no determinable pitch.

**4. Read the report.** Three of them are written, for three different readers:

- `generated/audio/organic_audio_report.txt` — the totals, at a glance. Check
  *Total discovered* against the number of files you added, and *Ignored files*
  and *Analysis failures* against zero.
- `generated/audio/organic_audio_report.json` — the detail: duplicate groups,
  decode failures with their reasons, every filename-versus-measurement conflict,
  and every validation issue.
- `generated/audio/organic_audio_report.html` — open it in a browser. Every asset
  with its waveform, its numbers and a play button, with the ones needing review
  highlighted. This is where curation actually happens. It is not committed and
  plays from your local disk.

**5. Listen, and write down what the classifier got wrong.** Open
`assets/audio/organic/metadata/organic_audio_overrides.json` and add an entry
keyed by the asset id, which the HTML report shows next to each filename:

```json
{
  "organic.17cab606e89a": {
    "classification": {
      "instrument": "CHIME",
      "recommendedRoles": ["CHIME_STRIKE", "ACCENT"]
    },
    "review": { "notes": "the folder said Bells; this is a chime" }
  }
}
```

Remember the merge is shallow per section: name every field you want changed,
including the ones that follow from the change. Write down *why* in
`review.notes` — the next person to look at this file is deciding whether to
trust it, and a reason is what lets them.

**6. Mark what you approve.**

```json
"organic.b038ead23555": {
  "review": { "approved": true, "notes": "listened; the measurement is right" }
}
```

Approve deliberately, one asset at a time. There is no bulk approval and there
should not be: approving is the moment an asset becomes something the app will
play to somebody.

**7. Re-run, and read the validation line.**

```bash
python3 tools/audio_pipeline/index_audio.py all
```

Zero errors is the bar. An override keyed to an id that does not exist, an
instrument that is not a known category, a pitch class that is not a note name,
or an approved asset with no roles will all stop you here, with a message naming
the asset and the field.

**8. Check the whole tree agrees.**

```bash
python3 tools/audio_pipeline/check_manifest.py
```

This is what CI runs. It needs no dependencies and finishes in well under a
second, and it will tell you if you edited the overrides file and forgot to re-run, or committed a
report from a different run than the manifest.

**9. Test.** The pipeline emits TypeScript types the engine compiles against, so
a schema change reaches the app as a type error rather than as a surprise:

```bash
npm run typecheck
npm test
```

**10. Commit.** Commit the new audio, your override entries, and the regenerated
`generated/audio/organic_audio_manifest.json`,
`generated/audio/organic_audio_report.json` and `organic_audio_report.txt`. Do
*not* commit the analysis cache or the HTML report — `.gitignore` already
excludes both, the first because it is a local speed-up and the second because it
embeds `file://` links into the licensed library.

Bump `LIBRARY_VERSION` in `pipeline/schema.py` in the same commit. The library's
content changed, and that number is how a session recorded next month says which
library it was recorded against.

## What CI checks, and what it deliberately does not

`.github/workflows/audio-manifest.yml` runs `tools/audio_pipeline/check_manifest.py`
on every push and pull request. It installs nothing: the checker imports the
pipeline's own schema and validator, which are pure standard library, and only
the measuring code needs numpy and friends.

It checks that the manifest parses; that its three version numbers match the code
that would have written it; that `assetCount` is honest and the assets are
sorted; that every id is unique, well-formed and equal to the first twelve
characters of the content hash it carries; that no source path escapes the tree;
that every referenced file is really in the source tree; that every record passes
the pipeline's own validator, which is the full schema, every closed set and the
stricter bar on approved assets; that the overrides file references only real
assets and that re-applying it changes nothing, which is how a manifest older
than the overrides is caught; and that the committed JSON report carries the same
summary as the manifest, which proves the two came from the same run.

It deliberately does **not** re-run the analysis. Re-measuring 1.5 GB of audio on
every push would take minutes, need four scientific Python packages, and
reproduce numbers that are already in the tree. It does not re-hash the audio
either — it stats each file rather than reading it, so 369 syscalls stand in for
1.5 GB of I/O. And it does not parse the text report: that one is written for a
person, and machine-checking its layout would turn a human-readable summary into
a contract nobody meant to sign.

The consequence to be aware of is that CI cannot catch a manifest whose *numbers*
are wrong — only one whose structure, identity, versions or internal agreement
are. Numbers are proven by re-running the pipeline, which is deterministic: if
`index_audio.py all` produces no diff, the committed numbers are the ones the
current code computes.

## The 1.5 GB in git

The licensed WAV library is committed to this repository as **ordinary git
blobs**. There is no `.gitattributes` and no Git LFS. This is worth stating
plainly because it is invisible until it is expensive.

What it costs today, measured in this repository:

| | |
|---|---|
| Audio in the working tree | 1.5 GB, 369 files |
| Packed repository (`.git`) | 1.29 GiB in one pack; 1.4 GB on disk |
| Git history | one commit added all of it, and every clone since carries it |

Every clone pays for the full history of those binaries, not just the current
version of them. That is the part people are surprised by: git stores every
version of every file forever, and WAV is incompressible and does not delta — the
1.5 GB working tree packs down to 1.29 GiB, about 8%. Replace one bowl recording
and the repository grows by another whole copy of it, permanently. Shallow
cloning helps less than you would hope, because the blobs at the tip are most of
the weight. Every CI run pays the same download, which is why the manifest job
stats files instead of reading them.

**What Git LFS would change.** LFS replaces each audio file in git with a small
text pointer and keeps the bytes in a separate store, fetched on checkout for the
revisions you actually check out. A fresh clone then downloads the pointers plus
one copy of the current files instead of every historical version; a CI job that
does not need the audio can skip the fetch entirely — which is exactly the case
here, and why `check_manifest.py` already accepts `--allow-missing-source` and
would keep working with the file-existence check switched off. What LFS costs in
return: a separate quota and billing on whatever hosts the repository, git-lfs
installed on every contributor's machine and in CI, and any tool that does not
speak LFS seeing 130-byte pointer files where it expected audio.

**Migrating the existing history is a destructive rewrite.** `git lfs migrate
import` does not convert the repository in place; it rewrites every commit that
ever touched those paths, so every commit hash from the first audio commit onward
changes. Every clone, every branch, every open pull request and every tag
referring to the old hashes is invalidated, and everyone working on the
repository has to re-clone. That is a decision for whoever owns this repository,
taken at a moment when nobody has work in flight, with everyone told first. It is
not something a tool should do on its own and it is not something this document
has done — nothing here has been migrated, and no `.gitattributes` has been
added.

Nothing is broken as it stands. The app ships the manifest, not the WAVs; the
audio is a development-time input and a licensing obligation, not a product
artefact. The cost is developer and CI time, and it is worth deciding what to do
about it before the library grows rather than after.

## What this pipeline is not

It does not play, mix, schedule or fade anything. It does not know what a session
is. It does not modify the source audio, generate derivative audio, or ship the
library anywhere. It does not decide what is good — it measures what is there,
says how confident it is, and leaves a person to decide, which is why
`review.approved` exists and why it is still `false` on 368 of 369 assets.
