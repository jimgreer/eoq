import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Track which migrations have been applied
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
  filename TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
)`);

const candidates = [
  path.join(__dirname, 'migrations'),
  path.join(__dirname, '..', 'src', 'migrations'),
];
const migrationsDir = candidates.find(d => fs.existsSync(d));

if (!migrationsDir) {
  console.error('Could not find migrations directory');
  process.exit(1);
}

const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
const applied = new Set(
  (db.prepare('SELECT filename FROM _migrations').all() as any[]).map(r => r.filename)
);

for (const file of files) {
  if (applied.has(file)) {
    console.log(`Skipping migration: ${file} (already applied)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  console.log(`Running migration: ${file}`);
  db.exec(sql);
  db.prepare('INSERT INTO _migrations (filename) VALUES (?)').run(file);
  console.log(`  Done.`);
}

db.close();
console.log('All migrations complete.');
