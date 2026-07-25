# AISpeakPro — System Architecture

This document is the design of record for the MVP and the plan for scaling it to
millions of users. It is deliberately opinionated. Where the MVP takes a shortcut,
the shortcut is named and the production replacement is stated.

---

## 1. Guiding principles

1. **The pedagogy engine is the product; the LLM and voice stack are commodities.**
   Anyone can wire GPT to a TTS. The defensible core is the learner model +
   prompt assembly + spaced repetition. That code (`src/pedagogy/*`) is the only
   part that gets bespoke attention; everything else is behind a swappable seam.
2. **Buy the hard parts, own the orchestration.** Speech-to-text, text-to-speech,
   pronunciation scoring, and the LLM are vendor calls behind interfaces. We own
   the conversation loop, the turn-taking, and the learner state.
3. **Stateless API, stateful edges.** Every API instance is interchangeable so we
   scale horizontally behind a load balancer. All state lives in Postgres, Redis,
   or object storage.
4. **Cost is an architectural constraint, not a footnote.** Real-time voice is
   expensive; the design meters voice minutes and pushes expensive analysis off
   the hot path into async workers.

---

## 2. System architecture

```
                         ┌──────────────────────────────┐
   Mobile (iOS/Android)  │  React Native app (target)   │
   Web (reference)       │  React + Vite (this repo)    │
                         └───────────────┬──────────────┘
                                         │ HTTPS + WSS (JWT)
                                         ▼
                          ┌───────────────────────────┐
                          │   Load balancer / CDN      │
                          └───────────────┬───────────┘
                                          │
                 ┌────────────────────────┼────────────────────────┐
                 ▼                        ▼                         ▼
        ┌────────────────┐      ┌──────────────────┐      ┌──────────────────┐
        │  API tier      │      │  Realtime voice  │      │  Feedback workers│
        │  (Fastify)     │      │  service (future)│      │  (BullMQ)        │
        │  stateless,    │      │  Pipecat + WebRTC│      │  async pedagogy  │
        │  N replicas    │      │  LiveKit         │      │  N replicas      │
        └───────┬────────┘      └────────┬─────────┘      └────────┬─────────┘
                │                         │                         │
                │        ┌────────────────┴─────────┐               │
                ▼        ▼                           ▼               ▼
        ┌──────────────────┐   ┌──────────────┐   ┌──────────────────────────┐
        │  PostgreSQL      │   │  Redis       │   │  AI providers (vendors)  │
        │  (system of      │   │  rate limit  │   │  STT · LLM · TTS ·       │
        │   record)        │   │  + job queue │   │  Pronunciation           │
        │  + read replicas │   │  + pub/sub   │   │  (mock | OpenAI | Azure) │
        └──────────────────┘   └──────────────┘   └──────────────────────────┘
                │
                ▼
        ┌──────────────────┐
        │ Object storage   │  audio recordings (S3/GCS)
        └──────────────────┘
```

**What's in this repo:** the API tier, the async feedback worker, the data layer,
the pedagogy engine, and the reference web client. The realtime voice media plane
(Pipecat/LiveKit) and the native apps are documented seams, not yet built.

### Why two "brains" (sync + async)

The conversational turn must feel instant, so the live loop uses a fast, cheap
model and a bounded context window (`MAX_CONTEXT_TURNS`). The expensive analysis —
error mining, CEFR re-estimation, vocabulary extraction — runs **after** the
session in a worker, where latency doesn't matter and a stronger model can be
used. This split is the single most important performance decision in the system.

---

## 3. Request lifecycle (the conversational loop)

```
learner speaks ─▶ client STT ─▶ WS: {type:"user_turn", text}
   │
   ▼  (API)
 assertQuota → persist learner turn → getLearnerContext(userId)
   │                                      │
   │                                      ├─ CEFR profile
   │                                      ├─ top recurring errors
   │                                      └─ due SRS vocabulary
   ▼
 buildTutorSystemPrompt(context) + recent turns ─▶ LLM.chat() ─▶ persist tutor turn
   │
   ▼  WS: {type:"agent_turn", text}  ─▶ client TTS ─▶ learner hears reply

on "end": completeSession() → meter minutes → enqueueFeedback() (async)
```

The WebSocket (`/v1/realtime/session/:id`) is the primary path; the HTTP endpoint
(`POST /v1/sessions/:id/turns`) mirrors it exactly as a fallback and for testing.

---

## 4. File structure

