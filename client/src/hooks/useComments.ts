import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comment } from 'shared';
import { api } from '../api/client';
import { getSocket } from '../api/socket';

export function useComments(sessionId: string | undefined) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(getSocket());

  useEffect(() => {
    if (!sessionId) return;

    const socket = socketRef.current;
    if (!socket.connected) socket.connect();

    // Fetch existing comments
    api
      .get(`/sessions/${sessionId}/comments`)
      .then(res => setComments(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    // Join the session room
    socket.emit('session:join', sessionId);

    // Listen for new comments
    socket.on('comment:new', (comment: Comment) => {
      setComments(prev => [...prev, comment]);
    });

    socket.on('comment:resolved', (data: { comment_id: string; resolved: boolean }) => {
      setComments(prev =>
        prev.map(c =>
          c.id === data.comment_id ? { ...c, resolved: data.resolved } : c
        )
      );
    });

    // Re-fetch on reconnect (in case we missed events)
    socket.on('connect', () => {
      socket.emit('session:join', sessionId);
      api
        .get(`/sessions/${sessionId}/comments`)
        .then(res => setComments(res.data))
        .catch(console.error);
    });

    return () => {
      socket.emit('session:leave', sessionId);
      socket.off('comment:new');
      socket.off('comment:resolved');
      socket.off('connect');
    };
  }, [sessionId]);

  const addComment = useCallback(
    (data: { body: string; parent_id?: string; anchor?: any }): Promise<Comment> => {
      return new Promise((resolve, reject) => {
        socketRef.current.emit(
          'comment:create',
          { session_id: sessionId, ...data },
          (result: any) => {
            if (result.ok) {
              resolve(result.comment);
            } else {
              reject(new Error(result.error));
            }
          }
        );
      });
    },
    [sessionId]
  );

  const resolveComment = useCallback((commentId: string, resolved: boolean) => {
    socketRef.current.emit(
      'comment:resolve',
      { comment_id: commentId, resolved },
      (result: any) => {
        if (!result.ok) console.error('Failed to resolve:', result.error);
      }
    );
  }, []);

  // Group comments into threads (top-level + replies)
  const threads = comments
    .filter(c => c.parent_id === null)
    .map(parent => ({
      ...parent,
      replies: comments.filter(c => c.parent_id === parent.id),
    }));

  return { threads, loading, addComment, resolveComment };
}
