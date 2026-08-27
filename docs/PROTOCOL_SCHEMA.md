# Protocol schema and Protocol DNA

## The object

A protocol is the central object in the product. Everything — a one-tap Simple
Mode session, an Explorer audition, an AI proposal, a Lab build — compiles to
one of these.

```jsonc
{
  "schemaVersion": 1,
  "dspVersion": "1.0.0",
  "id": "protocol-l9x2k1",
  "name": "Deep Calm",
  "description": "A slow alpha-to-theta descent.",
  "intent": "relax",
  "sampleRate": 48000,
  "master": {
    "gain": 0.5,
    "limiter": true,
    "limiterCeilingDb": -1,
    "fadeInSec": 5,
    "fadeOutSec": 6
  },
  "stages": [
    {
      "id": "stage-settle",
      "name": "Settle",
      "durationSec": 300,
      "crossfadeSec": 0,
      "graph": {
        "nodes": [
          {
            "id": "tone",
            "kind": "binaural",
            "params": { "carrier": 220, "beat": 10, "amplitude": 0.36, "separation": 1, "phase": 0 },
            "options": { "waveform": "sine", "mode": "offset" }
          },
          { "id": "noise", "kind": "noise", "params": { "level": 0.12, "width": 0.7, "cutoff": 8000, "resonance": 0.707, "modDepth": 0, "modRate": 0.1 }, "options": { "color": "pink", "filter": "lowpass" } },
          { "id": "mix", "kind": "mixer", "params": { "gain": 1 }, "options": {} },
          { "id": "output", "kind": "output", "params": {}, "options": {} }
        ],
        "connections": [
          { "from": "tone", "to": "mix" },
          { "from": "noise", "to": "mix" },
          { "from": "mix", "to": "output" }
        ]
      },
      "automation": [
        {
          "id": "stage-settle-beat",
          "target": "tone:beat",
          "enabled": true,
          "label": "Beat",
          "points": [
            { "timeSec": 0,   "value": 10, "curve": { "kind": "smooth" } },
            { "timeSec": 300, "value": 8,  "curve": { "kind": "linear" } }
          ]
        }
      ]
    }
  ],
  "meta": {
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "version": 1,
    "tags": ["relax"],
    "generatedBy": "preset",
    "lineage": { "parentId": "…", "parentVersion": 3, "rootId": "…" }
  }
}
```

Automation targets are addressed as `nodeId:paramKey`. Parameter ranges, units,
tapers and automatability come from the node descriptors in
`graph/descriptors.ts`, which is the single source of truth — the UI builds
controls from it and the validator checks against it, so a range exists in
exactly one place.

## Canonicalisation

Two protocols that render identical audio must produce byte-identical canonical
JSON, and two that render differently must not. That is the whole contract.

Rules:

- object keys sorted lexicographically;
- numbers rounded to 6 decimals and printed without exponent notation, so a
  value that survives a JSON round trip on one platform survives it on all;
- `undefined` and editor-only fields dropped;
- graph nodes sorted by id and connections sorted by endpoints, so moving a
  module on the canvas does not invalidate a shared protocol;
- automation lanes sorted by target and points sorted by time;
- no whitespace.

The canonical form deliberately **excludes** id, name, description, tags,
timestamps and lineage. Renaming a protocol must not change its DNA, and two
people who independently build the same signal chain should discover they made
the same thing.

## Protocol DNA

Three forms, for three jobs.

**Human DNA** — recognisable at a glance, in the brief's own notation:

```
B6-C220-PN15-S0.75-T20
```

Beat 6 Hz, carrier 220 Hz, 15% pink noise, 0.75 Hz stereo movement, 20 minutes.
It is lossy on purpose, and the UI never presents it as proof that two protocols
are identical.

**Short fingerprint** — the first 60 bits of the hash in Crockford base32, so it
contains no ambiguous characters and can be read aloud:

```
FLX1-8Q4K7NV2PWZ3
```

**Full fingerprint** — SHA-256 of the canonical form, 64 hex characters. This is
what actually proves identity.

### Sharing and importing

`encodeDnaString(protocol)` produces a single line:

```
FLX1.<base64url payload>.<8 hex checksum>
```

The payload is the complete DNA document — format marker, version, fingerprint,
human form and the whole protocol. Import checks three things separately,
because they fail for different reasons:

| Check | Failure means |
|---|---|
| Checksum | The string was damaged in transit |
| Fingerprint | The payload was altered after it was created |
| DSP version | Neither of the above — the configuration is intact, but the audio may render differently than it did for its author |

`verifyDna` recomputes the fingerprint and reports the engine mismatch as a note
rather than an error, because it is not one.

## Versioning and migration

`schemaVersion` covers the stored shape. `dspVersion` covers anything that would
change the audio rendered from an unchanged protocol.

`migrateProtocol` chains forward-only steps and never rewrites an older one, so
a protocol saved by any past build still opens. A protocol from a *future*
schema is rejected with a message naming both versions rather than being
coerced into something that might play differently than intended.

`fillDefaults` repairs a protocol that is structurally valid but missing fields
a newer descriptor set has since added — so adding a parameter to a node does
not orphan every protocol that already used it.

## Lineage

Forking records `parentId`, `parentVersion` and `rootId`. The root lets a whole
family be queried at once, which is what the lineage view on the protocol screen
uses to render the V1 → V2 → V3 chain and diff any two adjacent points on it.

## Validation

`validateProtocol` returns issues, not booleans. Errors block playback; warnings
are surfaced but still play — an informed user may deliberately choose a harsh
configuration, but must never arrive at one by accident.

Errors include: a future schema, no stages, a stage under five seconds, a
disabled limiter, a graph cycle, a parameter out of its declared range, an
unknown option value, feeding a generator, automation targeting a parameter that
does not exist or is not automatable, and two lanes driving the same parameter.

Warnings include: a carrier outside the comfortable range, a beat that is a large
fraction of its carrier, binaural separation low enough that the effect has
collapsed, hard isochronic or AM gating, stereo movement above 4 Hz, generator
amplitudes summing well above unity, a silent or partially unreachable graph,
and automation points outside their stage.
