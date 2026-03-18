import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { db } from '../db.js';
import { checkDriveAccess, exportGoogleDoc } from '../services/drivePermissions.js';

const router = Router();

// Extract plain text from HTML for search indexing
function extractText(html: string): string {
  // Remove style and script tags and their contents
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
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

// List sessions (only those user created)
router.get('/', requireAuth, (req, res) => {
  const user = req.user as any;
  const searchQuery = req.query.q as string | undefined;

  let sql = `
    SELECT
      rs.id, rs.title, rs.is_active, rs.created_at, rs.created_by, rs.google_doc_id,
      u.display_name AS creator_name,
      (SELECT COUNT(*) FROM comments c WHERE c.session_id = rs.id) AS comment_count,
      (SELECT MAX(c.created_at) FROM comments c WHERE c.session_id = rs.id) AS last_activity
    FROM review_sessions rs
    LEFT JOIN users u ON rs.created_by = u.id
    WHERE rs.created_by = ?
  `;

  const params: any[] = [user.id];

  if (searchQuery && searchQuery.trim()) {
    sql += ` AND (rs.title LIKE ? OR rs.search_text LIKE ? OR u.display_name LIKE ?)`;
    const pattern = `%${searchQuery.trim()}%`;
    params.push(pattern, pattern, pattern);
  }

  sql += ` ORDER BY rs.created_at DESC`;

  const sessions = db.prepare(sql).all(...params);
  res.json(sessions);
});

// Get single session (with access control)
router.get('/:id', requireAuth, async (req, res) => {
  const session = db.prepare('SELECT * FROM review_sessions WHERE id = ?').get(req.params.id) as any;
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const user = req.user as any;
  const isCreator = session.created_by === user.id;

  // Check access permissions
  // If creator → allow
  // If linked to Google Doc → check Drive permissions using creator's token
  // Otherwise → restricted to owner only
  if (!isCreator) {
    if (session.google_doc_id) {
      // Check if user's email is in the doc's permission list (using creator's Drive token)
      const { hasAccess, creatorNeedsDriveAuth } = await checkDriveAccess(
        session.created_by,
        user.email,
        session.google_doc_id
      );
      if (!hasAccess) {
        return res.status(403).json({
          error: creatorNeedsDriveAuth
            ? 'The session owner needs to re-authenticate with Google Drive'
            : 'You do not have access to the linked Google Doc',
          google_doc_id: session.google_doc_id,
        });
      }
    } else {
      // No linked doc = restricted to owner only
      return res.status(403).json({
        error: 'This session is restricted to the owner',
      });
    }
  }

  res.json(session);
});

// Create session from Google Doc (via picker)
router.post('/', requireAuth, async (req, res) => {
  const user = req.user as any;
  const googleDocId = req.body.google_doc_id;

  if (!googleDocId) {
    return res.status(400).json({ error: 'Google Doc ID is required' });
  }

  // Export the doc as HTML
  const result = await exportGoogleDoc(user.id, googleDocId);
  if ('error' in result) {
    return res.status(result.needsDriveAuth ? 403 : 400).json({
      error: result.error,
      needsDriveAuth: result.needsDriveAuth,
    });
  }

  const processed = extractBody(result.html);
  const searchText = extractText(result.html);

  const id = uuidv4();
  db.prepare(
    'INSERT INTO review_sessions (id, title, html_content, search_text, created_by, google_doc_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, result.title, processed, searchText, user.id, googleDocId);

  const session = db.prepare(
    `SELECT rs.id, rs.title, rs.is_active, rs.created_at, rs.created_by, rs.google_doc_id, u.display_name AS creator_name
     FROM review_sessions rs
     LEFT JOIN users u ON rs.created_by = u.id
     WHERE rs.id = ?`
  ).get(id) as any;

  res.status(201).json({ ...session, comment_count: 0, last_activity: null });
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

// Delete session (creator only)
router.delete('/:id', requireAuth, (req, res) => {
  const user = req.user as any;
  const session = db.prepare('SELECT created_by FROM review_sessions WHERE id = ?').get(req.params.id) as any;

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  if (session.created_by !== user.id) {
    return res.status(403).json({ error: 'Only the session creator can delete it' });
  }

  db.prepare('DELETE FROM review_sessions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
