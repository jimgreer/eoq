-- Add access_level to sessions: 'restricted' (collaborators only) or 'link' (anyone)
ALTER TABLE review_sessions ADD COLUMN access_level TEXT DEFAULT 'restricted';

-- Collaborators table for sharing sessions
CREATE TABLE IF NOT EXISTS session_collaborators (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  TEXT REFERENCES review_sessions(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  added_by    INTEGER REFERENCES users(id),
  added_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, email)
);

CREATE INDEX IF NOT EXISTS idx_collaborators_session ON session_collaborators(session_id);
CREATE INDEX IF NOT EXISTS idx_collaborators_email ON session_collaborators(email);
