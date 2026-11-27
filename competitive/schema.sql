-- Cloudflare D1 / SQLite. No user email or Discord access tokens are stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  csrf TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  discord_name TEXT NOT NULL,
  player_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  rank TEXT NOT NULL,
  peak_rank TEXT NOT NULL,
  availability TEXT NOT NULL,
  experience TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  social TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','reviewing','granting','role_error','approved','rejected')),
  moderator_id TEXT,
  moderator_note TEXT,
  role_granted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_open ON applications(discord_id)
  WHERE status IN ('pending','reviewing','granting','role_error','approved');
CREATE INDEX IF NOT EXISTS idx_application_queue ON applications(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_user ON applications(discord_id,created_at DESC);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id),
  actor_id TEXT NOT NULL,
  event TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_review_events_application ON review_events(application_id,created_at DESC);
