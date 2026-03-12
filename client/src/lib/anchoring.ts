import type { TextAnchor } from 'shared';

/**
 * Build a CSS selector path from an element up to (but not including) the scope element.
 */
function buildSelector(el: Element, scope: Element): string {
  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== scope) {
    const cur: Element = current;
    const parent: Element | null = cur.parentElement;
    if (!parent) break;

    const tag = cur.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter(
      (c: Element) => c.tagName === cur.tagName
    );

    if (siblings.length > 1) {
      const index = siblings.indexOf(cur) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    } else {
      parts.unshift(tag);
    }

    current = parent;
  }

  return parts.join(' > ');
}

/**
 * Find the text node and offset within an element's text content.
 * Given a character offset into element.textContent, returns the
 * specific text node and offset within that node.
 */
function findTextNodeAtOffset(
  el: Element,
  targetOffset: number
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let charCount = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const len = textNode.textContent?.length ?? 0;

    if (charCount + len > targetOffset) {
      return { node: textNode, offset: targetOffset - charCount };
    }
    charCount += len;
  }

  // If targetOffset equals total length, return end of last text node
  if (charCount === targetOffset) {
    const lastNode = walker.currentNode as Text;
    if (lastNode?.nodeType === Node.TEXT_NODE) {
      return { node: lastNode, offset: lastNode.textContent?.length ?? 0 };
    }
  }

  return null;
}

/**
 * Calculate the character offset of a position within an element's textContent.
 */
function getTextOffset(container: Node, offset: number, scopeEl: Element): number {
  // If the container is the scope element itself or an element node,
  // we need to count characters up to the child at `offset`
  let targetNode: Node;
  let targetOffset: number;

  if (container.nodeType === Node.ELEMENT_NODE) {
    // offset refers to child node index
    const children = container.childNodes;
    if (offset < children.length) {
      targetNode = children[offset];
      targetOffset = 0;
    } else {
      // Past the end — use the last child's end
      const lastChild = children[children.length - 1];
      if (!lastChild) return 0;
      targetNode = lastChild;
      targetOffset = lastChild.textContent?.length ?? 0;
    }
  } else {
    targetNode = container;
    targetOffset = offset;
  }

  // Walk all text nodes in scopeEl, summing lengths until we reach targetNode
  const walker = document.createTreeWalker(scopeEl, NodeFilter.SHOW_TEXT);
  let charCount = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (textNode === targetNode) {
      return charCount + targetOffset;
    }
    charCount += textNode.textContent?.length ?? 0;
  }

  return charCount;
}

/**
 * Find the nearest element ancestor of a node.
 */
function nearestElement(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}

/**
 * Serialize a browser Selection Range into a TextAnchor.
 */
export function serializeSelection(range: Range, scope: Element): TextAnchor | null {
  // Find the common ancestor element that contains the selection
  const commonAncestor = range.commonAncestorContainer;
  const anchorEl = nearestElement(commonAncestor);
  if (!anchorEl || !scope.contains(anchorEl)) return null;

  // Use the common ancestor element for the selector
  const targetEl = anchorEl === scope ? scope : anchorEl;
  const cssSelector = targetEl === scope ? '' : buildSelector(targetEl, scope);

  const startOffset = getTextOffset(range.startContainer, range.startOffset, targetEl);
  const endOffset = getTextOffset(range.endContainer, range.endOffset, targetEl);
  const quote = range.toString();

  if (!quote.trim()) return null;

  return {
    css_selector: cssSelector,
    start_offset: startOffset,
    end_offset: endOffset,
    quote,
  };
}

/**
 * Resolve a TextAnchor back into a browser Range.
 */
export function resolveAnchor(anchor: TextAnchor, scope: Element): Range | null {
  // Find the target element
  let targetEl: Element;
  if (!anchor.css_selector) {
    targetEl = scope;
  } else {
    const found = scope.querySelector(anchor.css_selector);
    if (!found) {
      // Fallback: search for the quote text in the entire scope
      return findByQuote(anchor.quote, scope);
    }
    targetEl = found;
  }

  const start = findTextNodeAtOffset(targetEl, anchor.start_offset);
  const end = findTextNodeAtOffset(targetEl, anchor.end_offset);

  if (start && end) {
    // Verify the text matches
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    const text = range.toString();
    if (text === anchor.quote) {
      return range;
    }
  }

  // Fallback: search for the quote
  return findByQuote(anchor.quote, scope);
}

/**
 * Fallback: find text by searching for the quote string in the document.
 */
function findByQuote(quote: string, scope: Element): Range | null {
  if (!quote) return null;

  const text = scope.textContent ?? '';
  const index = text.indexOf(quote);
  if (index === -1) return null;

  const start = findTextNodeAtOffset(scope, index);
  const end = findTextNodeAtOffset(scope, index + quote.length);

  if (!start || !end) return null;

  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}
