import { useState, useEffect, useRef, useCallback } from 'react';
import type { Comment } from 'shared';

interface Thread extends Comment {
  replies?: Comment[];
}

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  currentUserId?: number;
  onThreadClick: (threadId: string) => void;
  onReply: (parentId: string, body: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => Promise<boolean>;
  onAddTestComments?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const COMPACT_THRESHOLD = 5; // Switch to compact mode when more than this many threads

export function CommentSidebar({
  threads,
  activeThreadId,
  currentUserId,
  onThreadClick,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  onReact,
  onAddTestComments,
  className,
  style,
}: Props) {
  // Filter state
  const [showResolved, setShowResolved] = useState(false);

  // Track manually expanded/collapsed threads
  const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(new Set());
  const [manuallyCollapsed, setManuallyCollapsed] = useState<Set<string>>(new Set());

  // Track threads that existed on initial load (they stay expanded by default)
  const initialThreadIds = useRef<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  // Track off-screen threads for auto-collapse
  const [offScreenThreads, setOffScreenThreads] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);

  // Initialize with existing threads on first render
  useEffect(() => {
    if (!initialized && threads.length > 0) {
      initialThreadIds.current = new Set(threads.map(t => t.id));
      setInitialized(true);
    }
  }, [threads, initialized]);

  // When a thread becomes active (e.g., clicking highlight), auto-expand it
  const prevActiveThreadId = useRef<string | null>(null);
  useEffect(() => {
    if (activeThreadId && activeThreadId !== prevActiveThreadId.current) {
      if (manuallyCollapsed.has(activeThreadId)) {
        setManuallyCollapsed(prev => {
          const next = new Set(prev);
          next.delete(activeThreadId);
          return next;
        });
      }
    }
    prevActiveThreadId.current = activeThreadId;
  }, [activeThreadId, manuallyCollapsed]);

  // Set up IntersectionObserver to track off-screen threads
  useEffect(() => {
    if (!listRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        setOffScreenThreads(prev => {
          const next = new Set(prev);
          entries.forEach(entry => {
            const threadId = entry.target.getAttribute('data-thread-id');
            if (threadId) {
              if (entry.isIntersecting) {
                next.delete(threadId);
              } else {
                next.add(threadId);
              }
            }
          });
          return next;
        });
      },
      { root: listRef.current, threshold: 0 }
    );

    // Observe all thread elements
    const threadElements = listRef.current.querySelectorAll('.comment-thread');
    threadElements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [threads]);

  const useCompactMode = threads.length > COMPACT_THRESHOLD;

  const toggleExpanded = useCallback((threadId: string, currentlyExpanded: boolean) => {
    if (currentlyExpanded) {
      setManuallyExpanded(prev => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
      setManuallyCollapsed(prev => new Set(prev).add(threadId));
    } else {
      setManuallyCollapsed(prev => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
      setManuallyExpanded(prev => new Set(prev).add(threadId));
    }
  }, []);

  // Determine if a thread should be shown expanded
  const shouldShowExpanded = useCallback((thread: Thread): boolean => {
    // Manual expand/collapse always takes precedence
    if (manuallyExpanded.has(thread.id)) return true;
    if (manuallyCollapsed.has(thread.id)) return false;

    // Active thread is expanded by default
    if (thread.id === activeThreadId) return true;

    // Your own comments always show expanded
    if (thread.user_id === currentUserId) return true;

    // Resolved threads have their own collapse logic
    if (thread.resolved) return false;

    // Initial threads (existed on page load) stay expanded
    if (initialThreadIds.current.has(thread.id)) return true;

    // In compact mode, new threads start collapsed
    if (useCompactMode) return false;

    // Off-screen threads get collapsed (only in compact mode with many threads)
    if (useCompactMode && offScreenThreads.has(thread.id)) return false;

    return true;
  }, [activeThreadId, manuallyExpanded, manuallyCollapsed, currentUserId, useCompactMode, offScreenThreads]);

  // Filter threads based on resolved state
  const resolvedCount = threads.filter(t => t.resolved).length;
  const visibleThreads = showResolved ? threads : threads.filter(t => !t.resolved);

  return (
    <div className={`comment-sidebar ${className || ''}`} style={style}>
      <div className="sidebar-header">
        <span>Comments ({threads.length - resolvedCount})</span>
        <label className="show-resolved-toggle">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
          />
          Show resolved ({resolvedCount})
        </label>
        {onAddTestComments && (
          <button
            className="btn btn-text btn-sm"
            onClick={onAddTestComments}
            style={{ fontSize: 11 }}
          >
            +6 test
          </button>
        )}
      </div>
      <div className="comment-list" ref={listRef}>
        {visibleThreads.length === 0 && (
          <p style={{ padding: 16, color: '#5f6368', fontSize: 14 }}>
            Select text in the document to add a comment.
          </p>
        )}
        {visibleThreads.map(thread => {
          const isExpanded = shouldShowExpanded(thread);
          const showCompact = useCompactMode && !isExpanded && !thread.resolved;

          return showCompact ? (
            <CompactThread
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onClick={() => {
                toggleExpanded(thread.id, false);
                onThreadClick(thread.id);
              }}
            />
          ) : (
            <CommentThread
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              currentUserId={currentUserId}
              onClick={() => onThreadClick(thread.id)}
              onReply={body => onReply(thread.id, body)}
              onResolve={() => onResolve(thread.id, !thread.resolved)}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
              onCollapse={() => toggleExpanded(thread.id, isExpanded)}
            />
          );
        })}
      </div>
    </div>
  );
}

function CompactThread({
  thread,
  isActive,
  onClick,
}: {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
}) {
  const replyCount = thread.replies?.length || 0;

  return (
    <div
      className={`comment-thread compact${isActive ? ' active' : ''}`}
      data-thread-id={thread.id}
      onClick={onClick}
    >
      <div className="compact-content">
        {thread.user.avatar_url && (
          <img src={thread.user.avatar_url} alt="" className="compact-avatar" referrerPolicy="no-referrer" />
        )}
        <span className="compact-name">{thread.user.display_name}</span>
        <span className="compact-text">{thread.body}</span>
        {replyCount > 0 && (
          <span className="compact-replies">+{replyCount}</span>
        )}
        <span className="compact-expand">&#9662;</span>
      </div>
    </div>
  );
}

function CommentThread({
  thread,
  isActive,
  currentUserId,
  onClick,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  onReact,
  onCollapse,
}: {
  thread: Thread;
  isActive: boolean;
  currentUserId?: number;
  onClick: () => void;
  onReply: (body: string) => void;
  onResolve: () => void;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => Promise<boolean>;
  onCollapse?: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [isExpanded, setIsExpanded] = useState(!thread.resolved);

  const handleReply = () => {
    if (!replyText.trim()) return;
    onReply(replyText.trim());
    setReplyText('');
    setShowReply(false);
  };

  const handleClick = () => {
    if (thread.resolved && !isExpanded) {
      setIsExpanded(true);
    }
    onClick();
  };

  return (
    <div
      className={`comment-thread${isActive ? ' active' : ''}${thread.resolved ? ' resolved' : ''}${thread.resolved && !isExpanded ? ' collapsed' : ''}`}
      data-thread-id={thread.id}
      onClick={handleClick}
    >
      {thread.resolved && (
        <div className="resolved-badge">
          <span className="checkmark">&#10003;</span> Resolved
          {!isExpanded && thread.replies && thread.replies.length > 0 && (
            <span className="reply-count"> ({thread.replies.length + 1} comments)</span>
          )}
        </div>
      )}
      {(!thread.resolved || isExpanded) && (
        <>
          <CommentEntry
            comment={thread}
            canModify={currentUserId === thread.user_id}
            onEdit={onEdit}
            onDelete={onDelete}
            onReact={onReact}
          />
          {thread.replies?.map(reply => (
            <CommentEntry
              key={reply.id}
              comment={reply}
              canModify={currentUserId === reply.user_id}
              onEdit={onEdit}
              onDelete={onDelete}
              onReact={onReact}
            />
          ))}
        </>
      )}
      {/* Thread action icons - appear on hover */}
      <div className="thread-actions">
        <button
          className="btn-icon"
          title="Reply"
          onClick={e => {
            e.stopPropagation();
            setShowReply(!showReply);
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
          </svg>
        </button>
        <button
          className="btn-icon"
          title={thread.resolved ? 'Reopen' : 'Resolve'}
          onClick={e => {
            e.stopPropagation();
            onResolve();
          }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
        </button>
      </div>

      {/* Collapse button - bottom right */}
      {onCollapse && (
        <button
          className="btn-icon collapse-btn"
          title="Collapse"
          onClick={e => {
            e.stopPropagation();
            onCollapse();
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
          </svg>
        </button>
      )}

      {(!thread.resolved || isExpanded) && (
        <>
          {showReply && (
            <div className="reply-form" onClick={e => e.stopPropagation()}>
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Reply..."
                onKeyDown={e => {
                  if (e.key === 'Enter') handleReply();
                }}
                autoFocus
              />
              <button className="btn btn-primary" onClick={handleReply}>
                Send
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EMOJI_OPTIONS = ['👍', '👎', '❤️', '🎉', '😄', '🤔'];

function CommentEntry({
  comment,
  canModify,
  onEdit,
  onDelete,
  onReact,
}: {
  comment: Comment;
  canModify: boolean;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onReact: (commentId: string, emoji: string) => Promise<boolean>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const handleSaveEdit = async () => {
    if (!editText.trim() || editText.trim() === comment.body) {
      setIsEditing(false);
      setEditText(comment.body);
      return;
    }
    try {
      await onEdit(comment.id, editText.trim());
      setIsEditing(false);
    } catch {
      alert('Failed to save edit');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this comment?')) return;
    try {
      await onDelete(comment.id);
    } catch {
      alert('Failed to delete comment');
    }
  };

  const handleReact = async (emoji: string) => {
    setShowEmojiPicker(false);
    try {
      await onReact(comment.id, emoji);
    } catch {
      alert('Failed to add reaction');
    }
  };

  return (
    <div className="comment-entry">
      <div className="comment-header">
        <div className="comment-author">
          {comment.user.avatar_url && (
            <img src={comment.user.avatar_url} alt="" referrerPolicy="no-referrer" />
          )}
          <span className="name">{comment.user.display_name}</span>
        </div>
        {/* Entry action icons - appear on hover */}
        <div className="entry-actions">
          {canModify && !isEditing && (
            <>
              <button
                className="btn-icon"
                title="Edit"
                onClick={e => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setEditText(comment.body);
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </button>
              <button
                className="btn-icon btn-delete"
                title="Delete"
                onClick={e => {
                  e.stopPropagation();
                  handleDelete();
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </>
          )}
          <button
            className="btn-icon"
            title="Add reaction"
            onClick={e => {
              e.stopPropagation();
              setShowEmojiPicker(!showEmojiPicker);
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
            </svg>
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker">
              {EMOJI_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  className="emoji-option"
                  onClick={() => handleReact(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {isEditing ? (
        <div className="edit-form" onClick={e => e.stopPropagation()}>
          <input
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') {
                setIsEditing(false);
                setEditText(comment.body);
              }
            }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleSaveEdit}>
            Save
          </button>
          <button
            className="btn btn-text btn-sm"
            onClick={() => {
              setIsEditing(false);
              setEditText(comment.body);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="comment-body">{comment.body}</div>
          {comment.reactions && comment.reactions.length > 0 && (
            <div className="comment-reactions" onClick={e => e.stopPropagation()}>
              {comment.reactions.map(reaction => (
                <button
                  key={reaction.emoji}
                  className={`reaction-chip${reaction.hasReacted ? ' reacted' : ''}`}
                  title={reaction.users.map(u => u.display_name).join(', ')}
                  onClick={() => handleReact(reaction.emoji)}
                >
                  {reaction.emoji} {reaction.count}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
