-- Add search_text column for plain text content search (without HTML tags)
ALTER TABLE review_sessions ADD COLUMN search_text TEXT;
