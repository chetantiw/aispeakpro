-- AISpeakPro initial schema (PostgreSQL 14+)
-- Designed to shard/scale: UUID primary keys, narrow hot tables, JSONB for
-- flexible pedagogy payloads, explicit indexes on every access path.

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,   -- normalized to lowercase in the application layer
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ---------------------------------------------------------------------------
-- Learner model (the pedagogy state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learner_profiles (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  native_language    TEXT NOT NULL DEFAULT 'Hindi',
  speaking_cefr      TEXT NOT NULL DEFAULT 'A1',
  listening_cefr     TEXT NOT NULL DEFAULT 'A1',
  vocabulary_cefr    TEXT NOT NULL DEFAULT 'A1',
  grammar_cefr       TEXT NOT NULL DEFAULT 'A1',
  goals              JSONB NOT NULL DEFAULT '[]'::jsonb,
  minutes_used_today INTEGER NOT NULL DEFAULT 0,
  minutes_reset_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS learner_errors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  example       TEXT NOT NULL,
  correction    TEXT NOT NULL,
  severity      INTEGER NOT NULL DEFAULT 3,
  times_seen    INTEGER NOT NULL DEFAULT 1,
  status        TEXT NOT NULL DEFAULT 'open',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_errors_user_status ON learner_errors(user_id, status);

CREATE TABLE IF NOT EXISTS vocabulary_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term             TEXT NOT NULL,
  definition       TEXT NOT NULL DEFAULT '',
  ease             DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  interval_days    DOUBLE PRECISION NOT NULL DEFAULT 0,
  repetitions      INTEGER NOT NULL DEFAULT 0,
  due_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, term)
);
CREATE INDEX IF NOT EXISTS idx_vocab_user_due ON vocabulary_items(user_id, due_at);

-- ---------------------------------------------------------------------------
-- Content (authored scenes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scenarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode        TEXT NOT NULL DEFAULT 'scene',
  difficulty  TEXT NOT NULL DEFAULT 'B1',
  setting     TEXT NOT NULL DEFAULT '',
  objective   TEXT NOT NULL DEFAULT '',
  personas    JSONB NOT NULL DEFAULT '[]'::jsonb,
  beats       JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id      UUID REFERENCES scenarios(id) ON DELETE SET NULL,
  mode             TEXT NOT NULL DEFAULT 'tutor',
  status           TEXT NOT NULL DEFAULT 'active',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_started ON sessions(user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS turns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  speaker       TEXT NOT NULL,
  persona_id    TEXT,
  text          TEXT NOT NULL,
  audio_url     TEXT,
  pronunciation JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, seq);

CREATE TABLE IF NOT EXISTS session_feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID UNIQUE NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  summary       TEXT NOT NULL DEFAULT '',
  cefr_estimate JSONB NOT NULL DEFAULT '{}'::jsonb,
  strengths     JSONB NOT NULL DEFAULT '[]'::jsonb,
  focus_areas   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
