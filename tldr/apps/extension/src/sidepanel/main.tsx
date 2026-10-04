import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { extractKeywordHighlightSpans, splitIntoSentences } from "@tldr/core";
import type {
  ApplyHighlightsAck,
  ApplyRsvpCursorRequest,
  ClearRsvpCursorRequest,
  ExtractResult,
  StartRsvpFromText,
} from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { log, runtimeLastError, warn } from "../shared/logger";
import {
  BUBBLE_VISIBLE_KEY,
  clampHighlightContrast,
  DEFAULT_BUBBLE_VISIBLE,
  DEFAULT_EXTENSION_THEME_BASE_COLOR,
  DEFAULT_HIGHLIGHT_CONTRAST,
  DEFAULT_RSVP_ANCHOR_COLOR,
  deriveExtensionThemeColors,
  EXTENSION_THEME_COLORS_KEY,
  HIGHLIGHT_CONTRAST_KEY,
  normalizeBubbleVisible,
  normalizeExtensionThemeBaseColor,
  normalizeRsvpAnchorColor,
  RSVP_ANCHOR_COLOR_KEY,
} from "../shared/settings";
import "./sidepanel.css";

const DEFAULT_RSVP_WPM = 450;

type RsvpToken = { word: string; start: number; end: number };
type SelectionMatch = { start: number; end: number };
type SidepanelPage = "tldr" | "settings";

function getAnchorIndex(word: string): number {
  const length = word.length;
  if (length <= 1) {
    return 0;
  }
  if (length <= 5) {
    return 1;
  }
  if (length <= 9) {
    return 2;
  }
  return 3;
}

function splitWordAroundAnchor(word: string): { left: string; anchor: string; right: string } {
  if (!word) {
    return { left: "", anchor: "", right: "" };
  }

  const baseIndex = Math.min(getAnchorIndex(word), word.length - 1);
  const isLetterOrNumber = (char: string) => /[A-Za-z0-9]/.test(char);
  let anchorIndex = baseIndex;

  if (!isLetterOrNumber(word[anchorIndex])) {
    let offset = 1;
    while (offset < word.length) {
      const before = anchorIndex - offset;
      const after = anchorIndex + offset;
      if (before >= 0 && isLetterOrNumber(word[before])) {
        anchorIndex = before;
        break;
      }
      if (after < word.length && isLetterOrNumber(word[after])) {
        anchorIndex = after;
        break;
      }
      offset += 1;
    }
  }

  return {
    left: word.slice(0, anchorIndex),
    anchor: word[anchorIndex] ?? "",
    right: word.slice(anchorIndex + 1),
  };
}

function tokenizeRsvpText(text: string, baseOffset = 0): RsvpToken[] {
  const tokens: RsvpToken[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    const word = match[0] ?? "";
    if (word) {
      const start = baseOffset + match.index;
      tokens.push({ word, start, end: start + word.length });
    }
    match = regex.exec(text);
  }
  return tokens;
}

function findSelectionInText(text: string, selectionText: string): SelectionMatch | null {
  const trimmedSelection = selectionText.trim();
  if (!trimmedSelection) {
    return null;
  }

  const exactIndex = text.indexOf(trimmedSelection);
  if (exactIndex >= 0) {
    return { start: exactIndex, end: exactIndex + trimmedSelection.length };
  }

  const lowerText = text.toLowerCase();
  const lowerSelection = trimmedSelection.toLowerCase();
  const caseInsensitiveIndex = lowerText.indexOf(lowerSelection);
  if (caseInsensitiveIndex >= 0) {
    return { start: caseInsensitiveIndex, end: caseInsensitiveIndex + trimmedSelection.length };
  }

  const escaped = trimmedSelection.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const looseWhitespacePattern = escaped.replace(/\s+/g, "\\s+");
  const pattern = new RegExp(looseWhitespacePattern, "i");
  const match = pattern.exec(text);
  if (!match || typeof match.index !== "number") {
    return null;
  }

  const matchedValue = match[0] ?? "";
  return { start: match.index, end: match.index + matchedValue.length };
}

function findTokenIndexForOffset(tokens: RsvpToken[], offset: number): number {
  if (!tokens.length) {
    return 0;
  }
  const index = tokens.findIndex((token) => offset >= token.start && offset < token.end);
  if (index >= 0) {
    return index;
  }
  const nextIndex = tokens.findIndex((token) => token.start >= offset);
  if (nextIndex >= 0) {
    return nextIndex;
  }
  return tokens.length - 1;
}

