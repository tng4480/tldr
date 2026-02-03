import {
  extractReadableText,
  getReadableRoot,
  offsetsToRange,
  rangeToOffsets,
  type TextNodeInfo,
} from "@tldr/core-dom";
import type { HighlightSpan } from "@tldr/core";
import { splitIntoSentences } from "@tldr/core";
import type {
  ApplyHighlightsRequest,
  ContentConnect,
  ContentReady,
  ExtractRequest,
  ExtractResult,
  HighlightClicked,
} from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { log, runtimeLastError, warn } from "../shared/logger";

const HIGHLIGHT_NAME_SENTENCES = "tldr-highlight-sentences";
const HIGHLIGHT_NAME_KEYWORDS = "tldr-highlight-keywords";
const MARK_ATTR = "data-tldr-highlight";
const POPUP_ID = "tldr-inline-popover";
const EMBOLDEN_ATTR = "data-tldr-embolden";
const EMBOLDEN_CLASS = "tldr-embolden";

type HighlightEntry = {
  sentence: string;
  range: Range;
  start: number;
  end: number;
};

let currentNodes: TextNodeInfo[] = [];
let highlightEntries: HighlightEntry[] = [];
let observer: MutationObserver | null = null;
let updateTimeout: number | null = null;
let styleInjected = false;

function signalContentReady() {
  // This must run only after `chrome.runtime.onMessage.addListener(...)` is registered,
  // otherwise background may send messages before the content script can receive them.
  const message: ContentReady = {
    type: "ContentReady",
    requestId: createRequestId("content-ready"),
  };
  log("cs", "ContentReady", { href: location.href });
  chrome.runtime.sendMessage(message, () => runtimeLastError("cs", "ContentReady sendMessage"));
}

function scheduleExtractionRefresh() {
  if (updateTimeout) {
    window.clearTimeout(updateTimeout);
  }
  updateTimeout = window.setTimeout(() => {
    refreshNodes();
  }, 750);
}

function refreshNodes() {
  const root = getReadableRoot(document);
  const { nodes } = extractReadableText(root);
  currentNodes = nodes;
  log("cs", "refreshNodes", { nodes: currentNodes.length, root: root.tagName });
}

function ensureHighlightStyles() {
  if (styleInjected) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME_SENTENCES}) {
      background-color: rgba(250, 204, 21, 0.55);
    }

    ::highlight(${HIGHLIGHT_NAME_KEYWORDS}) {
      background-color: transparent;
      text-shadow: 0.35px 0 0 currentColor, -0.35px 0 0 currentColor;
    }

    .${EMBOLDEN_CLASS}[${EMBOLDEN_ATTR}] {
      text-shadow: 0.35px 0 0 currentColor, -0.35px 0 0 currentColor;
    }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

function ensureObserver() {
  if (observer) {
    return;
  }
  observer = new MutationObserver(() => {
    scheduleExtractionRefresh();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  log("cs", "MutationObserver attached");
}

function clearHighlights() {
  highlightEntries = [];
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME_SENTENCES);
    CSS.highlights.delete(HIGHLIGHT_NAME_KEYWORDS);
  }
  document
    .querySelectorAll(`mark[${MARK_ATTR}], span[${EMBOLDEN_ATTR}]`)
    .forEach((node) => node.replaceWith(...node.childNodes));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSentenceRanges(text: string, nodes: TextNodeInfo[], sentences: string[]) {
  const ranges: Range[] = [];
  highlightEntries = [];

  let searchStart = 0;
  for (const sentence of sentences) {
    const normalizedSentence = sentence.trim();
    if (!normalizedSentence) {
      continue;
    }
    const index = text.indexOf(normalizedSentence, searchStart);
    if (index === -1) {
      continue;
    }
    const start = index;
    const end = index + normalizedSentence.length;
    const range = offsetsToRange(nodes, start, end);
    if (!range) {
      continue;
    }
    ranges.push(range);
    highlightEntries.push({ sentence: normalizedSentence, range, start, end });
    searchStart = end;
  }

  return ranges;
}

function buildKeywordRanges(text: string, nodes: TextNodeInfo[], terms: string[]) {
  const ranges: Range[] = [];
  highlightEntries = [];

  const uniqueTerms = Array.from(
    new Set(terms.map((term) => term.trim()).filter(Boolean).map((term) => term.toLowerCase())),
  );
  if (!uniqueTerms.length) {
    return ranges;
  }

  const regex = new RegExp(`\\b(${uniqueTerms.map(escapeRegExp).join("|")})\\b`, "gi");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const matched = match[0];
    const start = match.index;
    const end = match.index + matched.length;
    const range = offsetsToRange(nodes, start, end);
    if (!range) {
      continue;
    }
    ranges.push(range);
    highlightEntries.push({ sentence: matched, range, start, end });
  }

  return ranges;
}

