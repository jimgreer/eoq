-- Change cache to use email instead of user_id for permission checks
DROP TABLE IF EXISTS drive_permission_cache;

CREATE TABLE drive_permission_cache (
  user_email    TEXT NOT NULL,
  google_doc_id TEXT NOT NULL,
  has_access    INTEGER NOT NULL,
  checked_at    TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_email, google_doc_id)
);