function buildRsvpSentenceStartIndexes(tokens: RsvpToken[], text: string, baseOffset = 0): number[] {
  if (!tokens.length) {
    return [];
  }

  const starts = new Set<number>();
  starts.add(0);

  const sentences = splitIntoSentences(text);
  if (!sentences.length) {
    return [0];
  }

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

    const sentenceStart = baseOffset + index;
    const tokenIndex = findTokenIndexForOffset(tokens, sentenceStart);
    if (tokenIndex >= 0 && tokenIndex < tokens.length) {
      starts.add(tokenIndex);
    }

    searchStart = index + normalizedSentence.length;
  }

  return Array.from(starts).sort((a, b) => a - b);
}

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<SidepanelPage>("tldr");
  const [highlightContrast, setHighlightContrast] = useState<number>(DEFAULT_HIGHLIGHT_CONTRAST);
  const [themeBaseColor, setThemeBaseColor] = useState<string>(DEFAULT_EXTENSION_THEME_BASE_COLOR);
  const [rsvpAnchorColor, setRsvpAnchorColor] = useState<string>(DEFAULT_RSVP_ANCHOR_COLOR);
  const [bubbleVisible, setBubbleVisible] = useState<boolean>(DEFAULT_BUBBLE_VISIBLE);
  const [error, setError] = useState<string | null>(null);
  const [rsvpWpm, setRsvpWpm] = useState<number>(DEFAULT_RSVP_WPM);
  const [rsvpTokens, setRsvpTokens] = useState<RsvpToken[]>([]);
  const [rsvpSentenceStarts, setRsvpSentenceStarts] = useState<number[]>([]);
  const [rsvpIndex, setRsvpIndex] = useState<number>(0);
  const [rsvpIsPlaying, setRsvpIsPlaying] = useState<boolean>(false);
  const [rsvpIsLoading, setRsvpIsLoading] = useState<boolean>(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [rsvpCursorEnabled, setRsvpCursorEnabled] = useState<boolean>(true);
  const [highlightState, setHighlightState] = useState<{ isLoading: boolean; error: string | null; count: number | null }>(
    {
      isLoading: false,
      error: null,
      count: null,
    },
  );
  const contrastWriteTimeoutRef = useRef<number | null>(null);
  const themeWriteTimeoutRef = useRef<number | null>(null);
  const anchorWriteTimeoutRef = useRef<number | null>(null);

  const pendingExtractRef = useRef<{
    requestId: string;
    tabId: number;
    resolve: (result: ExtractResult) => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  const currentRsvpWord = useMemo(() => {
    if (!rsvpTokens.length) {
      return "";
    }
    const index = Math.min(rsvpIndex, rsvpTokens.length - 1);
    return rsvpTokens[index]?.word ?? "";
  }, [rsvpIndex, rsvpTokens]);

  const rsvpDisplay = useMemo(() => splitWordAroundAnchor(currentRsvpWord), [currentRsvpWord]);

  const shellThemeStyle = useMemo(() => {
    const theme = deriveExtensionThemeColors(themeBaseColor);
    return {
      "--assist-ext-bg": theme.bg,
      "--assist-ext-surface": theme.surface,
      "--assist-ext-bg-elevated": theme.surface,
      "--assist-ext-surface-soft": `${theme.surface}cc`,
      "--assist-ext-border": theme.border,
      "--assist-ext-border-soft": `${theme.border}99`,
      "--assist-ext-text": theme.text,
      "--assist-ext-muted": theme.muted,
      "--assist-ext-accent": theme.accent,
      "--assist-ext-rsvp-anchor": rsvpAnchorColor,
      "--assist-ext-danger": theme.danger,
    } as React.CSSProperties;
  }, [themeBaseColor, rsvpAnchorColor]);

  const sendRsvpCursorUpdate = useCallback(
    (activeTabId: number, token: RsvpToken, options?: { scrollIntoView?: boolean }) => {
      chrome.runtime.sendMessage({
        type: "ApplyRsvpCursorRequest",
        requestId: createRequestId("rsvp-cursor"),
        tabId: activeTabId,
        start: token.start,
        end: token.end,
        word: token.word,
        scrollIntoView: options?.scrollIntoView ?? false,
      } satisfies ApplyRsvpCursorRequest);
    },
    [],
  );

  const sendRsvpCursorClear = useCallback((activeTabId: number) => {
    chrome.runtime.sendMessage({
      type: "ClearRsvpCursorRequest",
      requestId: createRequestId("rsvp-cursor-clear"),
      tabId: activeTabId,
    } satisfies ClearRsvpCursorRequest);
  }, []);

  const getActiveTabId = useCallback(async (): Promise<number | null> => {
    return await new Promise<number | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id ?? null);
      });
    });
  }, []);

  const requestExtract = useCallback((activeTabId: number): Promise<ExtractResult> => {
    if (pendingExtractRef.current) {
      pendingExtractRef.current.reject(new Error("Canceled by a newer request."));
      window.clearTimeout(pendingExtractRef.current.timeoutId);
      pendingExtractRef.current = null;
    }

    const requestId = createRequestId("extract");
    return new Promise<ExtractResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        if (pendingExtractRef.current?.requestId === requestId) {
          pendingExtractRef.current = null;
        }
        reject(new Error("Timed out extracting page text."));
      }, 8000);

      pendingExtractRef.current = { requestId, tabId: activeTabId, resolve, reject, timeoutId };
      setError(null);
      chrome.runtime.sendMessage({
        type: "ExtractRequest",
        requestId,
        tabId: activeTabId,
      });
    });
  }, []);

  useEffect(() => {
    chrome.storage.sync.get([HIGHLIGHT_CONTRAST_KEY, EXTENSION_THEME_COLORS_KEY, RSVP_ANCHOR_COLOR_KEY, BUBBLE_VISIBLE_KEY], (result) => {
      setHighlightContrast(clampHighlightContrast((result as any)?.[HIGHLIGHT_CONTRAST_KEY]));
      setThemeBaseColor(normalizeExtensionThemeBaseColor((result as any)?.[EXTENSION_THEME_COLORS_KEY]));
      setRsvpAnchorColor(normalizeRsvpAnchorColor((result as any)?.[RSVP_ANCHOR_COLOR_KEY]));
      setBubbleVisible(normalizeBubbleVisible((result as any)?.[BUBBLE_VISIBLE_KEY]));
    });

    const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "sync") {
        return;
      }

      const contrastChange = (changes as any)?.[HIGHLIGHT_CONTRAST_KEY] as chrome.storage.StorageChange | undefined;
      if (contrastChange) {
        setHighlightContrast(clampHighlightContrast(contrastChange.newValue));
      }
      const themeChange = (changes as any)?.[EXTENSION_THEME_COLORS_KEY] as chrome.storage.StorageChange | undefined;
      if (themeChange) {
        setThemeBaseColor(normalizeExtensionThemeBaseColor(themeChange.newValue));
      }
      const anchorChange = (changes as any)?.[RSVP_ANCHOR_COLOR_KEY] as chrome.storage.StorageChange | undefined;
      if (anchorChange) {
        setRsvpAnchorColor(normalizeRsvpAnchorColor(anchorChange.newValue));
      }
      const bubbleChange = (changes as any)?.[BUBBLE_VISIBLE_KEY] as chrome.storage.StorageChange | undefined;
      if (bubbleChange !== undefined) {
        setBubbleVisible(normalizeBubbleVisible(bubbleChange.newValue));
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
      if (contrastWriteTimeoutRef.current) {
        window.clearTimeout(contrastWriteTimeoutRef.current);
      }
      if (themeWriteTimeoutRef.current) {
        window.clearTimeout(themeWriteTimeoutRef.current);
      }
      if (anchorWriteTimeoutRef.current) {
        window.clearTimeout(anchorWriteTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handler = (message: ExtractResult | ApplyHighlightsAck | StartRsvpFromText) => {
      if (!message?.type) {
        return;
      }
      log("sp", "onMessage", { type: message.type, tabId: (message as any).tabId, requestId: (message as any).requestId });
      if (message.type === "ExtractResult") {
        setError(message.error ?? null);

        const pending = pendingExtractRef.current;
        if (pending && pending.requestId === message.requestId && pending.tabId === message.tabId) {
          window.clearTimeout(pending.timeoutId);
          pendingExtractRef.current = null;
          pending.resolve(message);
        }
      }
      if (message.type === "ApplyHighlightsAck") {
        setHighlightState((prev) => ({
          ...prev,
          isLoading: false,
          error: message.error ?? null,
          count: message.count ?? 0,
        }));
      }
      if (message.type === "StartRsvpFromText") {
        const text = (message.text ?? "").trim();
        if (!text) {
          setRsvpError("No text selected.");
          return;
        }

        void (async () => {
          setTabId(message.tabId);
          setRsvpIsLoading(true);
          setRsvpError(null);

          try {
            const extract = await requestExtract(message.tabId);
            if (extract.error) {
              setRsvpError(extract.error);
              setRsvpIsLoading(false);
              return;
            }

            const fullText = extract.text ?? "";
            const pageTokens = tokenizeRsvpText(fullText);
            const selectionMatch = findSelectionInText(fullText, text);

            if (pageTokens.length && selectionMatch) {
              const startIndex = findTokenIndexForOffset(pageTokens, selectionMatch.start);
              setRsvpCursorEnabled(true);
              setRsvpTokens(pageTokens);
              setRsvpSentenceStarts(buildRsvpSentenceStartIndexes(pageTokens, fullText));
              setRsvpIndex(startIndex);
              setRsvpIsPlaying(true);
              setRsvpIsLoading(false);
              sendRsvpCursorUpdate(message.tabId, pageTokens[startIndex]!, { scrollIntoView: true });
              return;
            }

            const selectionTokens = tokenizeRsvpText(text);
            if (!selectionTokens.length) {
              setRsvpError("No readable text selected.");
              setRsvpIsLoading(false);
              return;
            }

            setRsvpCursorEnabled(false);
            sendRsvpCursorClear(message.tabId);
            setRsvpTokens(selectionTokens);
            setRsvpSentenceStarts(buildRsvpSentenceStartIndexes(selectionTokens, text));
            setRsvpIndex(0);
            setRsvpIsPlaying(true);
            setRsvpIsLoading(false);
          } catch (err) {
            setRsvpError(err instanceof Error ? err.message : "Unable to extract page text.");
            setRsvpIsLoading(false);
          }
        })();
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [requestExtract, sendRsvpCursorClear, sendRsvpCursorUpdate]);

  const handleContrastChange = useCallback((value: number) => {
    const next = clampHighlightContrast(value);
    setHighlightContrast(next);
    if (contrastWriteTimeoutRef.current) {
      window.clearTimeout(contrastWriteTimeoutRef.current);
    }
    contrastWriteTimeoutRef.current = window.setTimeout(() => {
      chrome.storage.sync.set({ [HIGHLIGHT_CONTRAST_KEY]: next });
    }, 120);
  }, []);

  const queueThemeColorWrite = useCallback((next: string) => {
    if (themeWriteTimeoutRef.current) {
      window.clearTimeout(themeWriteTimeoutRef.current);
    }
    themeWriteTimeoutRef.current = window.setTimeout(() => {
      chrome.storage.sync.set({ [EXTENSION_THEME_COLORS_KEY]: next });
    }, 120);
  }, []);

  const handleThemeColorChange = useCallback(
    (value: string) => {
      const next = normalizeExtensionThemeBaseColor(value);
      setThemeBaseColor(next);
      queueThemeColorWrite(next);
    },
    [queueThemeColorWrite],
  );

  const queueAnchorColorWrite = useCallback((next: string) => {
    if (anchorWriteTimeoutRef.current) {
      window.clearTimeout(anchorWriteTimeoutRef.current);
    }
    anchorWriteTimeoutRef.current = window.setTimeout(() => {
      chrome.storage.sync.set({ [RSVP_ANCHOR_COLOR_KEY]: next });
    }, 120);
  }, []);

  const handleAnchorColorChange = useCallback(
    (value: string) => {
      const next = normalizeRsvpAnchorColor(value);
      setRsvpAnchorColor(next);
      queueAnchorColorWrite(next);
    },
    [queueAnchorColorWrite],
  );

  const handleThemeReset = useCallback(() => {
    setThemeBaseColor(DEFAULT_EXTENSION_THEME_BASE_COLOR);
    queueThemeColorWrite(DEFAULT_EXTENSION_THEME_BASE_COLOR);
    setRsvpAnchorColor(DEFAULT_RSVP_ANCHOR_COLOR);
    queueAnchorColorWrite(DEFAULT_RSVP_ANCHOR_COLOR);
  }, [queueThemeColorWrite, queueAnchorColorWrite]);

  const handleBubbleVisibleToggle = useCallback(() => {
    const next = !bubbleVisible;
    setBubbleVisible(next);
    chrome.storage.sync.set({ [BUBBLE_VISIBLE_KEY]: next });
  }, [bubbleVisible]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const id = tabs[0]?.id ?? null;
      if (id !== null) {
        setTabId(id);
        log("sp", "Active tab resolved", { tabId: id });
        chrome.runtime.sendMessage(
          {
            type: "SidepanelConnect",
            requestId: createRequestId("sidepanel-connect"),
            tabId: id,
          },
          () => runtimeLastError("sp", "SidepanelConnect sendMessage"),
        );
      } else {
        warn("sp", "No active tab found on mount");
      }
    });
  }, []);

  const handleHighlightKeywords = useCallback(() => {
    void (async () => {
      const activeId = await getActiveTabId();
      if (activeId === null) {
        setHighlightState({ isLoading: false, error: "No active tab.", count: null });
        return;
      }
      setTabId(activeId);
      setHighlightState({ isLoading: true, error: null, count: null });

      try {
        const extract = await requestExtract(activeId);
        if (extract.error) {
          setHighlightState({ isLoading: false, error: extract.error, count: null });
          return;
        }

        const text = extract.text ?? "";
        if (!text.trim()) {
          setHighlightState({ isLoading: false, error: "No readable text found on this page.", count: null });
          return;
        }

        // Keep sidepanel keyword highlighting behavior in lockstep with the floating bubble action.
        const highlights = extractKeywordHighlightSpans(text);
        if (!highlights.length) {
          setHighlightState({ isLoading: false, error: "No highlight terms found.", count: null });
          return;
        }

        chrome.runtime.sendMessage({
          type: "ApplyHighlightsRequest",
          requestId: createRequestId("highlight-terms"),
          tabId: activeId,
          highlights,
          highlightType: "keywords",
        });
      } catch (err) {
        setHighlightState({
          isLoading: false,
          error: err instanceof Error ? err.message : "Unable to extract page text.",
          count: null,
        });
      }
    })();
  }, [getActiveTabId, requestExtract]);

  const handleRsvpStart = useCallback(() => {
    void (async () => {
      const activeId = await getActiveTabId();
      if (activeId === null) {
        setRsvpError("No active tab.");
        return;
      }
      setTabId(activeId);
      setRsvpIsLoading(true);
      setRsvpError(null);
      setRsvpCursorEnabled(true);

      try {
        const extract = await requestExtract(activeId);
        if (extract.error) {
          setRsvpError(extract.error);
          setRsvpIsLoading(false);
          sendRsvpCursorClear(activeId);
          return;
        }
        const text = extract.text ?? "";
        const tokens = tokenizeRsvpText(text);
        if (!tokens.length) {
          setRsvpError("No readable text found on this page.");
          setRsvpSentenceStarts([]);
          setRsvpIsLoading(false);
          sendRsvpCursorClear(activeId);
          return;
        }
        setRsvpTokens(tokens);
        setRsvpSentenceStarts(buildRsvpSentenceStartIndexes(tokens, text));
        setRsvpIndex(0);
        setRsvpIsPlaying(true);
        setRsvpIsLoading(false);
        sendRsvpCursorUpdate(activeId, tokens[0]!, { scrollIntoView: true });
      } catch (err) {
        setRsvpError(err instanceof Error ? err.message : "Unable to extract page text.");
        setRsvpIsLoading(false);
        sendRsvpCursorClear(activeId);
      }
    })();
  }, [getActiveTabId, requestExtract, sendRsvpCursorClear, sendRsvpCursorUpdate]);

  const handleRsvpToggle = useCallback(() => {
    if (!rsvpTokens.length) {
      return;
    }
    setRsvpIsPlaying((prev) => !prev);
  }, [rsvpTokens.length]);

  const moveRsvpBySentence = useCallback(
    (direction: -1 | 1) => {
      if (!rsvpTokens.length) {
        return;
      }

      const starts = rsvpSentenceStarts.length ? rsvpSentenceStarts : [0];
      setRsvpIndex((prev) => {
        const bounded = Math.max(0, Math.min(prev, rsvpTokens.length - 1));
        let sentenceIndex = 0;
        for (let i = 0; i < starts.length; i += 1) {
          if (starts[i]! <= bounded) {
            sentenceIndex = i;
          } else {
            break;
          }
        }

        const targetSentenceIndex = Math.max(0, Math.min(starts.length - 1, sentenceIndex + direction));
        const nextIndex = starts[targetSentenceIndex] ?? 0;
        return Math.max(0, Math.min(nextIndex, rsvpTokens.length - 1));
      });
    },
    [rsvpSentenceStarts, rsvpTokens.length],
  );

  const handleRsvpSentenceBack = useCallback(() => {
    moveRsvpBySentence(-1);
  }, [moveRsvpBySentence]);

  const handleRsvpSentenceForward = useCallback(() => {
    moveRsvpBySentence(1);
  }, [moveRsvpBySentence]);

  const handleRsvpStop = useCallback(() => {
    setRsvpIsPlaying(false);
    setRsvpIndex(0);
    if (rsvpCursorEnabled && tabId !== null && rsvpTokens.length) {
      sendRsvpCursorUpdate(tabId, rsvpTokens[0]!, { scrollIntoView: true });
    }
  }, [rsvpCursorEnabled, rsvpTokens, sendRsvpCursorUpdate, tabId]);

  useEffect(() => {
    if (!rsvpIsPlaying || rsvpTokens.length === 0) {
      return;
    }

    if (rsvpIndex >= rsvpTokens.length) {
      setRsvpIsPlaying(false);
      return;
    }

    const interval = Math.max(1, Math.round(60000 / rsvpWpm));
    const timeoutId = window.setTimeout(() => {
      setRsvpIndex((prev) => prev + 1);
    }, interval);

    return () => window.clearTimeout(timeoutId);
  }, [rsvpIndex, rsvpIsPlaying, rsvpTokens.length, rsvpWpm]);

  useEffect(() => {
    if (!rsvpCursorEnabled || tabId === null || !rsvpTokens.length) {
      return;
    }
    const index = Math.min(rsvpIndex, rsvpTokens.length - 1);
    const token = rsvpTokens[index];
    if (!token) {
      return;
    }
    sendRsvpCursorUpdate(tabId, token, { scrollIntoView: rsvpIsPlaying });
  }, [rsvpCursorEnabled, rsvpIndex, rsvpIsPlaying, rsvpTokens, sendRsvpCursorUpdate, tabId]);

  return (
    <div className="assist-ext-shell" style={shellThemeStyle}>
      <header className="assist-ext-topbar">
        <div className="assist-ext-brand">
          <div className="assist-ext-brand-title">tldr</div>
          <div className="assist-ext-brand-subtitle">Reading simplifier</div>
        </div>
        <div className="assist-ext-segmented assist-ext-segmented--tabs" role="tablist" aria-label="Side panel pages">
          <button
            className={`assist-ext-segment ${activePage === "tldr" ? "assist-ext-segment--active" : ""}`}
            onClick={() => setActivePage("tldr")}
            role="tab"
            aria-selected={activePage === "tldr"}
          >
            TLDR
          </button>
          <button
            className={`assist-ext-segment ${activePage === "settings" ? "assist-ext-segment--active" : ""}`}
            onClick={() => setActivePage("settings")}
            role="tab"
            aria-selected={activePage === "settings"}
          >
            Settings
          </button>
        </div>
      </header>

      {activePage === "tldr" ? (
        <>
          <section className="assist-ext-section">
            <div className="assist-ext-section-title">Actions</div>
            <div className="assist-ext-segmented" role="group" aria-label="Page actions">
              <button className="assist-ext-segment" onClick={handleHighlightKeywords}>
                {highlightState.isLoading ? "Highlighting..." : "Highlight keywords"}
              </button>
            </div>
            {error ? <div className="assist-ext-error">{error}</div> : null}
            {highlightState.error ? <div className="assist-ext-error">{highlightState.error}</div> : null}
            {highlightState.count !== null && !highlightState.error ? (
              <div className="assist-ext-status">Highlighted {highlightState.count} keyword matches.</div>
            ) : null}
          </section>

          <section className="assist-ext-section">
            <div className="assist-ext-section-title">Rapid serial visual presentation</div>
            <div className="assist-ext-rsvp-display" aria-live="polite">
              <span className="assist-ext-rsvp-left">{rsvpDisplay.left}</span>
              <span className="assist-ext-rsvp-anchor" aria-hidden={rsvpDisplay.anchor === ""}>
                {rsvpDisplay.anchor || "."}
              </span>
              <span className="assist-ext-rsvp-right">{rsvpDisplay.right}</span>
            </div>
            <div className="assist-ext-row">
              <button className="assist-ext-button assist-ext-button--accent" onClick={handleRsvpStart} disabled={rsvpIsLoading}>
                {rsvpIsLoading ? "Loading..." : "Start"}
              </button>
              <button className="assist-ext-button" onClick={handleRsvpToggle} disabled={!rsvpTokens.length}>
                {rsvpIsPlaying ? "Pause" : "Resume"}
              </button>
              <button className="assist-ext-button" onClick={handleRsvpStop} disabled={!rsvpTokens.length}>
                Reset
              </button>
            </div>
            <div className="assist-ext-row">
              <button className="assist-ext-button" onClick={handleRsvpSentenceBack} disabled={!rsvpTokens.length}>
                Rewind sentence
              </button>
              <button className="assist-ext-button" onClick={handleRsvpSentenceForward} disabled={!rsvpTokens.length}>
                Skip sentence
              </button>
            </div>
            <div className="assist-ext-field">
              <div className="assist-ext-field-row">
                <div className="assist-ext-field-label">Words per minute</div>
                <div className="assist-ext-field-value">{rsvpWpm}</div>
              </div>
              <input
                className="assist-ext-range"
                type="range"
                min={150}
                max={700}
                step={10}
                value={rsvpWpm}
                onChange={(event) => setRsvpWpm(Number(event.currentTarget.value))}
                aria-label="Words per minute"
              />
              <div className="assist-ext-meta">The highlighted anchor letter stays fixed to speed up reading.</div>
            </div>
            {rsvpError ? <div className="assist-ext-error">{rsvpError}</div> : null}
          </section>
        </>
      ) : (
        <section className="assist-ext-section">
          <div className="assist-ext-section-title">Settings</div>
          <div className="assist-ext-field">
            <div className="assist-ext-field-row">
              <div className="assist-ext-field-label">Floating bubble</div>
              <button
                type="button"
                className="assist-ext-button"
                onClick={handleBubbleVisibleToggle}
                aria-pressed={!bubbleVisible}
                aria-label={bubbleVisible ? "Hide bubble" : "Show bubble"}
              >
                {bubbleVisible ? "Hide bubble" : "Show bubble"}
              </button>
            </div>
            <div className="assist-ext-meta">
              When shown, the bubble appears on pages with 200+ words. Turn it off to hide it on all pages.
            </div>
          </div>

          <div className="assist-ext-field">
            <div className="assist-ext-field-row">
              <div className="assist-ext-field-label">Highlight contrast</div>
              <div className="assist-ext-field-value">{highlightContrast}%</div>
            </div>
            <input
              className="assist-ext-range"
              type="range"
              min={0}
              max={100}
              step={1}
              value={highlightContrast}
              onChange={(event) => handleContrastChange(Number(event.currentTarget.value))}
              aria-label="Highlight contrast"
            />
            <div className="assist-ext-meta">Higher values dim non-highlighted text more.</div>
          </div>

          <div className="assist-ext-field">
            <div className="assist-ext-field-row">
              <div className="assist-ext-field-label">Theme color</div>
              <button className="assist-ext-button" onClick={handleThemeReset} type="button">
                Reset defaults
              </button>
            </div>
            <label className="assist-ext-color-item">
              <span className="assist-ext-field-label">Base color</span>
              <input
                className="assist-ext-color-input"
                type="color"
                value={themeBaseColor}
                onChange={(event) => handleThemeColorChange(event.currentTarget.value)}
                aria-label="Theme base color"
              />
            </label>
            <label className="assist-ext-color-item">
              <span className="assist-ext-field-label">RSVP anchor color</span>
              <input
                className="assist-ext-color-input"
                type="color"
                value={rsvpAnchorColor}
                onChange={(event) => handleAnchorColorChange(event.currentTarget.value)}
                aria-label="RSVP anchor letter color"
              />
            </label>
            <div className="assist-ext-meta">
              One color drives the whole extension palette. Background, surface, border, and accent stay proportional.
              The anchor color controls the highlighted pivot letter in RSVP.
            </div>
          </div>

        </section>
      )}

    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
