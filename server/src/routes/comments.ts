import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth } from '../auth/middleware.js';
import { db } from '../db.js';
import { getIO } from '../socket/index.js';

const router = Router();

// Get all comments for a session
router.get('/:sessionId/comments', requireAuth, (req, res) => {
  const currentUserId = (req.user as any).id;

  const rows = db.prepare(
    `SELECT c.id, c.session_id, c.parent_id, c.user_id, c.body,
            c.anchor_css_selector, c.anchor_start_offset,
            c.anchor_end_offset, c.anchor_quote,
            c.resolved, c.created_at, c.edited_at,
            u.display_name, u.email, u.avatar_url
     FROM comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.session_id = ?
     ORDER BY c.created_at ASC`
  ).all(req.params.sessionId) as any[];

  // Fetch all reactions for comments in this session
  const reactionRows = db.prepare(
    `SELECT r.comment_id, r.emoji, r.user_id, u.display_name
     FROM reactions r
     JOIN users u ON r.user_id = u.id
     WHERE r.comment_id IN (SELECT id FROM comments WHERE session_id = ?)`
  ).all(req.params.sessionId) as any[];

  // Group reactions by comment_id and emoji
  const reactionsByComment = new Map<string, Map<string, { users: any[]; count: number }>>();
  for (const r of reactionRows) {
    if (!reactionsByComment.has(r.comment_id)) {
      reactionsByComment.set(r.comment_id, new Map());
    }
    const emojiMap = reactionsByComment.get(r.comment_id)!;
    if (!emojiMap.has(r.emoji)) {
      emojiMap.set(r.emoji, { users: [], count: 0 });
    }
    const entry = emojiMap.get(r.emoji)!;
    entry.users.push({ id: r.user_id, display_name: r.display_name });
    entry.count++;
  }

  const comments = rows.map(row => {
    const emojiMap = reactionsByComment.get(row.id);
    const reactions = emojiMap
      ? Array.from(emojiMap.entries()).map(([emoji, data]) => ({
          emoji,
          count: data.count,
          users: data.users,
          hasReacted: data.users.some((u: any) => u.id === currentUserId),
        }))
      : [];

    return {
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
      edited_at: row.edited_at || null,
      user: {
        id: row.user_id,
        display_name: row.display_name,
        email: row.email,
        avatar_url: row.avatar_url,
      },
      reactions,
    };
  });

  res.json(comments);
});

// Create test comments from a fake user (for testing)
router.post('/:sessionId/test-comments', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  const { quotes } = req.body as { quotes: string[] };

  // Ensure test user exists
  const testUser = db.prepare(
    `INSERT OR IGNORE INTO users (id, google_id, email, display_name, avatar_url)
     VALUES (-999, 'test-user', 'test@example.com', 'Test User', NULL)`
  ).run();

  const testUserData = {
    id: -999,
    display_name: 'Test User',
    email: 'test@example.com',
    avatar_url: null,
  };

  const testCommentBodies = [
    'This is a great point, I think we should expand on it.',
    'I have some concerns about this section.',
    'Can we get more data to support this claim?',
    'Love this! Very well written.',
    'This needs to be reviewed by legal before we proceed.',
    'Consider rephrasing for clarity.',
  ];

  const insertStmt = db.prepare(
    `INSERT INTO comments (id, session_id, user_id, body, anchor_css_selector, anchor_start_offset, anchor_end_offset, anchor_quote)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const io = getIO();
  const createdComments = [];

  for (let i = 0; i < Math.min(testCommentBodies.length, quotes?.length || 6); i++) {
    const id = randomUUID();
    const body = testCommentBodies[i];
    const quote = quotes?.[i] || `Test selection ${i + 1}`;

    insertStmt.run(id, sessionId, -999, body, '', 0, 0, quote);

    const comment = {
      id,
      session_id: sessionId,
      parent_id: null,
      user_id: -999,
      body,
      anchor: { css_selector: '', start_offset: 0, end_offset: 0, quote },
      resolved: false,
      created_at: new Date().toISOString(),
      edited_at: null,
      user: testUserData,
      reactions: [],
    };

    createdComments.push(comment);
    io.to(`session:${sessionId}`).emit('comment:new', comment);
  }

  res.json(createdComments);
});

export default router;
