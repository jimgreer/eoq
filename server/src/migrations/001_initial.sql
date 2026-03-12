CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id     TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  avatar_url    TEXT,
  is_admin      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_sessions (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  html_content  TEXT NOT NULL,
  created_by    INTEGER REFERENCES users(id),
  is_active     INTEGER DEFAULT 1,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id            TEXT PRIMARY KEY,
  session_id    TEXT REFERENCES review_sessions(id) ON DELETE CASCADE,
  parent_id     TEXT REFERENCES comments(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id),
  body          TEXT NOT NULL,

  anchor_css_selector   TEXT,
  anchor_start_offset   INTEGER,
  anchor_end_offset     INTEGER,
  anchor_quote          TEXT,

  resolved      INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comments_session ON comments(session_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
