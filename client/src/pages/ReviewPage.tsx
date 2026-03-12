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
    // Scroll sidebar to the thread
    const el = document.querySelector(`[data-thread-id="${threadId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
      <div className="review-layout">
        <div className="document-panel">
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
