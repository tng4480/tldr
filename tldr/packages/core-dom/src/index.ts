export type TextNodeInfo = {
  node: Text;
  start: number;
  end: number;
  nodeOffset: number;
};

const DEFAULT_BLOCK_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  ".article",
  ".post",
  ".content",
];

const SKIP_SELECTORS = [
  "script",
  "style",
  "noscript",
  "textarea",
  "input",
  "select",
  "option",
  "button",
  "code",
  "pre",
  "[contenteditable='true']",
];

export function isEditableElement(element: Element | null): boolean {
  if (!element) {
    return false;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return true;
  }
  return element instanceof HTMLElement ? element.isContentEditable : false;
}

export function getReadableRoot(doc: Document): Element {
  for (const selector of DEFAULT_BLOCK_SELECTORS) {
    const candidate = doc.querySelector(selector);
    if (candidate && candidate.textContent && candidate.textContent.trim().length > 200) {
      return candidate;
    }
  }
  return doc.body;
}

export function collectTextNodes(root: Element): TextNodeInfo[] {
  return buildReadableTextAndNodes(root).nodes;
}

function buildReadableTextAndNodes(root: Element): { text: string; nodes: TextNodeInfo[] } {
  const nodes: TextNodeInfo[] = [];
  const parts: string[] = [];
  const rootDocument = root.ownerDocument ?? document;
  const walker = rootDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = node.parentElement;
        if (!parent) {
          return NodeFilter.FILTER_REJECT;
        }
        if (SKIP_SELECTORS.some((selector) => parent.closest(selector))) {
          return NodeFilter.FILTER_REJECT;
        }
        if (isEditableElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let current = walker.nextNode();
  let offset = 0;
  let lastWasSpace = false;
  let emittedNonSpace = false;
  let needsBoundarySpace = false;

  function emitSpace() {
    if (!emittedNonSpace || lastWasSpace) {
      return;
    }
    parts.push(" ");
    offset += 1;
    lastWasSpace = true;
  }

  function emitChar(textNode: Text, nodeOffset: number, value: string) {
    const last = nodes[nodes.length - 1];
    if (
      last &&
      last.node === textNode &&
      last.end === offset &&
      last.nodeOffset + (last.end - last.start) === nodeOffset
    ) {
      last.end += 1;
    } else {
      nodes.push({ node: textNode, start: offset, end: offset + 1, nodeOffset });
    }
    parts.push(value);
    offset += 1;
    lastWasSpace = false;
    emittedNonSpace = true;
  }

  while (current) {
    const textNode = current as Text;
    const value = textNode.nodeValue ?? "";
    if (value.length > 0) {
      if (nodes.length > 0) {
        needsBoundarySpace = true;
      }

      for (let index = 0; index < value.length; index += 1) {
        const char = value[index] ?? "";
        if (/\s/.test(char)) {
          needsBoundarySpace = true;
          continue;
        }

        if (needsBoundarySpace) {
          emitSpace();
          needsBoundarySpace = false;
        }
        emitChar(textNode, index, char);
      }

      // Ensure a single space boundary between adjacent text nodes, matching the previous `join(" ")` behavior.
      needsBoundarySpace = true;
    }
    current = walker.nextNode();
  }

  // Trim trailing space to match `trim()` from the previous implementation.
  if (lastWasSpace && parts.length > 0 && parts[parts.length - 1] === " ") {
    parts.pop();
  }

  return { text: parts.join(""), nodes };
}

export function extractReadableText(root: Element): { text: string; nodes: TextNodeInfo[] } {
  return buildReadableTextAndNodes(root);
}

export function offsetsToRange(nodes: TextNodeInfo[], start: number, end: number): Range | null {
  if (!nodes.length) {
    return null;
  }
  const range = nodes[0]?.node.ownerDocument?.createRange() ?? document.createRange();

  let startNode: TextNodeInfo | undefined;
  let endNode: TextNodeInfo | undefined;

  for (const nodeInfo of nodes) {
    if (!startNode && start >= nodeInfo.start && start < nodeInfo.end) {
      startNode = nodeInfo;
    }
    if (end > nodeInfo.start && end <= nodeInfo.end) {
      endNode = nodeInfo;
      break;
    }
  }

  // If we land in a whitespace gap (which is collapsed and not mapped), snap inward to the nearest mapped offsets.
  if (!startNode) {
    startNode = nodes.find((nodeInfo) => nodeInfo.start > start);
    start = startNode?.start ?? start;
  }
  if (!endNode) {
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const nodeInfo = nodes[index];
      if (end >= nodeInfo.end) {
        endNode = nodeInfo;
        end = nodeInfo.end;
        break;
      }
    }
  }

  if (!startNode || !endNode) {
    return null;
  }

  const startOffset = Math.max(0, startNode.nodeOffset + (start - startNode.start));
  const endOffset = Math.max(0, endNode.nodeOffset + (end - endNode.start));
  range.setStart(startNode.node, Math.min(startOffset, startNode.node.nodeValue?.length ?? startOffset));
  range.setEnd(endNode.node, Math.min(endOffset, endNode.node.nodeValue?.length ?? endOffset));
  return range;
}

export function rangeToOffsets(nodes: TextNodeInfo[], range: Range): { start: number; end: number } | null {
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  if (!(startContainer instanceof Text) || !(endContainer instanceof Text)) {
    return null;
  }
  const startInfo = nodes.find(
    (node) =>
      node.node === startContainer &&
      range.startOffset >= node.nodeOffset &&
      range.startOffset <= node.nodeOffset + (node.end - node.start),
  );
  const endInfo = nodes.find(
    (node) =>
      node.node === endContainer &&
      range.endOffset >= node.nodeOffset &&
      range.endOffset <= node.nodeOffset + (node.end - node.start),
  );
  if (!startInfo || !endInfo) {
    return null;
  }
  return {
    start: startInfo.start + (range.startOffset - startInfo.nodeOffset),
    end: endInfo.start + (range.endOffset - endInfo.nodeOffset),
  };
}
