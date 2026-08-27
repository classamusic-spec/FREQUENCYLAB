# Backend architecture

**Nothing in this document is built.** The product is local-first and fully
functional offline; this is the design the seams are sized for, recorded so the
later phases do not have to reverse-engineer the client's assumptions.

## The constraint that shapes everything

Core frequency generation must work offline. Not degrade gracefully — *work*.
Generating tones, running saved protocols, creating protocols, recording
sessions and analysing them locally must never require a network. The cloud can
add sync, community, AI and research updates. It cannot become a dependency of
playback.

That is why every repository in `apps/mobile/src/storage` returns plain JSON and
nothing in the DSP core or the audio path knows what a request is.

## Proposed stack

| Concern | Choice | Why |
|---|---|---|
| Database | PostgreSQL | Relational lineage and experiment data; JSONB for protocol documents |
| Object storage | S3-compatible | Rendered previews and export artefacts |
| API | HTTP/JSON, versioned | The client already speaks canonical JSON |
| Search | Postgres full-text first; a vector index only if semantic protocol search proves necessary | Do not add infrastructure before the query pattern is known |
| Jobs | A durable queue | Moderation, preview rendering, aggregate recomputation |
| AI | Server-side model behind the existing `ProtocolDesigner` interface | The client contract already exists |

## Core tables

```
users(id, handle, created_at, deleted_at)
protocols(id, owner_id, schema_version, dsp_version, fingerprint, document jsonb,
          name, intent, created_at, updated_at)
protocol_versions(id, protocol_id, version, fingerprint, document jsonb, created_at)
protocol_lineage(protocol_id, parent_id, parent_version, root_id)
sessions(id, user_id, protocol_fingerprint, started_at, ended_at,
         played_sec, adherence, end_reason)
subjective_ratings(session_id, metric, value)
experiments(id, user_id, salt_hash, blinded, status, created_at)
experiment_assignments(experiment_id, index, commitment, arm_encrypted, session_id)
community_posts(id, protocol_id, creator_id, published_at, moderation_state)
post_stats(post_id, session_count, rating_count, average_rating, fork_count)
comments(id, post_id, author_id, body, created_at, moderation_state)
favorites(user_id, protocol_id, created_at)
follows(follower_id, followee_handle, created_at)
```

`fingerprint` is the client-computed SHA-256 of the canonical form — and the
server recomputes it rather than trusting it. Two users who build the same chain
independently produce the same fingerprint, which is what makes deduplication
and "N people run this exact configuration" possible.

## Rules that must not be violated

**Never trust client-provided permissions.** Authorisation is decided
server-side from the authenticated identity. The client sends what it wants to
do, never what it is allowed to do.

**Recompute every aggregate.** Session counts, ratings and fork counts are
derived server-side from real rows. The product never fabricates community
metrics; a post with no sessions shows no sessions.

**Biometric and experiment data are sensitive.** They are never included in a
published protocol, never in a community payload, and never in ordinary product
analytics. A shared protocol carries its configuration and nothing else.

**Moderate server-side.** Community protocols are validated against the schema
*and* the safety rules before publication. A protocol whose name or description
makes a medical claim does not publish.

**Audit critical operations.** Publication, moderation decisions, deletion and
role changes are append-only audit rows.

## Security

Argon2id password hashing or a passwordless flow; short-lived access tokens with
rotating refresh tokens; tokens in the platform keychain, never in
AsyncStorage — the current storage layer holds no credentials, and that must
stay true. TLS everywhere with certificate pinning for the primary API. Schema
validation on every request body. Per-user and per-IP rate limits on publish,
comment, fork and AI generation.

## Privacy

- **Explicit consent** per data class: sync, community, biometrics, analytics.
  Each independently revocable.
- **Export** already exists locally and returns the complete record; the server
  version must match it, not summarise it.
- **Deletion** removes rows rather than flagging them, and cascades to community
  content the user authored.
- **Local-only mode** stays supported permanently. A user who never signs in
  loses no core capability.
- Analytics cover product behaviour — protocol starts, completion rate, feature
  usage, builder abandonment, crashes, DSP errors, route failures — and never
  raw health data.

## AI

The `ProtocolDesigner` interface is the whole contract:

```ts
interface ProtocolDesigner {
  design(request: DesignRequest): Promise<DesignResult>;
}
```

`LocalProtocolDesigner` ships today and runs offline. A server implementation
returns the same `DesignResult` — a structured `Protocol`, a rationale, cautions,
and an optional decline reason — so nothing downstream changes.

Server-side generation inherits the same non-negotiables: it must not diagnose,
must not promise cures, must not recommend replacing medical care, and must not
convert historical frequency claims into factual medical advice. Its output is
validated against `validateProtocol` before it reaches the client, and the user
reviews it before it is saved or run.