function isHighlightSpan(value: HighlightSpan | string): value is HighlightSpan {
  return typeof value === "object" && value !== null && "start" in value && "end" in value;
}

function normalizeMatchText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function findClosestOccurrence(haystack: string, needle: string, expectedStart: number): number | null {
  if (!needle) {
    return null;
  }

  let bestIndex: number | null = null;
  let searchIndex = haystack.indexOf(needle);
  while (searchIndex !== -1) {
    if (bestIndex === null || Math.abs(searchIndex - expectedStart) < Math.abs(bestIndex - expectedStart)) {
      bestIndex = searchIndex;
    }
    searchIndex = haystack.indexOf(needle, searchIndex + 1);
  }
  return bestIndex;
}

function resolveSpanOffsets(text: string, span: HighlightSpan): { start: number; end: number } | null {
  const expectedStart = Math.max(0, Math.min(text.length, span.start));
  const expectedEnd = Math.max(0, Math.min(text.length, span.end));
  if (expectedEnd <= expectedStart) {
    return null;
  }

  const expectedSlice = normalizeMatchText(text.slice(expectedStart, expectedEnd));
  const spanTextNormalized = normalizeMatchText(span.text);
  if (expectedSlice && spanTextNormalized && expectedSlice === spanTextNormalized) {
    return { start: expectedStart, end: expectedEnd };
  }

  const windowPad = 256;
  const localStart = Math.max(0, expectedStart - windowPad);
  const localEnd = Math.min(text.length, expectedStart + windowPad + span.text.length);
  const localText = text.slice(localStart, localEnd);

  const localIndex = findClosestOccurrence(localText, span.text, expectedStart - localStart);
  if (localIndex !== null) {
    return { start: localStart + localIndex, end: localStart + localIndex + span.text.length };
  }

  const localIndexInsensitive = findClosestOccurrence(localText.toLowerCase(), span.text.toLowerCase(), expectedStart - localStart);
  if (localIndexInsensitive !== null) {
    return { start: localStart + localIndexInsensitive, end: localStart + localIndexInsensitive + span.text.length };
  }

  const globalIndex = findClosestOccurrence(text, span.text, expectedStart);
  if (globalIndex !== null) {
    return { start: globalIndex, end: globalIndex + span.text.length };
  }

  const globalIndexInsensitive = findClosestOccurrence(text.toLowerCase(), span.text.toLowerCase(), expectedStart);
  if (globalIndexInsensitive !== null) {
    return { start: globalIndexInsensitive, end: globalIndexInsensitive + span.text.length };
  }

  return null;
}

function buildSpanRanges(text: string, nodes: TextNodeInfo[], spans: HighlightSpan[]) {
  const ranges: Range[] = [];
  highlightEntries = [];

  spans.forEach((span) => {
    const resolved = resolveSpanOffsets(text, span);
    if (!resolved) {
      return;
    }
    const start = resolved.start;
    const end = resolved.end;
    const range = offsetsToRange(nodes, start, end);
    if (!range) {
      return;
    }
    ranges.push(range);
    highlightEntries.push({ sentence: text.slice(start, end), range, start, end });
  });

  return ranges;
}

function isInsideEditable(node: Node) {
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest("input, textarea, [contenteditable='true']"));
}

