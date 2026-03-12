import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Works both in dev (server/src/) and compiled (server/dist/) by always
// referencing server/src/migrations
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

for (const file of files) {
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
  console.log(`Running migration: ${file}`);
  db.exec(sql);
  console.log(`  Done.`);
}

db.close();
console.log('All migrations complete.');