```
aispeakpro/
├─ packages/shared/          # zod schemas = single source of truth for all contracts
│  └─ src/index.ts
├─ apps/api/
│  ├─ src/
│  │  ├─ server.ts           # bootstrap + graceful shutdown
│  │  ├─ app.ts              # Fastify factory: plugins, error envelope, routes
│  │  ├─ env.ts              # fail-fast env validation (zod)
│  │  ├─ auth/               # scrypt password hashing, JWT + refresh tokens
│  │  ├─ db/                 # Kysely types, pool, schema.sql, migrate, seed
│  │  ├─ http/               # AppError taxonomy, zod request validation
│  │  ├─ plugins/            # auth preHandler (Bearer → req.userId)
│  │  ├─ providers/          # LLM / pronunciation interfaces + mock + OpenAI
│  │  ├─ pedagogy/           # ★ prompt builder, SM-2 SRS, feedback mining (tested)
│  │  ├─ modules/            # auth, users, scenarios, sessions, vocab (routes+services)
│  │  ├─ realtime/           # WebSocket conversational channel
│  │  ├─ jobs/               # post-session feedback pipeline
│  │  ├─ queue.ts            # BullMQ producer (falls back to inline when no Redis)
│  │  └─ worker.ts           # BullMQ consumer (separate process/tier)
│  └─ Dockerfile
├─ apps/web/                 # React + Vite reference client
├─ docker-compose.yml        # postgres + redis + api + worker
└─ ARCHITECTURE.md / README.md
```

The `★ pedagogy` directory is where product value concentrates and is the only
code with unit tests in the MVP.

---

## 5. Database schema

PostgreSQL, UUID keys, JSONB for flexible pedagogy payloads, an index on every
access path. Full DDL in [`apps/api/src/db/schema.sql`](apps/api/src/db/schema.sql).

| Table                | Purpose                                             | Key indexes |
|----------------------|-----------------------------------------------------|-------------|
| `users`              | identity (email + scrypt hash)                      | unique(email) |
| `refresh_tokens`     | rotating refresh tokens (SHA-256 stored)            | (user_id), (token_hash) |
| `learner_profiles`   | per-skill CEFR, native language, daily-minute meter | pk(user_id) |
| `learner_errors`     | mined recurring errors (the learner model)          | (user_id, status) |
| `vocabulary_items`   | SM-2 spaced-repetition cards                        | (user_id, due_at) |
| `scenarios`          | authored scenes (personas + beats as JSONB)         | unique(slug) |
| `sessions`           | one conversation                                    | (user_id, started_at desc) |
| `turns`              | every utterance + pronunciation JSONB               | unique(session_id, seq) |
| `session_feedback`   | post-session report                                 | unique(session_id) |

**Scaling the data tier:** reads scale first via Postgres read replicas (session
history, scenario catalog, vocab lists are read-heavy). `turns` is the highest-
write table — partition by month and archive cold sessions to object storage.
Connection pooling via PgBouncer (transaction mode) so thousands of API instances
share a bounded server-side pool. The schema has no cross-user joins on the hot
path, so a later shard-by-`user_id` is straightforward.

---

## 6. API surface

All under `/v1`. Auth is Bearer JWT except where noted. Uniform error envelope:
`{ "error": { "code", "message", "details? } }`.

| Method | Path                          | Auth | Purpose |
|--------|-------------------------------|------|---------|
| POST   | `/auth/register`              | —    | create account → token pair |
| POST   | `/auth/login`                 | —    | token pair |
| POST   | `/auth/refresh`               | —    | rotate refresh → new pair |
| POST   | `/auth/logout`                | —    | revoke refresh token |
| GET    | `/me`                         | ✔    | profile (CEFR, quota) |
| PATCH  | `/me/profile`                 | ✔    | update native language / goals |
| GET    | `/scenarios`                  | —    | list active scenes |
| GET    | `/scenarios/:slug`            | —    | one scene |
| POST   | `/sessions`                   | ✔    | start session (quota-checked) |
| GET    | `/sessions`                   | ✔    | history (paginated) |
| GET    | `/sessions/:id`               | ✔    | session + turns + feedback |
| POST   | `/sessions/:id/turns`         | ✔    | HTTP conversational turn (fallback) |
| POST   | `/sessions/:id/complete`      | ✔    | end → meter minutes → enqueue feedback |
| GET    | `/vocab/due`                  | ✔    | SRS cards due now |
| POST   | `/vocab/:id/review`           | ✔    | grade 0–5 → reschedule (SM-2) |
| WS     | `/realtime/session/:id`       | ✔*   | live conversational channel |
| GET    | `/health`, `/ready`           | —    | liveness / readiness |

