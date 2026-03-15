import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { db } from '../db.js';

const router = Router();

// Get collaborators for a session
router.get('/:sessionId/collaborators', requireAuth, (req, res) => {
  const user = req.user as any;
  const { sessionId } = req.params;

  // Check if user has access to manage this session
  const session = db.prepare(
    'SELECT created_by, access_level FROM review_sessions WHERE id = ?'
  ).get(sessionId) as any;

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Only creator or collaborators can view the list
  const isCreator = session.created_by === user.id;
  const isCollaborator = db.prepare(
    'SELECT 1 FROM session_collaborators WHERE session_id = ? AND email = ?'
  ).get(sessionId, user.email);

  if (!isCreator && !isCollaborator) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Get creator info
  const creator = db.prepare(
    'SELECT id, email, display_name, avatar_url FROM users WHERE id = ?'
  ).get(session.created_by) as any;

  // Get collaborators
  const collaborators = db.prepare(
    `SELECT sc.email, sc.added_at, u.id, u.display_name, u.avatar_url
     FROM session_collaborators sc
     LEFT JOIN users u ON sc.email = u.email
     WHERE sc.session_id = ?
     ORDER BY sc.added_at ASC`
  ).all(sessionId) as any[];

  res.json({
    access_level: session.access_level || 'restricted',
    owner: {
      id: creator.id,
      email: creator.email,
      display_name: creator.display_name,
      avatar_url: creator.avatar_url,
    },
    collaborators: collaborators.map(c => ({
      email: c.email,
      display_name: c.display_name || null,
      avatar_url: c.avatar_url || null,
      added_at: c.added_at,
      has_account: !!c.id,
    })),
  });
});

// Add a collaborator
router.post('/:sessionId/collaborators', requireAuth, (req, res) => {
  const user = req.user as any;
  const { sessionId } = req.params;
  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Check if user can manage this session
  const session = db.prepare(
    'SELECT created_by FROM review_sessions WHERE id = ?'
  ).get(sessionId) as any;

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Only creator or existing collaborators can add others
  const isCreator = session.created_by === user.id;
  const isCollaborator = db.prepare(
    'SELECT 1 FROM session_collaborators WHERE session_id = ? AND email = ?'
  ).get(sessionId, user.email);

  if (!isCreator && !isCollaborator) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Check if already a collaborator
  const existing = db.prepare(
    'SELECT 1 FROM session_collaborators WHERE session_id = ? AND email = ?'
  ).get(sessionId, normalizedEmail);

  if (existing) {
    return res.status(400).json({ error: 'Already a collaborator' });
  }

  // Check if this is the owner
  const owner = db.prepare('SELECT email FROM users WHERE id = ?').get(session.created_by) as any;
  if (owner && owner.email.toLowerCase() === normalizedEmail) {
    return res.status(400).json({ error: 'Cannot add the owner as a collaborator' });
  }

  // Add collaborator
  db.prepare(
    'INSERT INTO session_collaborators (session_id, email, added_by) VALUES (?, ?, ?)'
  ).run(sessionId, normalizedEmail, user.id);

  // Check if user exists
  const existingUser = db.prepare(
    'SELECT id, display_name, avatar_url FROM users WHERE email = ?'
  ).get(normalizedEmail) as any;

  res.json({
    email: normalizedEmail,
    display_name: existingUser?.display_name || null,
    avatar_url: existingUser?.avatar_url || null,
    added_at: new Date().toISOString(),
    has_account: !!existingUser,
  });
});

// Remove a collaborator
router.delete('/:sessionId/collaborators/:email', requireAuth, (req, res) => {
  const user = req.user as any;
  const { sessionId, email } = req.params;

  const normalizedEmail = (email as string).trim().toLowerCase();

  // Check if user can manage this session
  const session = db.prepare(
    'SELECT created_by FROM review_sessions WHERE id = ?'
  ).get(sessionId) as any;

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Only creator or the collaborator themselves can remove
  const isCreator = session.created_by === user.id;
  const isSelf = user.email.toLowerCase() === normalizedEmail;

  if (!isCreator && !isSelf) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const result = db.prepare(
    'DELETE FROM session_collaborators WHERE session_id = ? AND email = ?'
  ).run(sessionId, normalizedEmail);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Collaborator not found' });
  }

  res.json({ ok: true });
});

// Update access level
router.patch('/:sessionId/access', requireAuth, (req, res) => {
  const user = req.user as any;
  const { sessionId } = req.params;
  const { access_level } = req.body;

  if (!['restricted', 'link'].includes(access_level)) {
    return res.status(400).json({ error: 'Invalid access level' });
  }

  // Only creator can change access level
  const session = db.prepare(
    'SELECT created_by FROM review_sessions WHERE id = ?'
  ).get(sessionId) as any;

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.created_by !== user.id) {
    return res.status(403).json({ error: 'Only the owner can change access level' });
  }

  db.prepare(
    'UPDATE review_sessions SET access_level = ? WHERE id = ?'
  ).run(access_level, sessionId);

  res.json({ ok: true, access_level });
});

export default router;
