import { useCallback, useEffect, useRef, useState } from 'react';
import type { Comment, Reaction } from 'shared';
import { api } from '../api/client';
import { getSocket } from '../api/socket';

export function useComments(sessionId: string | undefined, currentUserId?: number, htmlContent?: string) {
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

    socket.on('comment:edited', (data: { comment_id: string; body: string; edited_at: string }) => {
      setComments(prev =>
        prev.map(c =>
          c.id === data.comment_id ? { ...c, body: data.body, edited_at: data.edited_at } : c
        )
      );
    });

    socket.on('comment:deleted', (data: { comment_id: string; parent_id: string | null }) => {
      setComments(prev => {
        if (data.parent_id === null) {
          // Top-level comment deleted, remove it and all its replies
          return prev.filter(c => c.id !== data.comment_id && c.parent_id !== data.comment_id);
        } else {
          // Reply deleted
          return prev.filter(c => c.id !== data.comment_id);
        }
      });
    });

    socket.on('reaction:updated', (data: {
      comment_id: string;
      emoji: string;
      user_id: number;
      user_name: string;
      added: boolean;
    }) => {
      setComments(prev =>
        prev.map(c => {
          if (c.id !== data.comment_id) return c;

          const reactions = c.reactions || [];
          const existingIdx = reactions.findIndex(r => r.emoji === data.emoji);

          if (data.added) {
            if (existingIdx >= 0) {
              // Add user to existing reaction
              const updated = [...reactions];
              updated[existingIdx] = {
                ...updated[existingIdx],
                count: updated[existingIdx].count + 1,
                users: [...updated[existingIdx].users, { id: data.user_id, display_name: data.user_name }],
                hasReacted: updated[existingIdx].hasReacted || data.user_id === currentUserId,
              };
              return { ...c, reactions: updated };
            } else {
              // New reaction
              return {
                ...c,
                reactions: [
                  ...reactions,
                  {
                    emoji: data.emoji,
                    count: 1,
                    users: [{ id: data.user_id, display_name: data.user_name }],
                    hasReacted: data.user_id === currentUserId,
                  },
                ],
              };
            }
          } else {
            // Remove reaction
            if (existingIdx >= 0) {
              const updated = [...reactions];
              const reaction = updated[existingIdx];
              if (reaction.count === 1) {
                // Remove entire emoji
                updated.splice(existingIdx, 1);
              } else {
                // Decrease count and remove user
                updated[existingIdx] = {
                  ...reaction,
                  count: reaction.count - 1,
                  users: reaction.users.filter(u => u.id !== data.user_id),
                  hasReacted: reaction.hasReacted && data.user_id !== currentUserId,
                };
              }
              return { ...c, reactions: updated };
            }
            return c;
          }
        })
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
      socket.off('comment:edited');
      socket.off('comment:deleted');
      socket.off('reaction:updated');
      socket.off('connect');
    };
  }, [sessionId, currentUserId]);

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

  const editComment = useCallback((commentId: string, body: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        'comment:edit',
        { comment_id: commentId, body },
        (result: any) => {
          if (result.ok) {
            resolve();
          } else {
            reject(new Error(result.error));
          }
        }
      );
    });
  }, []);

  const deleteComment = useCallback((commentId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        'comment:delete',
        { comment_id: commentId },
        (result: any) => {
          if (result.ok) {
            resolve();
          } else {
            reject(new Error(result.error));
          }
        }
      );
    });
  }, []);

  const toggleReaction = useCallback((commentId: string, emoji: string): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      socketRef.current.emit(
        'reaction:toggle',
        { comment_id: commentId, emoji },
        (result: any) => {
          if (result.ok) {
            resolve(result.added);
          } else {
            reject(new Error(result.error));
          }
        }
      );
    });
  }, []);

  // Add test comments from a fake user via API (persisted to database)
  const addTestCommentsFromOther = useCallback(async (htmlContent?: string) => {
    if (!sessionId) return;

    // Extract text snippets from the document to use as anchors
    let quotes: string[] = [];
    if (htmlContent) {
      // Parse HTML and extract text from actual content elements
      const div = document.createElement('div');
      div.innerHTML = htmlContent;

      // Get text from paragraphs, headings, and list items only
      const contentElements = div.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, td, th');
      const textBlocks: string[] = [];

      contentElements.forEach(el => {
        const text = el.textContent?.trim();
        // Only include blocks with substantial text (not just whitespace or short fragments)
        if (text && text.length > 30 && !/^[\s\d.,;:!?-]+$/.test(text)) {
          textBlocks.push(text);
        }
      });

      if (textBlocks.length >= 6) {
        // Pick 6 blocks spread throughout the document
        const step = Math.floor(textBlocks.length / 6);
        for (let i = 0; i < 6; i++) {
          const block = textBlocks[i * step];
          if (block) {
            // Take first 50 chars as the quote
            quotes.push(block.slice(0, 50).trim());
          }
        }
      } else if (textBlocks.length > 0) {
        // Use whatever blocks we have
        quotes = textBlocks.slice(0, 6).map(b => b.slice(0, 50).trim());
      }
    }

    try {
      await api.post(`/sessions/${sessionId}/test-comments`, { quotes });
      // Comments will be added via WebSocket broadcast
    } catch (err) {
      console.error('Failed to create test comments:', err);
    }
  }, [sessionId]);

  // Extract plain text from HTML for sorting (memoized)
  const docText = htmlContent ? (() => {
    const div = document.createElement('div');
    div.innerHTML = htmlContent;
    return div.textContent || '';
  })() : '';

  // Group comments into threads (top-level + replies), sorted by document position
  const threads = comments
    .filter(c => c.parent_id === null)
    .map(parent => ({
      ...parent,
      replies: comments.filter(c => c.parent_id === parent.id),
    }))
    .sort((a, b) => {
      // Sort by anchor position in document
      // Comments without anchors go to the bottom
      if (!a.anchor?.quote && !b.anchor?.quote) return 0;
      if (!a.anchor?.quote) return 1;
      if (!b.anchor?.quote) return -1;

      if (!docText) return 0;

      const posA = docText.indexOf(a.anchor.quote);
      const posB = docText.indexOf(b.anchor.quote);

      // If quote not found, put at end
      if (posA === -1 && posB === -1) return 0;
      if (posA === -1) return 1;
      if (posB === -1) return -1;

      return posA - posB;
    });

  return { threads, loading, addComment, resolveComment, editComment, deleteComment, toggleReaction, addTestCommentsFromOther };
}
