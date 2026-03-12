import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TextAnchor } from 'shared';
import { api } from '../api/client';
import { useComments } from '../hooks/useComments';
import { DocumentViewer } from '../components/DocumentViewer';
import { CommentSidebar } from '../components/CommentSidebar';
import { SelectionPopover } from '../components/SelectionPopover';
import { CommentDialog } from '../components/CommentDialog';

interface SessionData {
  id: string;
  title: string;
  html_content: string;
  is_active: boolean;
}

export function ReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const { threads, addComment, resolveComment } = useComments(sessionId);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'doc' | 'comments'>('doc');

  // Selection state
  const [pendingAnchor, setPendingAnchor] = useState<TextAnchor | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    api
      .get(`/sessions/${sessionId}`)
      .then(res => setSession(res.data))
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleSelectText = useCallback((anchor: TextAnchor, rect: DOMRect) => {
    setPendingAnchor(anchor);
    setPopoverRect(rect);
    setShowDialog(false);
  }, []);

  const handleStartComment = useCallback(() => {
    setShowDialog(true);
    setPopoverRect(null);
  }, []);

  const handleSubmitComment = useCallback(
    async (body: string) => {
      if (!pendingAnchor) return;
      await addComment({ body, anchor: pendingAnchor });
      setPendingAnchor(null);
      setShowDialog(false);
      setMobileTab('comments');
      window.getSelection()?.removeAllRanges();
    },
    [pendingAnchor, addComment]
  );

  const handleCancelComment = useCallback(() => {
    setPendingAnchor(null);
    setPopoverRect(null);
    setShowDialog(false);
    window.getSelection()?.removeAllRanges();
  }, []);

  const handleReply = useCallback(
    async (parentId: string, body: string) => {
      await addComment({ body, parent_id: parentId });
    },
    [addComment]
  );

  const handleHighlightClick = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    // On mobile, switch to comments tab
    setMobileTab('comments');
    setTimeout(() => {
      const el = document.querySelector(`.comment-thread[data-thread-id="${threadId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }, []);

  const handleQuoteClick = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setMobileTab('doc');
    // Scroll to the highlight in the document after tab switch
    setTimeout(() => {
      const mark = document.querySelector(`mark.comment-highlight[data-thread-id="${threadId}"]`);
      if (mark) {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 50);
  }, []);

  // Clear popover on click outside
  useEffect(() => {
    const handleClick = () => {
      if (popoverRect && !showDialog) {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          setPopoverRect(null);
          setPendingAnchor(null);
        }
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [popoverRect, showDialog]);

  if (loading) return <div className="loading">Loading...</div>;
  if (!session) return <div className="loading">Session not found</div>;

  return (
    <>
      <div className="review-subheader">
        <span className="review-session-title">{session.title}</span>
        {!session.is_active && <span className="review-session-closed">Closed</span>}
      </div>

      {/* Mobile tab bar */}
      <div className="mobile-tab-bar">
        <button
          className={`mobile-tab ${mobileTab === 'doc' ? 'active' : ''}`}
          onClick={() => setMobileTab('doc')}
        >
          Document
        </button>
        <button
          className={`mobile-tab ${mobileTab === 'comments' ? 'active' : ''}`}
          onClick={() => setMobileTab('comments')}
        >
          Comments{threads.length > 0 ? ` (${threads.length})` : ''}
        </button>
      </div>

      <div className="review-layout">
        <div className={`document-panel ${mobileTab !== 'doc' ? 'mobile-hidden' : ''}`}>
          <DocumentViewer
            htmlContent={session.html_content}
            threads={threads}
            activeThreadId={activeThreadId}
            onSelectText={handleSelectText}
            onHighlightClick={handleHighlightClick}
          />
        </div>
        <CommentSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onThreadClick={setActiveThreadId}
          onReply={handleReply}
          onResolve={resolveComment}
          onQuoteClick={handleQuoteClick}
          className={mobileTab !== 'comments' ? 'mobile-hidden' : ''}
        />
      </div>

      {popoverRect && !showDialog && (
        <SelectionPopover rect={popoverRect} onComment={handleStartComment} />
      )}

      {showDialog && pendingAnchor && (
        <CommentDialog
          quote={pendingAnchor.quote}
          onSubmit={handleSubmitComment}
          onCancel={handleCancelComment}
        />
      )}
    </>
  );
}
