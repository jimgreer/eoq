import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { db } from '../db.js';

const router = Router();

// Get all comments for a session
router.get('/:sessionId/comments', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT c.id, c.session_id, c.parent_id, c.user_id, c.body,
            c.anchor_css_selector, c.anchor_start_offset,
            c.anchor_end_offset, c.anchor_quote,
            c.resolved, c.created_at,
            u.display_name, u.email, u.avatar_url
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.session_id = ?
     ORDER BY c.created_at ASC`
  ).all(req.params.sessionId) as any[];

  const comments = rows.map(row => ({
    id: row.id,
    session_id: row.session_id,
    parent_id: row.parent_id,
    user_id: row.user_id,
    body: row.body,
    anchor: row.anchor_css_selector
      ? {
          css_selector: row.anchor_css_selector,
          start_offset: row.anchor_start_offset,
          end_offset: row.anchor_end_offset,
          quote: row.anchor_quote,
        }
      : null,
    resolved: !!row.resolved,
    created_at: row.created_at,
    user: {
      id: row.user_id,
      display_name: row.display_name,
      email: row.email,
      avatar_url: row.avatar_url,
    },
  }));

  res.json(comments);
});

export default router;
