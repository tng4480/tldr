import {
  extractReadableText,
  getReadableRoot,
  offsetsToRange,
  rangeToOffsets,
  type TextNodeInfo,
} from "@tldr/core-dom";
import type { HighlightSpan } from "@tldr/core";
import { computeSpacyStyleHighlights, splitIntoSentences, wordCount } from "@tldr/core";
import { clampHighlightContrast, DEFAULT_HIGHLIGHT_CONTRAST, HIGHLIGHT_CONTRAST_KEY } from "../shared/settings";
import type {
  ApplyHighlightsRequest,
  ApplyRsvpCursorRequest,
  ClearRsvpCursorRequest,
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
const HIGHLIGHT_NAME_RSVP_CURSOR = "tldr-highlight-rsvp-cursor";
const MARK_ATTR = "data-tldr-highlight";
const POPUP_ID = "tldr-inline-popover";
const BUBBLE_HOST_ID = "tldr-floating-bubble";
const EMBOLDEN_ATTR = "data-tldr-embolden";
const EMBOLDEN_CLASS = "tldr-embolden";
const RSVP_CURSOR_ATTR = "data-tldr-rsvp-cursor";
const RSVP_CURSOR_CLASS = "tldr-rsvp-cursor";
const DEEMPHASIZE_CLASS = "tldr-deemphasize";
const DEEMPHASIZE_COLOR_VAR = "--tldr-deemphasis-color";
const BASE_COLOR_VAR = "--tldr-base-color";
const SIGNIFICANT_WORD_COUNT = 200;

type HighlightEntry = {
  sentence: string;
  range: Range;
  start: number;
  end: number;
};

let currentNodes: TextNodeInfo[] = [];
let currentReadableText = "";
let currentReadableWordCount = 0;
let highlightEntries: HighlightEntry[] = [];
let observer: MutationObserver | null = null;
let updateTimeout: number | null = null;
let styleInjected = false;
let deemphasizedRoot: Element | null = null;
let bubbleInjected = false;
let bubbleExpanded = false;
let highlightContrast = DEFAULT_HIGHLIGHT_CONTRAST;
let storageInitialized = false;
let rsvpCursorRange: Range | null = null;

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
  const { text, nodes } = extractReadableText(root);
  currentNodes = nodes;
  currentReadableText = text;
  currentReadableWordCount = wordCount(text);
  log("cs", "refreshNodes", { nodes: currentNodes.length, root: root.tagName, words: currentReadableWordCount });
  updateBubbleVisibility();
}

function ensureHighlightStyles() {
  if (styleInjected) {
    return;
  }
  const style = document.createElement("style");
  style.textContent = `
    ::highlight(${HIGHLIGHT_NAME_SENTENCES}) {
      background-color: rgba(249, 116, 75, 0.28);
    }

    ::highlight(${HIGHLIGHT_NAME_KEYWORDS}) {
      background-color: transparent;
      color: var(${BASE_COLOR_VAR});
      text-shadow: 0.35px 0 0 currentColor, -0.35px 0 0 currentColor;
    }

    ::highlight(${HIGHLIGHT_NAME_RSVP_CURSOR}) {
      background-color: rgba(249, 116, 75, 0.22);
      text-decoration: underline;
      text-decoration-thickness: 2px;
      text-decoration-color: rgba(249, 116, 75, 0.85);
      text-underline-offset: 2px;
    }

    .${EMBOLDEN_CLASS}[${EMBOLDEN_ATTR}] {
      color: var(${BASE_COLOR_VAR});
      text-shadow: 0.35px 0 0 currentColor, -0.35px 0 0 currentColor;
    }

    .${RSVP_CURSOR_CLASS}[${RSVP_CURSOR_ATTR}] {
      position: relative;
      background-color: rgba(249, 116, 75, 0.22);
      border-radius: 3px;
    }

    .${DEEMPHASIZE_CLASS},
    .${DEEMPHASIZE_CLASS} * {
    color: var(${DEEMPHASIZE_COLOR_VAR});
    }
  `;
  document.head.appendChild(style);
  styleInjected = true;
}

function clearRsvpCursor() {
  rsvpCursorRange = null;
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME_RSVP_CURSOR);
  }
  document.querySelectorAll(`span[${RSVP_CURSOR_ATTR}]`).forEach((node) => node.replaceWith(...node.childNodes));
}

