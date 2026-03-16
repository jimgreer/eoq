import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', '..', 'data', 'eoq.db');

// Ensure data directory exists
import fs from 'fs';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db: DatabaseType = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Extract plain text from HTML for search indexing
function extractText(html: string): string {
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

// Backfill search_text for existing sessions
export function backfillSearchText(): void {
  // Check if column exists
  const columns = db.prepare("PRAGMA table_info(review_sessions)").all() as any[];
  const hasSearchText = columns.some(c => c.name === 'search_text');
  if (!hasSearchText) return;

  const sessions = db.prepare(
    'SELECT id, html_content FROM review_sessions WHERE search_text IS NULL AND html_content IS NOT NULL'
  ).all() as any[];

  if (sessions.length === 0) return;

  console.log(`Backfilling search_text for ${sessions.length} sessions...`);
  const update = db.prepare('UPDATE review_sessions SET search_text = ? WHERE id = ?');

  for (const session of sessions) {
    const searchText = extractText(session.html_content);
    update.run(searchText, session.id);
  }

  console.log('Backfill complete.');
}
