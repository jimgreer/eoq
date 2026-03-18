import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import type { TextAnchor } from 'shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useComments } from '../hooks/useComments';
import { DocumentViewer } from '../components/DocumentViewer';
import { CommentSidebar } from '../components/CommentSidebar';
import { SelectionPopover } from '../components/SelectionPopover';
import { CommentDialog } from '../components/CommentDialog';
import { ShareDialog } from '../components/ShareDialog';

const DEFAULT_SIDEBAR_WIDTH = 450;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 800;

interface SessionData {
  id: string;
  title: string;
  html_content: string;
  is_active: boolean;
  google_doc_id: string;
}

export function ReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState<{ googleDocId?: string; error?: string } | null>(null);
  const { threads, addComment, resolveComment, editComment, deleteComment, toggleReaction, addTestCommentsFromOther } = useComments(sessionId, user?.id, session?.html_content);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'doc' | 'comments'>('doc');
  const isNewSession = (location.state as any)?.newSession;
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, newWidth)));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleResizeStart = useCallback(() => {
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Selection state
  const [pendingAnchor, setPendingAnchor] = useState<TextAnchor | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    api
      .get(`/sessions/${sessionId}`)
      .then(res => setSession(res.data))
      .catch(err => {
        if (err.response?.status === 403) {
          setAccessDenied({
            googleDocId: err.response.data.google_doc_id,
            error: err.response.data.error,
          });
        }
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Show share dialog automatically for newly created sessions
  useEffect(() => {
    if (isNewSession && session && !loading) {
      setShowShareDialog(true);
      // Clear the state so refreshing doesn't show it again
      window.history.replaceState({}, document.title);
    }
  }, [isNewSession, session, loading]);

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

  // Scroll to highlight in document when clicking a thread
  const scrollToHighlight = useCallback((threadId: string) => {
    setTimeout(() => {
      const mark = document.querySelector(`mark.comment-highlight[data-thread-id="${threadId}"]`);
      if (mark) {
        const rect = mark.getBoundingClientRect();
        const docPanel = document.querySelector('.document-panel');
        const panelRect = docPanel?.getBoundingClientRect();
        // Check if mark is visible within the document panel
        const inViewport = panelRect &&
          rect.top >= panelRect.top &&
          rect.bottom <= panelRect.bottom;
        if (!inViewport) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 50);
  }, []);

  const handleThreadClick = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    scrollToHighlight(threadId);
  }, [scrollToHighlight]);


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
  if (accessDenied) {
    return (
      <div className="access-denied">
        <h2>Access Restricted</h2>
        {accessDenied.googleDocId ? (
          <p>
            You don't have access to{' '}
            <a
              href={`https://docs.google.com/document/d/${accessDenied.googleDocId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              the linked Google Doc
            </a>
            . Request access from the owner, then refresh this page.
          </p>
        ) : (
          <p>{accessDenied.error || 'This session is restricted to the owner.'}</p>
        )}
      </div>
    );
  }
  if (!session) return <div className="loading">Session not found</div>;

  return (
    <>
      <div className="review-subheader">
        <span className="review-session-title">{session.title}</span>
        {!session.is_active && <span className="review-session-closed">Closed</span>}
        <button
          className="btn btn-secondary btn-share"
          onClick={() => setShowShareDialog(true)}
        >
          Share
        </button>
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
        <div
          className="resize-handle"
          onMouseDown={handleResizeStart}
        />
        <CommentSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          currentUserId={user?.id}
          onThreadClick={handleThreadClick}
          onReply={handleReply}
          onResolve={resolveComment}
          onEdit={editComment}
          onDelete={deleteComment}
          onReact={toggleReaction}
          onAddTestComments={() => addTestCommentsFromOther(session.html_content)}
          className={mobileTab !== 'comments' ? 'mobile-hidden' : ''}
          style={{ width: sidebarWidth }}
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

      {showShareDialog && (
        <ShareDialog
          sessionId={sessionId!}
          sessionTitle={session.title}
          googleDocId={session.google_doc_id}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </>
  );
}