\* WebSocket auth is via `?token=` because browsers can't set headers on the WS
handshake; the token is a short-lived access JWT.

---

## 7. UI architecture

**Reference web client (this repo)** — React + Vite, three states:
`Auth → Home (scenario picker + quota) → Practice`. The Practice screen owns the
WebSocket, renders the transcript as chat bubbles, captures speech with the
browser Web Speech API, and speaks replies with browser TTS. State is local
(`useState`/`useRef`); tokens persist in `localStorage`; the API client
(`src/api.ts`) is a thin typed fetch wrapper that infers its types from
`@aispeakpro/shared`.

**Mobile apps (the real target).** Recommended: **React Native (Expo)** reusing
`@aispeakpro/shared` verbatim. Structure:

```
app/           screens: Auth, Home, Practice, SceneRoom, Review(SRS), Profile
  audio/       LiveKit client (WebRTC) + native audio session handling
  api/         REST + WS client (shared zod types)
  state/       auth store, session store, offline SRS queue
  ui/          design system
```

The mobile client differs from web in one critical way: instead of the browser
Web Speech API, it uses a **WebRTC media channel (LiveKit)** to the realtime voice
service for low-latency streaming STT/TTS. This repo's WS channel is the *control*
plane (turns, state); the media plane is separate and additive.

**Design-system note:** keep the tutor screen radically simple — a large mic
target, a live transcript, and one "end" action. The learner should look at their
conversation, not a UI.

---

## 8. The pedagogy engine (the moat)

Three pure, tested modules:

- **`promptBuilder.ts`** assembles a bespoke system prompt *per turn* from the
  learner's live state: CEFR levels, top recurring errors (to elicit and correct),
  due vocabulary (to weave in), and an explicit correction policy. Also builds
  per-persona prompts and the **Scene Director** prompt that arbitrates turn-taking
  in multi-bot scenes.
- **`srs.ts`** — the SM-2 spaced-repetition scheduler. Given a card's state and a
  0–5 recall grade, returns the next interval/ease/due date. 5 unit tests.
- **`feedback.ts`** — post-session error mining. A deterministic heuristic pass
  (article omission, capitalization, filler overuse, vocabulary extraction) that
  runs offline, plus an LLM path for richer analysis that *falls back to the
  heuristic on any failure* so a session's feedback is never lost. 4 unit tests.

The feedback job (`jobs/feedback.job.ts`) folds mined errors back into
`learner_errors` (incrementing repeat counts) and seeds new words into the SRS —
closing the loop so every session makes the next one smarter.

---

## 9. Scaling to millions — the honest checklist

| Concern | MVP | At scale |
|---------|-----|----------|
| API | single Fastify process | N stateless replicas behind an LB; autoscale on CPU |
| DB writes (`turns`) | one table | monthly partitions; archive cold data to S3 |
| DB reads | primary | read replicas for history/catalog/vocab |
| Connections | pg Pool | PgBouncer transaction pooling |
| Async work | inline or 1 worker | BullMQ worker fleet, per-queue autoscale |
| Realtime voice | browser Web Speech (web) | LiveKit WebRTC + Pipecat workers, edge-deployed |
| Voice cost | metered free minutes | tiered plans; cheap live model + strong async; watch open-weight self-host |
| Auth | JWT + Postgres refresh tokens | same; add device/session management |
| Rate limiting | Redis token bucket | same, per-user + per-IP tiers |
| Observability | pino JSON logs, /health | + OpenTelemetry traces, RED metrics, alerting |
| Media storage | (none yet) | S3/GCS with lifecycle expiry; signed URLs |

**The three risks that actually kill this** (unchanged from the product
brainstorm): latency on Indian mobile networks, voice unit-economics, and
differentiation. The architecture addresses the first two directly (edge voice
service; metering + cheap-live/strong-async). The third is a content and pedagogy
problem, which is why the pedagogy engine — not the plumbing — is where the effort
goes.

---

## 10. Roadmap (build order)

1. **Prove the loop** — ✅ done here (tutor loop, DB, auth, pedagogy pipeline).
2. **Realtime media plane** — stand up the Pipecat/LiveKit voice service; replace
   browser STT/TTS on mobile with WebRTC streaming; wire Azure Pronunciation.
3. **Scene Director** — implement multi-bot turn-taking on top of the existing
   persona/beat model and `buildDirectorPrompt`.
4. **Mobile apps** — React Native (Expo), reusing `@aispeakpro/shared`.
5. **Monetization** — tiers, richer metering, premium scenes.
