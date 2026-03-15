import { useState } from 'react';
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
  onQuoteClick?: (threadId: string) => void;
  className?: string;
}

export function CommentSidebar({
  threads,
  activeThreadId,
  currentUserId,
  onThreadClick,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  onQuoteClick,
  className,
}: Props) {
  return (
    <div className={`comment-sidebar ${className || ''}`}>
      <div className="sidebar-header">
        Comments ({threads.length})
      </div>
      <div className="comment-list">
        {threads.length === 0 && (
          <p style={{ padding: 16, color: '#5f6368', fontSize: 14 }}>
            Select text in the document to add a comment.
          </p>
        )}
        {threads.map(thread => (
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
            onQuoteClick={onQuoteClick ? () => onQuoteClick(thread.id) : undefined}
          />
        ))}
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
  onQuoteClick,
}: {
  thread: Thread;
  isActive: boolean;
  currentUserId?: number;
  onClick: () => void;
  onReply: (body: string) => void;
  onResolve: () => void;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
  onQuoteClick?: () => void;
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
          />
          {thread.replies?.map(reply => (
            <CommentEntry
              key={reply.id}
              comment={reply}
              canModify={currentUserId === reply.user_id}
              onEdit={onEdit}
              onDelete={onDelete}
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

function CommentEntry({
  comment,
  canModify,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  canModify: boolean;
  onEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);

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
        <div className="comment-body">{comment.body}</div>
      )}
    </div>
  );
}
