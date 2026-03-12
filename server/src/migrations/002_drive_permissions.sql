ALTER TABLE users ADD COLUMN access_token TEXT;
ALTER TABLE users ADD COLUMN refresh_token TEXT;

ALTER TABLE review_sessions ADD COLUMN google_doc_id TEXT;

CREATE TABLE IF NOT EXISTS drive_permission_cache (
  user_id       INTEGER REFERENCES users(id),
  google_doc_id TEXT NOT NULL,
  has_access    INTEGER NOT NULL,
  checked_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, google_doc_id)
);