function emboldenHighlightEntries(): number {
  const ordered = [...highlightEntries].sort((a, b) => b.start - a.start);
  const kept: HighlightEntry[] = [];

  for (const entry of ordered) {
    if (isInsideEditable(entry.range.commonAncestorContainer)) {
      continue;
    }
    const wrapper = document.createElement("span");
    wrapper.className = EMBOLDEN_CLASS;
    wrapper.setAttribute(EMBOLDEN_ATTR, "true");

    try {
      const contents = entry.range.extractContents();
      if (!contents.textContent?.trim()) {
        continue;
      }
      wrapper.appendChild(contents);
      entry.range.insertNode(wrapper);
      const newRange = document.createRange();
      newRange.selectNodeContents(wrapper);
      kept.push({ ...entry, range: newRange });
    } catch {
      // ignore ranges that cannot be wrapped
    }
  }

  kept.sort((a, b) => a.start - b.start);
  highlightEntries = kept;
  return highlightEntries.length;
}

function applyHighlights(highlights: Array<HighlightSpan | string>, highlightType: ApplyHighlightsRequest["highlightType"]): number {
  clearHighlights();
  if (!highlights.length) {
    return 0;
  }
  ensureHighlightStyles();

  const root = getReadableRoot(document);
  const { text, nodes } = extractReadableText(root);
  currentNodes = nodes;

  const requested = highlights.filter(Boolean);
  log("cs", "applyHighlights start", {
    requested: requested.length,
    type: highlightType,
    textLen: text.length,
    nodes: nodes.length,
  });

  let ranges: Range[] = [];
  if (highlightType === "keywords") {
    const spanHighlights = requested.filter(isHighlightSpan) as HighlightSpan[];
    if (spanHighlights.length) {
      ranges = buildSpanRanges(text, nodes, spanHighlights);
    } else {
      const termHighlights = requested.filter((item): item is string => typeof item === "string");
      ranges = buildKeywordRanges(text, nodes, termHighlights);
    }
  } else {
    const sentenceHighlights = requested.filter((item): item is string => typeof item === "string");
    ranges = buildSentenceRanges(text, nodes, sentenceHighlights);
  }

  if (highlightType === "keywords") {
    if ("highlights" in CSS) {
      log("cs", "applyHighlights using CSS Custom Highlight API (keywords)", { ranges: ranges.length });
      const highlight = new Highlight(...ranges);
      CSS.highlights.set(HIGHLIGHT_NAME_KEYWORDS, highlight);
    } else {
      warn("cs", "applyHighlights using embolden mode fallback (DOM mutation)");
      emboldenHighlightEntries();
    }
  } else {
    if ("highlights" in CSS) {
      log("cs", "applyHighlights using CSS Custom Highlight API", { ranges: ranges.length });
      const highlight = new Highlight(...ranges);
      CSS.highlights.set(HIGHLIGHT_NAME_SENTENCES, highlight);
    } else {
      warn("cs", "applyHighlights using mark fallback (DOM mutation)");
      ranges.forEach((range) => {
        const mark = document.createElement("mark");
        mark.setAttribute(MARK_ATTR, "true");
        try {
          range.surroundContents(mark);
        } catch {
          // ignore ranges that cannot be wrapped
        }
      });
    }
  }

  log("cs", "applyHighlights done", { applied: highlightEntries.length });
  return highlightEntries.length;
}

function isClickInsideHighlight(event: MouseEvent): HighlightEntry | null {
  if (!highlightEntries.length) {
    return null;
  }
  const target = event.target as Element | null;
  if (target && (target.closest("input") || target.closest("textarea") || target.closest("[contenteditable='true']"))) {
    return null;
  }

  const caretRange = document.caretRangeFromPoint
    ? document.caretRangeFromPoint(event.clientX, event.clientY)
    : (() => {
        const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        if (!position) {
          return null;
        }
        const range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.setEnd(position.offsetNode, position.offset);
        return range;
      })();

  if (!caretRange) {
    return null;
  }

  for (const entry of highlightEntries) {
    if (entry.range.isPointInRange(caretRange.startContainer, caretRange.startOffset)) {
      return entry;
    }
  }
  return null;
}

