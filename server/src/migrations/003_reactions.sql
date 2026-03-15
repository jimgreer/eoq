-- Reactions table for emoji reactions on comments
CREATE TABLE IF NOT EXISTS reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  emoji       TEXT NOT NULL,
  created_at  TEXT DEFAULT (datetime('now')),
  UNIQUE(comment_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_comment ON reactions(comment_id);
