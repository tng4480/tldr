export type TextNodeInfo = {
  node: Text;
  start: number;
  end: number;
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
  const nodes: TextNodeInfo[] = [];
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
  while (current) {
    const textNode = current as Text;
    const length = textNode.nodeValue?.length ?? 0;
    if (length > 0) {
      nodes.push({ node: textNode, start: offset, end: offset + length });
      offset += length;
    }
    current = walker.nextNode();
  }

  return nodes;
}

export function extractReadableText(root: Element): { text: string; nodes: TextNodeInfo[] } {
  const nodes = collectTextNodes(root);
  const text = nodes.map((item) => item.node.nodeValue ?? "").join(" ");
  return { text: text.replace(/\s+/g, " ").trim(), nodes };
}

export function offsetsToRange(nodes: TextNodeInfo[], start: number, end: number): Range | null {
  if (!nodes.length) {
    return null;
  }
  const range = nodes[0]?.node.ownerDocument?.createRange() ?? document.createRange();
  let startNode: TextNodeInfo | undefined;
  let endNode: TextNodeInfo | undefined;

  for (const nodeInfo of nodes) {
    if (!startNode && start >= nodeInfo.start && start <= nodeInfo.end) {
      startNode = nodeInfo;
    }
    if (end >= nodeInfo.start && end <= nodeInfo.end) {
      endNode = nodeInfo;
      break;
    }
  }

  if (!startNode || !endNode) {
    return null;
  }

  range.setStart(startNode.node, Math.max(0, start - startNode.start));
  range.setEnd(endNode.node, Math.max(0, end - endNode.start));
  return range;
}

export function rangeToOffsets(nodes: TextNodeInfo[], range: Range): { start: number; end: number } | null {
  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  if (!(startContainer instanceof Text) || !(endContainer instanceof Text)) {
    return null;
  }
  const startInfo = nodes.find((node) => node.node === startContainer);
  const endInfo = nodes.find((node) => node.node === endContainer);
  if (!startInfo || !endInfo) {
    return null;
  }
  return {
    start: startInfo.start + range.startOffset,
    end: endInfo.start + range.endOffset,
  };
}