function showPopover(entry: HighlightEntry, event: MouseEvent) {
  let host = document.getElementById(POPUP_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = POPUP_ID;
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.style.top = "0";
    host.style.left = "0";
    host.style.pointerEvents = "none";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.id = "tldr-inline-container";
    container.style.background = "#111827";
    container.style.color = "#fff";
    container.style.padding = "8px 12px";
    container.style.borderRadius = "8px";
    container.style.boxShadow = "0 12px 30px rgba(0,0,0,0.2)";
    container.style.fontSize = "12px";
    container.style.maxWidth = "280px";
    container.style.pointerEvents = "auto";
    const title = document.createElement("div");
    title.textContent = "TLDR";
    title.style.fontWeight = "600";
    title.style.marginBottom = "4px";
    const sentence = document.createElement("div");
    sentence.textContent = entry.sentence;
    sentence.style.opacity = "0.8";
    const hint = document.createElement("div");
    hint.textContent = "Open side panel for actions";
    hint.style.marginTop = "6px";
    hint.style.fontSize = "11px";
    hint.style.opacity = "0.6";
    container.append(title, sentence, hint);
    shadow.appendChild(container);
  }
  const rect = { x: event.clientX, y: event.clientY };
  host.style.transform = `translate(${rect.x + 12}px, ${rect.y + 12}px)`;
}

function handleClick(event: MouseEvent) {
  const entry = isClickInsideHighlight(event);
  if (!entry) {
    return;
  }
  showPopover(entry, event);
  const contextRange = entry.range.cloneRange();
  const offsets = rangeToOffsets(currentNodes, contextRange);
  const contextText = offsets ? contextRange.toString() : entry.sentence;
  const message: HighlightClicked = {
    type: "HighlightClicked",
    requestId: createRequestId("highlight"),
    sentence: entry.sentence,
    context: contextText,
  };
  log("cs", "HighlightClicked", { sentenceLen: entry.sentence.length, contextLen: contextText.length });
  chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
  runtimeLastError("cs", "HighlightClicked sendMessage");
}

function handleMessage(message: ExtractRequest | ApplyHighlightsRequest) {
  if (message.type === "ExtractRequest") {
    const root = getReadableRoot(document);
    const { text } = extractReadableText(root);
    const sentences = splitIntoSentences(text);
    const firstSentence = sentences.find((s) => s.trim().length > 0) ?? "";
    log("cs", "ExtractRequest", {
      requestId: message.requestId,
      root: root.tagName,
      textLen: text.length,
      sentences: sentences.length,
      firstSentence,
    });
    const response: ExtractResult = {
      type: "ExtractResult",
      requestId: message.requestId,
      tabId: message.tabId,
      text,
      sentences,
    };
    chrome.runtime.sendMessage(response, () => void chrome.runtime.lastError);
    runtimeLastError("cs", "ExtractResult sendMessage");
  }

  if (message.type === "ApplyHighlightsRequest") {
    log("cs", "ApplyHighlightsRequest", {
      requestId: message.requestId,
      highlights: message.highlights?.length ?? 0,
      type: message.highlightType,
    });
    const count = applyHighlights(message.highlights, message.highlightType);
    chrome.runtime.sendMessage(
      {
        type: "ApplyHighlightsAck",
        requestId: message.requestId,
        tabId: message.tabId,
        count,
      },
      () => void chrome.runtime.lastError,
    );
    runtimeLastError("cs", "ApplyHighlightsAck sendMessage");
  }
}

chrome.runtime.onMessage.addListener((message: ExtractRequest | ApplyHighlightsRequest) => {
  log("cs", "onMessage", { type: message?.type, requestId: (message as any)?.requestId });
  handleMessage(message);
});

document.addEventListener("click", handleClick, { capture: true });

// These may be a bit heavier; do them after the message listener is registered so we can receive requests immediately.
refreshNodes();
ensureObserver();

signalContentReady();
refreshNodes();
ensureObserver();

chrome.runtime.onMessage.addListener((message: ExtractRequest | ApplyHighlightsRequest) => {
  handleMessage(message);
});

document.addEventListener("click", handleClick, { capture: true });
