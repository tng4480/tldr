import {
  extractReadableText,
  getReadableRoot,
  offsetsToRange,
  rangeToOffsets,
  type TextNodeInfo,
} from "@tldr/core-dom";
import { splitIntoSentences } from "@tldr/core";
import type {
  ApplyHighlightsRequest,
  ContentConnect,
  ExtractRequest,
  ExtractResult,
  HighlightClicked,
} from "../shared/messages";
import { createRequestId } from "../shared/messages";

const HIGHLIGHT_NAME = "tldr-highlight";
const POPUP_ID = "tldr-inline-popover";

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

function initConnection() {
  const message: ContentConnect = {
    type: "ContentConnect",
    requestId: createRequestId("content-connect"),
    tabId: -1,
  };
  chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
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
}

function ensureHighlightStyles() {
  if (styleInjected) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME}) {
      background-color: rgba(250, 204, 21, 0.55);
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
}

function clearHighlights() {
  highlightEntries = [];
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  } else {
    document.querySelectorAll(`mark[data-${HIGHLIGHT_NAME}]`).forEach((node) => node.replaceWith(...node.childNodes));
  }
}

function applyHighlights(sentences: string[]): number {
  clearHighlights();
  if (!sentences.length) {
    return 0;
  }
  ensureHighlightStyles();

  const root = getReadableRoot(document);
  const { text, nodes } = extractReadableText(root);
  currentNodes = nodes;

  const sentenceList = sentences.filter(Boolean);
  const ranges: Range[] = [];
  highlightEntries = [];

  let searchStart = 0;
  for (const sentence of sentenceList) {
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

  if ("highlights" in CSS) {
    const highlight = new Highlight(...ranges);
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
  } else {
    ranges.forEach((range) => {
      const mark = document.createElement("mark");
      mark.dataset[HIGHLIGHT_NAME] = "true";
      try {
        range.surroundContents(mark);
      } catch {
        // ignore ranges that cannot be wrapped
      }
    });
  }

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
    tabId: -1,
    sentence: entry.sentence,
    context: contextText,
  };
  chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
}

function handleMessage(message: ExtractRequest | ApplyHighlightsRequest) {
  if (message.type === "ExtractRequest") {
    const root = getReadableRoot(document);
    const { text } = extractReadableText(root);
    const sentences = splitIntoSentences(text);
    const response: ExtractResult = {
      type: "ExtractResult",
      requestId: message.requestId,
      tabId: message.tabId,
      text,
      sentences,
    };
    chrome.runtime.sendMessage(response, () => void chrome.runtime.lastError);
  }

  if (message.type === "ApplyHighlightsRequest") {
    const count = applyHighlights(message.sentences);
    chrome.runtime.sendMessage(
      {
        type: "ApplyHighlightsAck",
        requestId: message.requestId,
        tabId: message.tabId,
        count,
      },
      () => void chrome.runtime.lastError,
    );
  }
}

initConnection();
refreshNodes();
ensureObserver();

chrome.runtime.onMessage.addListener((message: ExtractRequest | ApplyHighlightsRequest) => {
  handleMessage(message);
});

document.addEventListener("click", handleClick, { capture: true });
