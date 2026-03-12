import { useState } from 'react';
import type { Comment } from 'shared';

interface Thread extends Comment {
  replies?: Comment[];
}

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  onThreadClick: (threadId: string) => void;
  onReply: (parentId: string, body: string) => void;
  onResolve: (commentId: string, resolved: boolean) => void;
  onQuoteClick?: (threadId: string) => void;
  className?: string;
}

export function CommentSidebar({
  threads,
  activeThreadId,
  onThreadClick,
  onReply,
  onResolve,
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
            onClick={() => onThreadClick(thread.id)}
            onReply={body => onReply(thread.id, body)}
            onResolve={() => onResolve(thread.id, !thread.resolved)}
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
  onClick,
  onReply,
  onResolve,
  onQuoteClick,
}: {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
  onReply: (body: string) => void;
  onResolve: () => void;
  onQuoteClick?: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);

  const handleReply = () => {
    if (!replyText.trim()) return;
    onReply(replyText.trim());
    setReplyText('');
    setShowReply(false);
  };

  return (
    <div
      className={`comment-thread${isActive ? ' active' : ''}${thread.resolved ? ' resolved' : ''}`}
      data-thread-id={thread.id}
      onClick={onClick}
    >
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
      <CommentEntry comment={thread} />
      {thread.replies?.map(reply => (
        <CommentEntry key={reply.id} comment={reply} />
      ))}
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
    </div>
  );
}

function CommentEntry({ comment }: { comment: Comment }) {
  const time = new Date(comment.created_at + 'Z').toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="comment-entry">
      <div className="comment-author">
        {comment.user.avatar_url && (
          <img src={comment.user.avatar_url} alt="" referrerPolicy="no-referrer" />
        )}
        <span className="name">{comment.user.display_name}</span>
        <span className="time">{time}</span>
      </div>
      <div className="comment-body">{comment.body}</div>
    </div>
  );
}
