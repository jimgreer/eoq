import { Router } from 'express';
import multer from 'multer';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { db } from '../db.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function sanitizeHtml(rawHtml: string): string {
  const dom = new JSDOM('');
  const purify = DOMPurify(dom.window as any);
  return purify.sanitize(rawHtml, {
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ADD_TAGS: ['style'],
    ADD_ATTR: ['class', 'style', 'id'],
    WHOLE_DOCUMENT: true,
  });
}

function extractBody(html: string): string {
  const styleBlocks: string[] = [];
  html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_match, css) => {
    const scoped = (css as string).replace(
      /([^\r\n,{}]+)(,(?=[^}]*\{)|\s*\{)/g,
      '.doc-content $1$2'
    );
    styleBlocks.push(scoped);
    return '';
  });

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  const styleTag = styleBlocks.length > 0
    ? `<style>${styleBlocks.join('\n')}</style>`
    : '';

  return styleTag + body;
}

// List sessions
router.get('/', requireAuth, (_req, res) => {
  const sessions = db.prepare(
    'SELECT id, title, is_active, created_at, created_by FROM review_sessions ORDER BY created_at DESC'
  ).all();
  res.json(sessions);
});

// Get single session
router.get('/:id', requireAuth, (req, res) => {
  const session = db.prepare('SELECT * FROM review_sessions WHERE id = ?').get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

// Create session
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const title = req.body.title;
  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  let htmlContent: string;
  if (req.file) {
    htmlContent = req.file.buffer.toString('utf-8');
  } else if (req.body.html_content) {
    htmlContent = req.body.html_content;
  } else {
    return res.status(400).json({ error: 'HTML file or html_content is required' });
  }

  const sanitized = sanitizeHtml(htmlContent);
  const processed = extractBody(sanitized);

  const user = req.user as any;
  const id = uuidv4();
  db.prepare(
    'INSERT INTO review_sessions (id, title, html_content, created_by) VALUES (?, ?, ?, ?)'
  ).run(id, title, processed, user.id);

  const session = db.prepare(
    'SELECT id, title, is_active, created_at FROM review_sessions WHERE id = ?'
  ).get(id);

  res.status(201).json(session);
});

// Toggle session active state
router.patch('/:id', requireAdmin, (req, res) => {
  const { is_active } = req.body;
  const result = db.prepare(
    'UPDATE review_sessions SET is_active = ? WHERE id = ?'
  ).run(is_active ? 1 : 0, req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const session = db.prepare(
    'SELECT id, title, is_active FROM review_sessions WHERE id = ?'
  ).get(req.params.id);
  res.json(session);
});

export default router;
