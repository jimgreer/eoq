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
        edited_at: null,
        user: {
          id: user.id,
          display_name: user.display_name,
          email: user.email,
          avatar_url: user.avatar_url,
        },
        reactions: [],
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

  socket.on('comment:edit', (data, callback) => {
    try {
      const { comment_id, body } = data;

      if (!body?.trim()) {
        return callback({ ok: false, error: 'Comment body is required' });
      }

      const comment = db.prepare(
        'SELECT session_id, user_id FROM comments WHERE id = ?'
      ).get(comment_id) as any;

      if (!comment) {
        return callback({ ok: false, error: 'Comment not found' });
      }

      if (comment.user_id !== user.id) {
        return callback({ ok: false, error: 'You can only edit your own comments' });
      }

      const edited_at = new Date().toISOString().replace('T', ' ').slice(0, 19);
      db.prepare('UPDATE comments SET body = ?, edited_at = ? WHERE id = ?').run(
        body.trim(),
        edited_at,
        comment_id
      );

      io.to(`session:${comment.session_id}`).emit('comment:edited', {
        comment_id,
        body: body.trim(),
        edited_at,
      });
      callback({ ok: true, edited_at });
    } catch (err) {
      console.error('Error editing comment:', err);
      callback({ ok: false, error: 'Failed to edit comment' });
    }
  });

  socket.on('comment:delete', (data, callback) => {
    try {
      const { comment_id } = data;

      const comment = db.prepare(
        'SELECT session_id, user_id, parent_id FROM comments WHERE id = ?'
      ).get(comment_id) as any;

      if (!comment) {
        return callback({ ok: false, error: 'Comment not found' });
      }

      if (comment.user_id !== user.id) {
        return callback({ ok: false, error: 'You can only delete your own comments' });
      }

      // If this is a top-level comment, also delete all replies
      db.prepare('DELETE FROM comments WHERE id = ? OR parent_id = ?').run(
        comment_id,
        comment_id
      );

      io.to(`session:${comment.session_id}`).emit('comment:deleted', {
        comment_id,
        parent_id: comment.parent_id,
      });
      callback({ ok: true });
    } catch (err) {
      console.error('Error deleting comment:', err);
      callback({ ok: false, error: 'Failed to delete comment' });
    }
  });

  socket.on('reaction:toggle', (data, callback) => {
    try {
      const { comment_id, emoji } = data;

      // Validate emoji is one of our allowed set
      const allowedEmojis = ['👍', '👎', '❤️', '🎉', '😄', '🤔'];
      if (!allowedEmojis.includes(emoji)) {
        return callback({ ok: false, error: 'Invalid emoji' });
      }

      const comment = db.prepare(
        'SELECT session_id FROM comments WHERE id = ?'
      ).get(comment_id) as any;

      if (!comment) {
        return callback({ ok: false, error: 'Comment not found' });
      }

      // Check if user already reacted with this emoji
      const existing = db.prepare(
        'SELECT id FROM reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?'
      ).get(comment_id, user.id, emoji);

      let added: boolean;
      if (existing) {
        // Remove reaction
        db.prepare(
          'DELETE FROM reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?'
        ).run(comment_id, user.id, emoji);
        added = false;
      } else {
        // Add reaction
        db.prepare(
          'INSERT INTO reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)'
        ).run(comment_id, user.id, emoji);
        added = true;
      }

      io.to(`session:${comment.session_id}`).emit('reaction:updated', {
        comment_id,
        emoji,
        user_id: user.id,
        user_name: user.display_name,
        added,
      });
      callback({ ok: true, added });
    } catch (err) {
      console.error('Error toggling reaction:', err);
      callback({ ok: false, error: 'Failed to toggle reaction' });
    }
  });
}
