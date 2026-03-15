import { Router } from 'express';
import multer from 'multer';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import { v4 as uuidv4 } from 'uuid';
import AdmZip from 'adm-zip';
import path from 'path';
import { requireAuth, requireAdmin } from '../auth/middleware.js';
import { db } from '../db.js';
import { extractGoogleDocId, checkDriveAccess } from '../services/drivePermissions.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB for zips with images

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
    `SELECT rs.id, rs.title, rs.is_active, rs.created_at, rs.created_by, rs.google_doc_id, u.display_name AS creator_name
     FROM review_sessions rs
     LEFT JOIN users u ON rs.created_by = u.id
     ORDER BY rs.created_at DESC`
  ).all();
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
  const accessLevel = session.access_level || 'restricted';

  // Check access permissions
  if (!isCreator && accessLevel === 'restricted') {
    // Check if user is a collaborator
    const isCollaborator = db.prepare(
      'SELECT 1 FROM session_collaborators WHERE session_id = ? AND email = ?'
    ).get(req.params.id, user.email);

    if (!isCollaborator) {
      // If session is linked to a Google Doc, check Drive permissions as fallback
      if (session.google_doc_id) {
        const { hasAccess, needsDriveAuth } = await checkDriveAccess(user.id, session.google_doc_id);
        if (!hasAccess) {
          return res.status(403).json({
            error: 'You do not have access to this session',
            needsDriveAuth,
            google_doc_id: session.google_doc_id,
          });
        }
      } else {
        return res.status(403).json({
          error: 'You do not have access to this session',
        });
      }
    }
  }

  res.json(session);
});

// MIME types for common image formats
const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

// Extract HTML from zip and embed images as base64
function extractFromZip(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // Find the HTML file (should be at root level)
  const htmlEntry = entries.find(e => !e.isDirectory && e.entryName.endsWith('.html'));
  if (!htmlEntry) {
    throw new Error('No HTML file found in zip');
  }

  let html = htmlEntry.getData().toString('utf-8');

  // Build a simple map of basenames to entries (not data, to save memory)
  const imageEntries = new Map<string, typeof entries[0]>();
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (MIME_TYPES[ext]) {
      imageEntries.set(entry.entryName, entry);
      imageEntries.set(path.basename(entry.entryName), entry);
    }
  }

  // Replace image src attributes with base64 data URLs (load each image only when needed)
  html = html.replace(/(<img[^>]*\ssrc=["'])([^"']+)(["'][^>]*>)/gi, (match, before, src, after) => {
    const decodedSrc = decodeURIComponent(src);
    const entry = imageEntries.get(src) || imageEntries.get(decodedSrc) ||
                  imageEntries.get(path.basename(src)) || imageEntries.get(path.basename(decodedSrc));
    if (entry) {
      const ext = path.extname(entry.entryName).toLowerCase();
      const mimeType = MIME_TYPES[ext];
      const base64 = entry.getData().toString('base64');
      return before + `data:${mimeType};base64,${base64}` + after;
    }
    return match;
  });

  return html;
}

// Extract title from filename, converting CamelCase to spaces
function extractTitleFromFilename(filename: string): string {
  // Remove extension
  const name = filename.replace(/\.(html?|zip)$/i, '');
  // Insert space before capitals (but not at start, and handle consecutive caps like "Q1")
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase -> camel Case
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');  // XMLParser -> XML Parser
  return spaced || 'Untitled Document';
}

// Create session
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  let htmlContent: string;
  let title: string;
  let skipSanitize = false;

  if (req.file) {
    const isZip = req.file.originalname.toLowerCase().endsWith('.zip') ||
                  req.file.mimetype === 'application/zip';

    if (isZip) {
      try {
        htmlContent = extractFromZip(req.file.buffer);
        // Skip heavy DOMPurify for zip files - content is from Google Docs (trusted)
        skipSanitize = true;
      } catch (err: any) {
        return res.status(400).json({ error: err.message || 'Failed to extract zip' });
      }
    } else {
      htmlContent = req.file.buffer.toString('utf-8');
    }
    title = extractTitleFromFilename(req.file.originalname);
  } else if (req.body.html_content) {
    htmlContent = req.body.html_content;
    title = 'Untitled Document';
  } else {
    return res.status(400).json({ error: 'HTML file or html_content is required' });
  }

  const sanitized = skipSanitize ? htmlContent : sanitizeHtml(htmlContent);
  const processed = extractBody(sanitized);

  // Extract Google Doc ID if a URL was provided
  const googleDocUrl = req.body.google_doc_url;
  let googleDocId: string | null = null;
  if (googleDocUrl) {
    googleDocId = extractGoogleDocId(googleDocUrl);
    if (!googleDocId) {
      return res.status(400).json({ error: 'Invalid Google Doc URL' });
    }
  }

  const user = req.user as any;
  const id = uuidv4();
  db.prepare(
    'INSERT INTO review_sessions (id, title, html_content, created_by, google_doc_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, title, processed, user.id, googleDocId);

  const session = db.prepare(
    `SELECT rs.id, rs.title, rs.is_active, rs.created_at, rs.google_doc_id, u.display_name AS creator_name
     FROM review_sessions rs
     LEFT JOIN users u ON rs.created_by = u.id
     WHERE rs.id = ?`
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
