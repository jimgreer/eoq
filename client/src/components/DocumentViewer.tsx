import { useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import type { Comment, TextAnchor } from 'shared';
import { resolveAnchor, serializeSelection } from '../lib/anchoring';

interface Props {
  htmlContent: string;
  threads: (Comment & { replies?: Comment[] })[];
  activeThreadId: string | null;
  onSelectText: (anchor: TextAnchor, rect: DOMRect) => void;
  onHighlightClick: (threadId: string) => void;
}

export function DocumentViewer({
  htmlContent,
  threads,
  activeThreadId,
  onSelectText,
  onHighlightClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightsApplied = useRef(false);

  // Render the HTML content
  useEffect(() => {
    if (!containerRef.current) return;
    const clean = DOMPurify.sanitize(htmlContent, {
      ADD_TAGS: ['style'],
      ADD_ATTR: ['class', 'style', 'id'],
    });
    containerRef.current.innerHTML = clean;
    highlightsApplied.current = false;
  }, [htmlContent]);

  // Apply highlights
  useEffect(() => {
    if (!containerRef.current) return;

    // Remove existing highlights
    containerRef.current.querySelectorAll('mark.comment-highlight').forEach(mark => {
      const parent = mark.parentNode;
      if (parent) {
        while (mark.firstChild) {
          parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
        parent.normalize();
      }
    });

    // Apply highlights for each thread with an anchor
    // Process in reverse document order to avoid offset issues
    const anchored = threads
      .filter(t => t.anchor && !t.resolved)
      .map(t => {
        const range = resolveAnchor(t.anchor!, containerRef.current!);
        return { thread: t, range };
      })
      .filter(({ range }) => range !== null);

    for (const { thread, range } of anchored) {
      try {
        applyHighlight(range!, thread.id, thread.id === activeThreadId);
      } catch {
        // Highlight application can fail on complex DOM structures
      }
    }

    // Also show resolved threads with dimmed highlights
    const resolved = threads
      .filter(t => t.anchor && t.resolved)
      .map(t => {
        const range = resolveAnchor(t.anchor!, containerRef.current!);
        return { thread: t, range };
      })
      .filter(({ range }) => range !== null);

    for (const { thread, range } of resolved) {
      try {
        const mark = applyHighlight(range!, thread.id, false);
        if (mark) mark.classList.add('resolved');
      } catch {
        // ignore
      }
    }
  }, [threads, activeThreadId]);

  // Handle text selection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseUp = () => {
      const selection = window.getSelection();
      console.log('[DocViewer] mouseup, selection:', selection?.toString()?.slice(0, 50));
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        console.log('[DocViewer] no valid selection');
        return;
      }

      const range = selection.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        console.log('[DocViewer] selection outside container');
        return;
      }

      const anchor = serializeSelection(range, container);
      console.log('[DocViewer] anchor:', anchor);
      if (!anchor) return;

      const rect = range.getBoundingClientRect();
      onSelectText(anchor, rect);
    };

    container.addEventListener('mouseup', handleMouseUp);
    return () => container.removeEventListener('mouseup', handleMouseUp);
  }, [onSelectText]);

  // Handle highlight clicks
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleClick = (e: MouseEvent) => {
      const mark = (e.target as Element).closest?.('mark.comment-highlight');
      if (mark) {
        const threadId = mark.getAttribute('data-thread-id');
        if (threadId) onHighlightClick(threadId);
      }
    };

    container.addEventListener('click', handleClick);
    return () => container.removeEventListener('click', handleClick);
  }, [onHighlightClick]);

  return <div className="doc-content" ref={containerRef} />;
}

/**
 * Wrap a Range in a <mark> element for highlighting.
 * Handles ranges that span multiple elements by wrapping each text node segment.
 */
function applyHighlight(range: Range, threadId: string, active: boolean): HTMLElement | null {
  // For simple same-container ranges, use surroundContents
  if (range.startContainer === range.endContainer) {
    const mark = document.createElement('mark');
    mark.className = `comment-highlight${active ? ' active' : ''}`;
    mark.setAttribute('data-thread-id', threadId);
    range.surroundContents(mark);
    return mark;
  }

  // For cross-element ranges, wrap each text node individually
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    range.commonAncestorContainer,
    NodeFilter.SHOW_TEXT
  );

  let firstMark: HTMLElement | null = null;
  let inRange = false;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node === range.startContainer) inRange = true;
    if (inRange) textNodes.push(node);
    if (node === range.endContainer) break;
  }

  for (const textNode of textNodes) {
    const mark = document.createElement('mark');
    mark.className = `comment-highlight${active ? ' active' : ''}`;
    mark.setAttribute('data-thread-id', threadId);

    let targetNode = textNode;
    let startOffset = 0;
    let endOffset = textNode.textContent?.length ?? 0;

    if (textNode === range.startContainer) {
      startOffset = range.startOffset;
      if (startOffset > 0) {
        targetNode = textNode.splitText(startOffset);
        endOffset = endOffset - startOffset;
      }
    }
    if (textNode === range.endContainer || targetNode === range.endContainer) {
      const nodeEndOffset =
        textNode === range.startContainer
          ? range.endOffset - startOffset
          : range.endOffset;
      if (nodeEndOffset < (targetNode.textContent?.length ?? 0)) {
        targetNode.splitText(nodeEndOffset);
      }
    }

    const parent = targetNode.parentNode;
    if (parent) {
      parent.insertBefore(mark, targetNode);
      mark.appendChild(targetNode);
      if (!firstMark) firstMark = mark;
    }
  }

  return firstMark;
}
