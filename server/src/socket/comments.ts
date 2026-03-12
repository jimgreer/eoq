import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';

export function setupCommentHandlers(io: Server, socket: Socket) {
  const user = (socket.request as any).user;
  if (!user) return;

  socket.on('session:join', (sessionId: string) => {
    socket.join(`session:${sessionId}`);
  });

  socket.on('session:leave', (sessionId: string) => {
    socket.leave(`session:${sessionId}`);
  });

  socket.on('comment:create', (data, callback) => {
    try {
      const { session_id, parent_id, body, anchor } = data;

      if (!body?.trim()) {
        return callback({ ok: false, error: 'Comment body is required' });
      }

      if (parent_id) {
        const parent = db.prepare(
          'SELECT id, parent_id FROM comments WHERE id = ? AND session_id = ?'
        ).get(parent_id, session_id) as any;
        if (!parent) {
          return callback({ ok: false, error: 'Parent comment not found' });
        }
        if (parent.parent_id !== null) {
          return callback({ ok: false, error: 'Cannot reply to a reply' });
        }
      }

      const id = uuidv4();
      db.prepare(
        `INSERT INTO comments (id, session_id, parent_id, user_id, body,
          anchor_css_selector, anchor_start_offset, anchor_end_offset, anchor_quote)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        session_id,
        parent_id || null,
        user.id,
        body.trim(),
        anchor?.css_selector || null,
        anchor?.start_offset ?? null,
        anchor?.end_offset ?? null,
        anchor?.quote || null
      );

      const row = db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as any;

      const comment = {
        id: row.id,
        session_id: row.session_id,
        parent_id: row.parent_id,
        user_id: row.user_id,
        body: row.body,
        anchor: anchor || null,
        resolved: !!row.resolved,
        created_at: row.created_at,
        user: {
          id: user.id,
          display_name: user.display_name,
          email: user.email,
          avatar_url: user.avatar_url,
        },
      };

      io.to(`session:${session_id}`).emit('comment:new', comment);
      callback({ ok: true, comment });
    } catch (err) {
      console.error('Error creating comment:', err);
      callback({ ok: false, error: 'Failed to create comment' });
    }
  });

  socket.on('comment:resolve', (data, callback) => {
    try {
      const { comment_id, resolved } = data;

      const comment = db.prepare(
        'SELECT session_id FROM comments WHERE id = ? AND parent_id IS NULL'
      ).get(comment_id) as any;

      if (!comment) {
        return callback({ ok: false, error: 'Comment not found' });
      }

      db.prepare('UPDATE comments SET resolved = ? WHERE id = ?').run(
        resolved ? 1 : 0,
        comment_id
      );

      io.to(`session:${comment.session_id}`).emit('comment:resolved', { comment_id, resolved });
      callback({ ok: true });
    } catch (err) {
      console.error('Error resolving comment:', err);
      callback({ ok: false, error: 'Failed to resolve comment' });
    }
  });
}