function applyRsvpCursor(start: number, end: number, scrollIntoView: boolean, expectedWord?: string) {
  clearRsvpCursor();
  ensureHighlightStyles();

  if (!currentReadableText || !currentNodes.length || end > currentReadableText.length) {
    refreshNodes();
  }

  if (expectedWord && currentReadableText.slice(start, end) !== expectedWord) {
    refreshNodes();
  }

  const range = offsetsToRange(currentNodes, start, end);
  if (!range) {
    return;
  }

  if (isInsideEditable(range.commonAncestorContainer)) {
    return;
  }

  if (scrollIntoView) {
    const rect = range.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      const target = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      target?.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }

  if ("highlights" in CSS) {
    CSS.highlights.set(HIGHLIGHT_NAME_RSVP_CURSOR, new Highlight(range));
  } else {
    const wrapper = document.createElement("span");
    wrapper.className = RSVP_CURSOR_CLASS;
    wrapper.setAttribute(RSVP_CURSOR_ATTR, "true");
    try {
      range.surroundContents(wrapper);
    } catch {
      // ignore ranges that cannot be wrapped
    }
  }

  rsvpCursorRange = range;
}

function ensureFloatingBubble() {
  if (bubbleInjected) {
    return;
  }

  if (!document.body) {
    return;
  }

  const host = document.createElement("div");
  host.id = BUBBLE_HOST_ID;
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  host.style.right = "18px";
  host.style.bottom = "18px";
  host.style.display = "none";
  host.style.pointerEvents = "auto";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    :host {
      --assist-ext-bg: #ededed;
      --assist-ext-border: #d6c4b0;
      --assist-ext-text: #102937;
      --assist-ext-muted: #124d54;
      --assist-ext-accent: #f9744b;
    }
    @media (prefers-color-scheme: dark) {
      :host {
        --assist-ext-bg: #091d26;
        --assist-ext-border: #124d54;
        --assist-ext-text: #ededed;
        --assist-ext-muted: #d6c4b0;
      }
    }
    .assist-ext-wrap {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--assist-ext-text);
    }
    .assist-ext-bubble {
      width: 36px;
      height: 36px;
      border-radius: 12px;
      border: 1px solid var(--assist-ext-border);
      background: var(--assist-ext-bg);
      color: var(--assist-ext-text);
      cursor: pointer;
      display: grid;
      place-items: center;
      user-select: none;
      font-weight: 600;
      font-size: 12px;
      box-shadow: 0 12px 26px rgba(0, 0, 0, 0.16);
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
    }
    .assist-ext-bubble img {
      width: 22px;
      height: 22px;
      object-fit: contain;
      display: block;
      pointer-events: none;
    }
    .assist-ext-bubble:hover {
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--assist-ext-accent) 26%, transparent),
        0 16px 34px rgba(0, 0, 0, 0.18);
    }
    .assist-ext-bubble:active {
      transform: translateY(1px);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 10px 22px rgba(0, 0, 0, 0.16);
    }
    .assist-ext-panel {
      position: absolute;
      right: 0;
      bottom: 44px;
      width: 280px;
      border-radius: 16px;
      border: 1px solid var(--assist-ext-border);
      background: var(--assist-ext-bg);
      color: var(--assist-ext-text);
      padding: 12px;
      display: none;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
    }
    .assist-ext-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .assist-ext-title { font-weight: 600; font-size: 13px; }
    .assist-ext-meta { color: var(--assist-ext-muted); font-size: 12px; }
    .assist-ext-btn-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .assist-ext-button {
      border-radius: 12px;
      border: 1px solid var(--assist-ext-border);
      background: transparent;
      color: var(--assist-ext-text);
      padding: 6px 8px;
      font-size: 12px;
      cursor: pointer;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.10);
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
    }
    .assist-ext-button:hover {
      box-shadow:
        0 0 0 3px color-mix(in srgb, var(--assist-ext-accent) 26%, transparent),
        0 12px 26px rgba(0, 0, 0, 0.14);
    }
    .assist-ext-button:active {
      transform: translateY(1px);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 6px 14px rgba(0, 0, 0, 0.12);
    }
    .assist-ext-button--primary { border-color: var(--assist-ext-accent); color: var(--assist-ext-accent); font-weight: 600; }
  `;

  const wrap = document.createElement("div");
  wrap.className = "assist-ext-wrap";

  const panel = document.createElement("div");
  panel.className = "assist-ext-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "TLDR reading assistant");

  const header = document.createElement("div");
  header.className = "assist-ext-row";

  const title = document.createElement("div");
  title.className = "assist-ext-title";
  title.textContent = "TLDR";

  const close = document.createElement("button");
  close.className = "assist-ext-button";
  close.textContent = "Close";
  close.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setBubbleExpanded(false);
  });

  header.append(title, close);

  const meta = document.createElement("div");
  meta.className = "assist-ext-meta";
  meta.id = "tldr-bubble-meta";
  meta.textContent = "Detecting page text…";

  const btnRow = document.createElement("div");
  btnRow.className = "assist-ext-btn-row";

  const highlight = document.createElement("button");
  highlight.className = "assist-ext-button assist-ext-button--primary";
  highlight.textContent = "Highlight key phrases";
  highlight.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (!currentReadableText.trim()) {
        refreshNodes();
      }
      const spans = computeSpacyStyleHighlights(currentReadableText);
      applyHighlights(spans, "keywords");
    } catch (error) {
      warn("cs", "Bubble highlight failed", error);
    }
  });

  const clear = document.createElement("button");
  clear.className = "assist-ext-button";
  clear.textContent = "Clear highlights";
  clear.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearHighlights();
  });

  btnRow.append(highlight, clear);

  panel.append(header, meta, btnRow);

  const bubble = document.createElement("button");
  bubble.className = "assist-ext-bubble";
  bubble.setAttribute("aria-label", "Open TLDR");
  const bubbleIcon = document.createElement("img");
  bubbleIcon.alt = "";
  bubbleIcon.src = chrome.runtime.getURL("tldr.png");
  bubble.appendChild(bubbleIcon);
  bubble.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setBubbleExpanded(!bubbleExpanded);
  });

  wrap.append(panel, bubble);
  shadow.append(style, wrap);

  bubbleInjected = true;
}

function setBubbleExpanded(next: boolean) {
  bubbleExpanded = next;
  const host = document.getElementById(BUBBLE_HOST_ID);
  const panel = host?.shadowRoot?.querySelector(".assist-ext-panel") as HTMLElement | null;
  if (panel) {
    panel.style.display = bubbleExpanded ? "block" : "none";
  }
}

function updateBubbleVisibility() {
  ensureFloatingBubble();
  const host = document.getElementById(BUBBLE_HOST_ID);
  if (!host) {
    return;
  }

  const isSignificant = currentReadableWordCount >= SIGNIFICANT_WORD_COUNT;
  host.style.display = isSignificant ? "block" : "none";
  if (!isSignificant) {
    setBubbleExpanded(false);
  }

  const meta = host.shadowRoot?.getElementById("tldr-bubble-meta");
  if (meta) {
    meta.textContent = isSignificant
      ? `${currentReadableWordCount.toLocaleString()} words detected on this page.`
      : `Needs ${SIGNIFICANT_WORD_COUNT}+ words to show.`;
  }
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
  clearDeemphasis();
  if ("highlights" in CSS) {
    CSS.highlights.delete(HIGHLIGHT_NAME_SENTENCES);
    CSS.highlights.delete(HIGHLIGHT_NAME_KEYWORDS);
  }
  document
    .querySelectorAll(`mark[${MARK_ATTR}], span[${EMBOLDEN_ATTR}]`)
    .forEach((node) => node.replaceWith(...node.childNodes));
}

function parseRgbColor(value: string): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/i);
  if (!match) {
    return null;
  }
  const r = Number.parseInt(match[1] ?? "", 10);
  const g = Number.parseInt(match[2] ?? "", 10);
  const b = Number.parseInt(match[3] ?? "", 10);
  const a = match[4] !== undefined ? Number.parseFloat(match[4]) : 1;
  if ([r, g, b, a].some((n) => Number.isNaN(n))) {
    return null;
  }
  return { r, g, b, a };
}

function computeDeemphasisColor(base: { r: number; g: number; b: number; a: number }, strength: number) {
  const clamped = Math.max(0, Math.min(1, strength));
  const luma = base.r * 0.2126 + base.g * 0.7152 + base.b * 0.0722;
  const gray = Math.round(Math.max(0, Math.min(255, luma * 0.4 + 128 * 0.6)));
  const r = Math.round(base.r * (1 - clamped) + gray * clamped);
  const g = Math.round(base.g * (1 - clamped) + gray * clamped);
  const b = Math.round(base.b * (1 - clamped) + gray * clamped);
  return `rgba(${r}, ${g}, ${b}, ${base.a})`;
}

function getContrastStrength() {
  return clampHighlightContrast(highlightContrast) / 100;
}

function applyDeemphasis(root: Element) {
  const computed = window.getComputedStyle(root);
  const parsed = parseRgbColor(computed.color);
  if (!parsed) {
    return;
  }

  const baseColor = `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${parsed.a})`;
  const deemphasisColor = computeDeemphasisColor(parsed, getContrastStrength());
  root.classList.add(DEEMPHASIZE_CLASS);
  root.setAttribute("data-tldr-deemphasize", "true");
  (root as HTMLElement).style.setProperty(BASE_COLOR_VAR, baseColor);
  (root as HTMLElement).style.setProperty(DEEMPHASIZE_COLOR_VAR, deemphasisColor);
  deemphasizedRoot = root;
}

function refreshDeemphasis() {
  if (!deemphasizedRoot) {
    return;
  }
  const root = deemphasizedRoot;
  if (!root.isConnected) {
    deemphasizedRoot = null;
    return;
  }
  const base = parseRgbColor((root as HTMLElement).style.getPropertyValue(BASE_COLOR_VAR).trim());
  if (!base) {
    return;
  }
  (root as HTMLElement).style.setProperty(DEEMPHASIZE_COLOR_VAR, computeDeemphasisColor(base, getContrastStrength()));
}

function clearDeemphasis() {
  if (!deemphasizedRoot) {
    return;
  }
  const root = deemphasizedRoot;
  deemphasizedRoot = null;
  if (!root.isConnected) {
    return;
  }
  root.classList.remove(DEEMPHASIZE_CLASS);
  root.removeAttribute("data-tldr-deemphasize");
  (root as HTMLElement).style.removeProperty(BASE_COLOR_VAR);
  (root as HTMLElement).style.removeProperty(DEEMPHASIZE_COLOR_VAR);
}

function ensureContrastSetting() {
  if (storageInitialized) {
    return;
  }
  storageInitialized = true;
  chrome.storage.sync.get([HIGHLIGHT_CONTRAST_KEY], (result) => {
    highlightContrast = clampHighlightContrast((result as any)?.[HIGHLIGHT_CONTRAST_KEY]);
    refreshDeemphasis();
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") {
      return;
    }
    const change = (changes as any)?.[HIGHLIGHT_CONTRAST_KEY];
    if (!change) {
      return;
    }
    highlightContrast = clampHighlightContrast(change.newValue);
    refreshDeemphasis();
  });
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
  ensureContrastSetting();
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
    applyDeemphasis(root);
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

function handleClick(event: MouseEvent) {
  // Remove any existing inline popover (older builds showed a tooltip on highlight click).
  document.getElementById(POPUP_ID)?.remove();

  const entry = isClickInsideHighlight(event);
  if (!entry) {
    return;
  }
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

function handleMessage(
  message: ExtractRequest | ApplyHighlightsRequest | ApplyRsvpCursorRequest | ClearRsvpCursorRequest,
) {
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

  if (message.type === "ApplyRsvpCursorRequest") {
    log("cs", "ApplyRsvpCursorRequest", {
      requestId: message.requestId,
      start: message.start,
      end: message.end,
      scroll: Boolean(message.scrollIntoView),
    });
    applyRsvpCursor(message.start, message.end, Boolean(message.scrollIntoView), message.word);
  }

  if (message.type === "ClearRsvpCursorRequest") {
    log("cs", "ClearRsvpCursorRequest", { requestId: message.requestId });
    clearRsvpCursor();
  }
}

chrome.runtime.onMessage.addListener((message: ExtractRequest | ApplyHighlightsRequest | ApplyRsvpCursorRequest | ClearRsvpCursorRequest) => {
  log("cs", "onMessage", { type: message?.type, requestId: (message as any)?.requestId });
  handleMessage(message);
});

document.addEventListener("click", handleClick, { capture: true });

ensureContrastSetting();

// These may be a bit heavier; do them after the message listener is registered so we can receive requests immediately.
refreshNodes();
ensureObserver();

signalContentReady();
