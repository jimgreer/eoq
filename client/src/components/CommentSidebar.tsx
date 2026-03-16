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
  onQuoteClick?: (threadId: string) => void;
  onAddTestComments?: () => void;
  className?: string;
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
  onQuoteClick,
  onAddTestComments,
  className,
}: Props) {
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

  const toggleExpanded = useCallback((threadId: string) => {
    // If manually expanding, remove from collapsed and add to expanded
    if (manuallyCollapsed.has(threadId) || !manuallyExpanded.has(threadId)) {
      setManuallyCollapsed(prev => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
      setManuallyExpanded(prev => new Set(prev).add(threadId));
    } else {
      // If manually collapsing, remove from expanded and add to collapsed
      setManuallyExpanded(prev => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
      setManuallyCollapsed(prev => new Set(prev).add(threadId));
    }
  }, [manuallyExpanded, manuallyCollapsed]);

  // Determine if a thread should be shown expanded
  const shouldShowExpanded = useCallback((thread: Thread): boolean => {
    // Active thread is always expanded
    if (thread.id === activeThreadId) return true;

    // Manually expanded threads stay expanded
    if (manuallyExpanded.has(thread.id)) return true;

    // Manually collapsed threads stay collapsed
    if (manuallyCollapsed.has(thread.id)) return false;

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

  return (
    <div className={`comment-sidebar ${className || ''}`}>
      <div className="sidebar-header">
        Comments ({threads.length})
        {onAddTestComments && (
          <button
            className="btn btn-text btn-sm"
            onClick={onAddTestComments}
            style={{ marginLeft: 'auto', fontSize: 11 }}
          >
            +6 test
          </button>
        )}
      </div>
      <div className="comment-list" ref={listRef}>
        {threads.length === 0 && (
          <p style={{ padding: 16, color: '#5f6368', fontSize: 14 }}>
            Select text in the document to add a comment.
          </p>
        )}
        {threads.map(thread => {
          const isExpanded = shouldShowExpanded(thread);
          const showCompact = useCompactMode && !isExpanded && !thread.resolved;

          return showCompact ? (
            <CompactThread
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              onClick={() => {
                toggleExpanded(thread.id);
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
              onQuoteClick={onQuoteClick ? () => onQuoteClick(thread.id) : undefined}
              onCollapse={useCompactMode ? () => toggleExpanded(thread.id) : undefined}
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
  onQuoteClick,
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
  onQuoteClick?: () => void;
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
      {thread.anchor?.quote && (
        <div
          className="comment-quote"
          onClick={e => {
            if (onQuoteClick) {
              e.stopPropagation();
              onQuoteClick();
            }
          }}
        >
          "{thread.anchor.quote.length > 100
            ? thread.anchor.quote.slice(0, 100) + '...'
            : thread.anchor.quote}"
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
      {(!thread.resolved || isExpanded) && (
        <>
          <div className="comment-actions">
            <button
              className="btn btn-text"
              onClick={e => {
                e.stopPropagation();
                setShowReply(!showReply);
              }}
            >
              Reply
            </button>
            <button
              className="btn btn-text"
              onClick={e => {
                e.stopPropagation();
                onResolve();
              }}
            >
              {thread.resolved ? 'Reopen' : 'Resolve'}
            </button>
            {onCollapse && (
              <button
                className="btn btn-text btn-collapse"
                onClick={e => {
                  e.stopPropagation();
                  onCollapse();
                }}
                title="Collapse"
              >
                &#9652;
              </button>
            )}
          </div>
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

  const time = new Date(comment.created_at + 'Z').toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

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
      <div className="comment-author">
        {comment.user.avatar_url && (
          <img src={comment.user.avatar_url} alt="" referrerPolicy="no-referrer" />
        )}
        <span className="name">{comment.user.display_name}</span>
        <span className="time">{time}</span>
        {comment.edited_at && <span className="edited">(edited)</span>}
        {canModify && !isEditing && (
          <span className="comment-modify-actions">
            <button
              className="btn-icon"
              title="Edit"
              onClick={e => {
                e.stopPropagation();
                setIsEditing(true);
                setEditText(comment.body);
              }}
            >
              &#9998;
            </button>
            <button
              className="btn-icon btn-delete"
              title="Delete"
              onClick={e => {
                e.stopPropagation();
                handleDelete();
              }}
            >
              &times;
            </button>
          </span>
        )}
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
          <div className="add-reaction-wrapper" onClick={e => e.stopPropagation()}>
            <button
              className="btn-icon add-reaction"
              title="Add reaction"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            >
              ☺
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
        </>
      )}
    </div>
  );
}
