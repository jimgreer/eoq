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

  // Parse HTML for sorting - we need the DOM structure to compute anchor positions
  const docContainer = htmlContent ? (() => {
    const div = document.createElement('div');
    div.innerHTML = htmlContent;
    return div;
  })() : null;

  // Compute document-level offset for an anchor using its CSS selector and start_offset
  const getAnchorPosition = (anchor: Comment['anchor']): number => {
    if (!anchor || !docContainer) return Infinity;

    // Find the target element using the CSS selector
    let targetEl: Element | null = docContainer;
    if (anchor.css_selector) {
      targetEl = docContainer.querySelector(anchor.css_selector);
    }

    if (!targetEl) {
      // Fallback: search for quote text
      const text = docContainer.textContent || '';
      const pos = text.indexOf(anchor.quote);
      return pos === -1 ? Infinity : pos;
    }

    // Calculate absolute offset: count characters before this element + start_offset
    const walker = document.createTreeWalker(docContainer, NodeFilter.SHOW_TEXT);
    let charCount = 0;
    let foundElement = false;

    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text;
      // Check if this text node is inside our target element
      if (targetEl.contains(textNode)) {
        if (!foundElement) {
          foundElement = true;
          // Add the start_offset within this element
          return charCount + (anchor.start_offset || 0);
        }
      } else if (!foundElement) {
        charCount += textNode.textContent?.length || 0;
      }
    }

    return Infinity;
  };

  // Group comments into threads (top-level + replies), sorted by document position
  const threads = comments
    .filter(c => c.parent_id === null)
    .map(parent => ({
      ...parent,
      replies: comments.filter(c => c.parent_id === parent.id),
    }))
    .sort((a, b) => {
      const posA = getAnchorPosition(a.anchor);
      const posB = getAnchorPosition(b.anchor);
      return posA - posB;
    });

  return { threads, loading, addComment, resolveComment, editComment, deleteComment, toggleReaction };
}
