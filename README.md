# AISpeakPro

An AI-powered spoken-English tutor. Learners hold real conversations with an AI
tutor (1:1) or role-play multi-character scenes (café, standup, debate); the
system scores their speech, mines recurring errors, and drives spaced-repetition
review — the loop that actually teaches, not just a chatbot with a microphone.

This repo is a **minimal but production-shaped MVP** of the backend + a reference
web client. It compiles, is unit-tested, and runs end-to-end. See
[`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design and the scaling story.

## Stack

| Layer            | Choice                                             | Why |
|------------------|----------------------------------------------------|-----|
| Language         | TypeScript everywhere                              | one language, shared types |
| API              | Fastify 4                                          | fast, production-grade, small |
| DB access        | Kysely + node-postgres                             | type-safe SQL, no codegen/engine |
| Database         | PostgreSQL 16                                       | boring, scales, JSONB for pedagogy |
| Cache / queue    | Redis + BullMQ (optional)                          | rate-limit + async feedback jobs |
| Auth             | JWT (access+refresh) + scrypt                      | stateless, horizontally scalable |
| AI providers     | pluggable (mock \| OpenAI-compatible)              | swap vendors with one env var |
| Web client       | React + Vite                                        | reference UI for the tutor loop |

## Quick start (Docker — everything)

```bash
cp .env.example .env
docker compose up --build
# API on http://localhost:8080  (migrations + seed run automatically)
```

## Quick start (local dev)

```bash
pnpm install
pnpm --filter @aispeakpro/shared build

# start Postgres + Redis however you like, then:
cp .env.example .env            # edit DATABASE_URL / REDIS_URL
pnpm db:migrate && pnpm db:seed

pnpm dev:api                    # API on :8080  (LLM_PROVIDER=mock → no keys needed)
pnpm dev:web                    # web client on :5173 (proxies to the API)
```

Open http://localhost:5173, create an account, and start a conversation. With
`LLM_PROVIDER=mock` it runs fully offline; set `LLM_PROVIDER=openai` +
`OPENAI_API_KEY` for a real model.

## Commands

```bash
pnpm typecheck      # typecheck every package
pnpm test           # unit tests (pedagogy: SM-2 scheduler, error mining)
pnpm build          # build all packages
pnpm --filter @aispeakpro/api worker   # run the async feedback worker (needs Redis)
```

## What's implemented

- Email/password auth with rotating refresh tokens
- Learner profile with per-skill CEFR levels + daily free-minute metering (quota)
- 1:1 tutor conversational loop over **WebSocket** (HTTP fallback included)
- Scene content model (personas, beats) + seeded scenarios; Scene Director prompt scaffold
- Pronunciation-score plumbing (mock; Azure adapter slots in)
- Post-session pedagogy pipeline: error mining → learner model → SRS enqueue
- SM-2 spaced repetition with review endpoint
- Rate limiting, health/readiness, structured logging, graceful shutdown
- Reference web client (auth, scenario picker, mic via Web Speech API, feedback)

## What's intentionally stubbed (see ARCHITECTURE.md → Roadmap)

Real-time STT/TTS media plane (LiveKit/WebRTC), the Python voice-orchestration
service (Pipecat), the native mobile apps, and photorealistic avatars. The
provider interfaces and the WS control channel are the seams they plug into.
# aispeakpro
# aispeakpro
# aispeakpro
# aispeakpro
# aispeakpro
