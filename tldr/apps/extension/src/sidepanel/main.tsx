import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HighlightSpan } from "@tldr/core";
import { computeSpacyStyleHighlights, computeSpacyStyleHighlightsOld, extractDateHighlights, splitIntoSentences } from "@tldr/core";
import type {
  ApplyHighlightsAck,
  ApplyRsvpCursorRequest,
  AuthStatusResult,
  ClearRsvpCursorRequest,
  ExtractResult,
  LlmActionResult,
  StartRsvpFromText,
} from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { log, runtimeLastError, warn } from "../shared/logger";
import {
  clampHighlightAlgorithm,
  clampHighlightContrast,
  clampHighlightImportanceThreshold,
  DEFAULT_HIGHLIGHT_ALGORITHM,
  DEFAULT_HIGHLIGHT_CONTRAST,
  DEFAULT_HIGHLIGHT_IMPORTANCE_THRESHOLD,
  HIGHLIGHT_ALGORITHM_KEY,
  HIGHLIGHT_CONTRAST_KEY,
  HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY,
  type HighlightAlgorithm,
} from "../shared/settings";
import "./sidepanel.css";

function buildHighlights(text: string, algorithm: HighlightAlgorithm): HighlightSpan[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const highlightSpans =
    algorithm === "old" ? computeSpacyStyleHighlightsOld(trimmed) : computeSpacyStyleHighlights(trimmed);
  const dateTerms = extractDateHighlights(trimmed, 24);

  const dateSpans: HighlightSpan[] = [];
  if (dateTerms.length) {
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    dateTerms.forEach((term) => {
      const regex = new RegExp(escapeRegExp(term), "gi");
      let match: RegExpExecArray | null = regex.exec(trimmed);
      while (match) {
        dateSpans.push({
          text: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
        match = regex.exec(trimmed);
      }
    });
  }

  if (!highlightSpans.length && !dateSpans.length) {
    return [];
  }

  const overlaps = (span: HighlightSpan) =>
    highlightSpans.some((highlight) => span.start < highlight.end && span.end > highlight.start);
  const filteredDates = dateSpans.filter((span) => !overlaps(span));

  return [...highlightSpans, ...filteredDates].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    return b.end - b.start - (a.end - a.start);
  });
}

const DEFAULT_RSVP_WPM = 450;
const RSVP_CONTEXT_WINDOW = 8;

type RsvpToken = { word: string; start: number; end: number };
type SelectionMatch = { start: number; end: number };
type SidepanelPage = "tldr" | "account";
type AccountProfile = {
  plan: string;
  monthly_usage: number;
  monthly_limit: number;
  subscription_status?: string | null;
};

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
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

  const [tabId, setTabId] = useState<number | null>(null);
  const [activePage, setActivePage] = useState<SidepanelPage>("tldr");
  const [highlightContrast, setHighlightContrast] = useState<number>(DEFAULT_HIGHLIGHT_CONTRAST);
  const [highlightAlgorithm, setHighlightAlgorithm] = useState<HighlightAlgorithm>(DEFAULT_HIGHLIGHT_ALGORITHM);
  const [highlightImportanceThreshold, setHighlightImportanceThreshold] = useState<number>(
    DEFAULT_HIGHLIGHT_IMPORTANCE_THRESHOLD,
  );
  const [pageText, setPageText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [rsvpWpm, setRsvpWpm] = useState<number>(DEFAULT_RSVP_WPM);
  const [rsvpTokens, setRsvpTokens] = useState<RsvpToken[]>([]);
  const [rsvpSentenceStarts, setRsvpSentenceStarts] = useState<number[]>([]);
  const [rsvpIndex, setRsvpIndex] = useState<number>(0);
  const [rsvpIsPlaying, setRsvpIsPlaying] = useState<boolean>(false);
  const [rsvpIsLoading, setRsvpIsLoading] = useState<boolean>(false);
  const [rsvpError, setRsvpError] = useState<string | null>(null);
  const [rsvpCursorEnabled, setRsvpCursorEnabled] = useState<boolean>(true);
  const [authState, setAuthState] = useState<{
    isLoading: boolean;
    isAuthenticated: boolean;
    expiresAt: string | null;
    error: string | null;
  }>({
    isLoading: true,
    isAuthenticated: false,
    expiresAt: null,
    error: null,
  });
  const [highlightState, setHighlightState] = useState<{ isLoading: boolean; error: string | null; count: number | null }>(
    {
      isLoading: false,
      error: null,
      count: null,
    },
  );
  const [keyInfoState, setKeyInfoState] = useState<{ isLoading: boolean; error: string | null }>({
    isLoading: false,
    error: null,
  });
  const [accountState, setAccountState] = useState<{
    isLoading: boolean;
    profile: AccountProfile | null;
    error: string | null;
  }>({
    isLoading: false,
    profile: null,
    error: null,
  });
  const [keyInfoResult, setKeyInfoResult] = useState<string>("");
  const contrastWriteTimeoutRef = useRef<number | null>(null);
  const algorithmWriteTimeoutRef = useRef<number | null>(null);
  const importanceWriteTimeoutRef = useRef<number | null>(null);

  const pendingExtractRef = useRef<{
    requestId: string;
    tabId: number;
    resolve: (result: ExtractResult) => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  const keyInfoPayload = useMemo(() => {
    try {
      const parsed = JSON.parse(keyInfoResult) as { sections?: unknown; events?: unknown };
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      const sections = (parsed as any).sections;
      if (!sections || typeof sections !== "object") {
        return null;
      }
      const events = Array.isArray((parsed as any).events) ? ((parsed as any).events as any[]) : [];
      return {
        sections: sections as Record<string, string[]>,
        events,
      };
    } catch {
      return null;
    }
  }, [keyInfoResult]);

  const keyInfoLines = useMemo(() => {
    if (!keyInfoResult) {
      return [];
    }
    return keyInfoResult
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }, [keyInfoResult]);

  const currentRsvpWord = useMemo(() => {
    if (!rsvpTokens.length) {
      return "";
    }
    const index = Math.min(rsvpIndex, rsvpTokens.length - 1);
    return rsvpTokens[index]?.word ?? "";
  }, [rsvpIndex, rsvpTokens]);

  const rsvpDisplay = useMemo(() => splitWordAroundAnchor(currentRsvpWord), [currentRsvpWord]);

  const rsvpContext = useMemo(() => {
    if (!rsvpTokens.length) {
      return null;
    }

    const index = Math.min(rsvpIndex, rsvpTokens.length - 1);
    const start = Math.max(0, index - RSVP_CONTEXT_WINDOW);
    const end = Math.min(rsvpTokens.length, index + RSVP_CONTEXT_WINDOW + 1);

    return {
      before: rsvpTokens.slice(start, index).map((token) => token.word),
      current: rsvpTokens[index]?.word ?? "",
      after: rsvpTokens.slice(index + 1, end).map((token) => token.word),
      hasPrefix: start > 0,
      hasSuffix: end < rsvpTokens.length,
    };
  }, [rsvpIndex, rsvpTokens]);

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
      setPageText("");
      chrome.runtime.sendMessage({
        type: "ExtractRequest",
        requestId,
        tabId: activeTabId,
      });
    });
  }, []);

  useEffect(() => {
    chrome.storage.sync.get([HIGHLIGHT_CONTRAST_KEY, HIGHLIGHT_ALGORITHM_KEY, HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY], (result) => {
      setHighlightContrast(clampHighlightContrast((result as any)?.[HIGHLIGHT_CONTRAST_KEY]));
      setHighlightAlgorithm(clampHighlightAlgorithm((result as any)?.[HIGHLIGHT_ALGORITHM_KEY]));
      setHighlightImportanceThreshold(clampHighlightImportanceThreshold((result as any)?.[HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY]));
    });

    const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName !== "sync") {
        return;
      }

      const contrastChange = (changes as any)?.[HIGHLIGHT_CONTRAST_KEY] as chrome.storage.StorageChange | undefined;
      if (contrastChange) {
        setHighlightContrast(clampHighlightContrast(contrastChange.newValue));
      }

      const algorithmChange = (changes as any)?.[HIGHLIGHT_ALGORITHM_KEY] as chrome.storage.StorageChange | undefined;
      if (algorithmChange) {
        setHighlightAlgorithm(clampHighlightAlgorithm(algorithmChange.newValue));
      }

      const importanceChange = (changes as any)?.[HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY] as
        | chrome.storage.StorageChange
        | undefined;
      if (importanceChange) {
        setHighlightImportanceThreshold(clampHighlightImportanceThreshold(importanceChange.newValue));
      }
    };

    chrome.storage.onChanged.addListener(handler);
    return () => {
      chrome.storage.onChanged.removeListener(handler);
      if (contrastWriteTimeoutRef.current) {
        window.clearTimeout(contrastWriteTimeoutRef.current);
      }
      if (algorithmWriteTimeoutRef.current) {
        window.clearTimeout(algorithmWriteTimeoutRef.current);
      }
      if (importanceWriteTimeoutRef.current) {
        window.clearTimeout(importanceWriteTimeoutRef.current);
      }
    };
  }, []);

  const loadAccountProfile = useCallback(async () => {
    if (!authState.isAuthenticated) {
      setAccountState({ isLoading: false, profile: null, error: null });
      return;
    }

    setAccountState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${apiBase}/api/account`, { credentials: "include" });
      const data = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        profile?: Record<string, unknown>;
      };

      if (!response.ok || !data.profile) {
        const message = typeof data.error === "string" ? data.error : "Unable to load account.";
        throw new Error(message);
      }

      const profile = data.profile;
      setAccountState({
        isLoading: false,
        error: null,
        profile: {
          plan: typeof profile.plan === "string" ? profile.plan : "free",
          monthly_usage: typeof profile.monthly_usage === "number" ? profile.monthly_usage : 0,
          monthly_limit: typeof profile.monthly_limit === "number" ? profile.monthly_limit : 0,
          subscription_status: typeof profile.subscription_status === "string" ? profile.subscription_status : null,
        },
      });
    } catch (err) {
      setAccountState({
        isLoading: false,
        profile: null,
        error: err instanceof Error ? err.message : "Unable to load account.",
      });
    }
  }, [apiBase, authState.isAuthenticated]);

  useEffect(() => {
    const handler = (message: ExtractResult | ApplyHighlightsAck | LlmActionResult | StartRsvpFromText) => {
      if (!message?.type) {
        return;
      }
      log("sp", "onMessage", { type: message.type, tabId: (message as any).tabId, requestId: (message as any).requestId });
      if (message.type === "ExtractResult") {
        setError(message.error ?? null);
        setPageText(message.text ?? "");

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
      if (message.type === "LlmActionResult" && message.action === "key_info") {
        setKeyInfoState({ isLoading: false, error: message.error ?? null });
        setKeyInfoResult(message.result ?? "");
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

  const handleHighlightAlgorithmChange = useCallback((algorithm: HighlightAlgorithm) => {
    const next = clampHighlightAlgorithm(algorithm);
    setHighlightAlgorithm(next);
    if (algorithmWriteTimeoutRef.current) {
      window.clearTimeout(algorithmWriteTimeoutRef.current);
    }
    algorithmWriteTimeoutRef.current = window.setTimeout(() => {
      chrome.storage.sync.set({ [HIGHLIGHT_ALGORITHM_KEY]: next });
    }, 120);
  }, []);

  const handleImportanceThresholdChange = useCallback((value: number) => {
    const next = clampHighlightImportanceThreshold(value);
    setHighlightImportanceThreshold(next);
    if (importanceWriteTimeoutRef.current) {
      window.clearTimeout(importanceWriteTimeoutRef.current);
    }
    importanceWriteTimeoutRef.current = window.setTimeout(() => {
      chrome.storage.sync.set({ [HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY]: next });
    }, 120);
  }, []);

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

  useEffect(() => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    chrome.runtime.sendMessage(
      {
        type: "AuthStatusRequest",
        requestId: createRequestId("auth-status"),
      },
      (response: AuthStatusResult | undefined) => {
        const err = chrome.runtime.lastError;
        if (err) {
          setAuthState({ isLoading: false, isAuthenticated: false, expiresAt: null, error: err.message ?? "Unknown error" });
          return;
        }
        setAuthState({
          isLoading: false,
          isAuthenticated: Boolean(response?.isAuthenticated),
          expiresAt: response?.expiresAt ?? null,
          error: response?.error ?? null,
        });
      },
    );
  }, []);

  useEffect(() => {
    if (!authState.isAuthenticated) {
      setAccountState({ isLoading: false, profile: null, error: null });
      return;
    }
    void loadAccountProfile();
  }, [authState.isAuthenticated, loadAccountProfile]);

  const handleSignIn = useCallback(() => {
    chrome.tabs.create({ url: `${apiBase}/api/auth/signin` }, () => runtimeLastError("sp", "chrome.tabs.create sign-in"));
  }, [apiBase]);

  const handleReadPdf = useCallback(() => {
    chrome.tabs.create({ url: `${apiBase}/read-pdf` }, () => runtimeLastError("sp", "chrome.tabs.create read-pdf"));
  }, [apiBase]);

  const handleConnect = useCallback(() => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    chrome.runtime.sendMessage(
      {
        type: "AuthConnectRequest",
        requestId: createRequestId("auth-connect"),
      },
      (response: AuthStatusResult | undefined) => {
        const err = chrome.runtime.lastError;
        if (err) {
          setAuthState({ isLoading: false, isAuthenticated: false, expiresAt: null, error: err.message ?? "Unknown error" });
          return;
        }
        setAuthState({
          isLoading: false,
          isAuthenticated: Boolean(response?.isAuthenticated),
          expiresAt: response?.expiresAt ?? null,
          error: response?.error ?? null,
        });
      },
    );
  }, []);

  const handleDisconnect = useCallback(() => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));
    chrome.runtime.sendMessage(
      {
        type: "AuthClearRequest",
        requestId: createRequestId("auth-clear"),
      },
      (response: AuthStatusResult | undefined) => {
        const err = chrome.runtime.lastError;
        if (err) {
          setAuthState({ isLoading: false, isAuthenticated: false, expiresAt: null, error: err.message ?? "Unknown error" });
          return;
        }
        setAuthState({
          isLoading: false,
          isAuthenticated: Boolean(response?.isAuthenticated),
          expiresAt: response?.expiresAt ?? null,
          error: response?.error ?? null,
        });
      },
    );
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

        const highlights = buildHighlights(extract.text ?? "", highlightAlgorithm);
        const filteredHighlights =
          highlightAlgorithm === "new"
            ? highlights.filter((span) => (span.importance ?? DEFAULT_HIGHLIGHT_IMPORTANCE_THRESHOLD) >= highlightImportanceThreshold)
            : highlights;
        if (!filteredHighlights.length) {
          setHighlightState({ isLoading: false, error: "No highlight terms found.", count: null });
          return;
        }

        chrome.runtime.sendMessage({
          type: "ApplyHighlightsRequest",
          requestId: createRequestId("highlight-terms"),
          tabId: activeId,
          highlights: filteredHighlights,
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
  }, [getActiveTabId, highlightAlgorithm, highlightImportanceThreshold, requestExtract]);

  const handleKeyInfo = useCallback(() => {
    void (async () => {
      const activeId = await getActiveTabId();
      if (activeId === null) {
        setKeyInfoState({ isLoading: false, error: "No active tab." });
        return;
      }
      setTabId(activeId);
      if (!authState.isAuthenticated) {
        setKeyInfoState({ isLoading: false, error: "Sign in to use key info." });
        return;
      }

      setKeyInfoState({ isLoading: true, error: null });
      setKeyInfoResult("");

      try {
        const extract = await requestExtract(activeId);
        if (extract.error) {
          setKeyInfoState({ isLoading: false, error: extract.error });
          return;
        }
        const text = extract.text ?? "";
        if (!text.trim()) {
          setKeyInfoState({ isLoading: false, error: "No readable text found on this page." });
          return;
        }
        chrome.runtime.sendMessage({
          type: "LlmActionRequest",
          requestId: createRequestId("key-info"),
          tabId: activeId,
          action: "key_info",
          text,
        });
      } catch (err) {
        setKeyInfoState({
          isLoading: false,
          error: err instanceof Error ? err.message : "Unable to extract page text.",
        });
      }
    })();
  }, [authState.isAuthenticated, getActiveTabId, requestExtract]);

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
    <div className="assist-ext-shell">
      <header className="assist-ext-topbar">
        <div className="assist-ext-brand">
          <div className="assist-ext-brand-title">Clarity Companion</div>
          <div className="assist-ext-brand-subtitle">Reading simplifier with opt-in AI</div>
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
            className={`assist-ext-segment ${activePage === "account" ? "assist-ext-segment--active" : ""}`}
            onClick={() => setActivePage("account")}
            role="tab"
            aria-selected={activePage === "account"}
          >
            Account
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
              <button className="assist-ext-segment" onClick={handleKeyInfo} disabled={!authState.isAuthenticated}>
                {keyInfoState.isLoading ? "Extracting..." : "Extract key info"}
              </button>
              <button className="assist-ext-segment" onClick={handleReadPdf}>
                Read Files
              </button>
            </div>
            {error ? <div className="assist-ext-error">{error}</div> : null}
            {highlightState.error ? <div className="assist-ext-error">{highlightState.error}</div> : null}
            {highlightState.count !== null && !highlightState.error ? (
              <div className="assist-ext-status">Highlighted {highlightState.count} keyword matches.</div>
            ) : null}
            {highlightAlgorithm === "new" ? (
              <div className="assist-ext-field">
                <div className="assist-ext-field-row">
                  <div className="assist-ext-field-label">Highlight importance threshold</div>
                  <div className="assist-ext-field-value">{highlightImportanceThreshold}</div>
                </div>
                <input
                  className="assist-ext-range"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={highlightImportanceThreshold}
                  onChange={(event) => handleImportanceThresholdChange(Number(event.currentTarget.value))}
                  aria-label="Highlight importance threshold"
                />
                <div className="assist-ext-meta">Higher values highlight fewer, more salient terms.</div>
              </div>
            ) : (
              <div className="assist-ext-meta">Legacy highlighting is active; importance threshold is unavailable.</div>
            )}
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

          <section className="assist-ext-section">
            <div className="assist-ext-section-title">Key information</div>
            {keyInfoState.isLoading ? (
              <div className="assist-ext-status">Extracting key info...</div>
            ) : keyInfoPayload ? (
              <div className="assist-ext-callout">
                {["Important dates", "Things to do", "Things to know"].map((heading) => {
                  const items = Array.isArray((keyInfoPayload.sections as any)[heading])
                    ? ((keyInfoPayload.sections as any)[heading] as string[])
                    : [];
                  return (
                    <div key={heading} className="assist-ext-subsection">
                      <div className="assist-ext-section-title">{heading}</div>
                      <ul className="assist-ext-list">
                        {(items.length ? items : ["None"]).map((item, index) => (
                          <li key={`${heading}-${index}`} style={{ whiteSpace: "pre-wrap" }}>
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}

                {keyInfoPayload.events?.length ? (
                  <div className="assist-ext-subsection">
                    <div className="assist-ext-section-title">Add to calendar</div>
                    <ul className="assist-ext-list">
                      {keyInfoPayload.events
                        .filter((event) => typeof event?.calendarUrl === "string" && event.calendarUrl.length > 0)
                        .map((event, index) => (
                          <li key={`${event.title ?? "event"}-${index}`}>
                            <a href={event.calendarUrl as string} target="_blank" rel="noreferrer" className="assist-ext-link">
                              {event.title ?? "Open in Google Calendar"}
                            </a>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : keyInfoResult ? (
              <ul className="assist-ext-list">
                {keyInfoLines.map((line, index) => (
                  <li key={`${line}-${index}`} style={{ whiteSpace: "pre-wrap" }}>
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="assist-ext-status">Run the key info tool to see the most important points.</div>
            )}
            {keyInfoState.error ? <div className="assist-ext-error">{keyInfoState.error}</div> : null}
          </section>
        </>
      ) : (
        <section className="assist-ext-section">
          <div className="assist-ext-section-title">Account</div>
          <div className="assist-ext-row">
            <span className="assist-ext-status">
              {authState.isAuthenticated
                ? `Connected${authState.expiresAt ? ` (expires ${new Date(authState.expiresAt).toLocaleDateString()})` : ""}`
                : "Not connected (highlights only)."}
            </span>
            {authState.isAuthenticated ? (
              <button className="assist-ext-button assist-ext-button--danger" onClick={handleDisconnect} disabled={authState.isLoading}>
                Disconnect
              </button>
            ) : (
              <>
                <button className="assist-ext-button assist-ext-button--accent" onClick={handleSignIn} disabled={authState.isLoading}>
                  Sign in
                </button>
                <button className="assist-ext-button" onClick={handleConnect} disabled={authState.isLoading}>
                  Connect extension
                </button>
              </>
            )}
          </div>

          {authState.isAuthenticated ? (
            accountState.isLoading ? (
              <div className="assist-ext-status">Loading account details...</div>
            ) : accountState.profile ? (
              <div className="assist-ext-field">
                <div className="assist-ext-field-row">
                  <div className="assist-ext-field-label">Plan</div>
                  <div className="assist-ext-field-value">{accountState.profile.plan}</div>
                </div>
                <div className="assist-ext-field-row">
                  <div className="assist-ext-field-label">Monthly usage</div>
                  <div className="assist-ext-field-value">{accountState.profile.monthly_usage}</div>
                </div>
                <div className="assist-ext-field-row">
                  <div className="assist-ext-field-label">Limit</div>
                  <div className="assist-ext-field-value">{accountState.profile.monthly_limit}</div>
                </div>
              </div>
            ) : null
          ) : null}

          <div className="assist-ext-field">
            <div className="assist-ext-field-row">
              <div className="assist-ext-field-label">Keyword highlight algorithm</div>
              <div className="assist-ext-field-value">{highlightAlgorithm === "new" ? "New" : "Old"}</div>
            </div>
            <div className="assist-ext-segmented" role="group" aria-label="Keyword highlight algorithm">
              <button
                className={`assist-ext-segment ${highlightAlgorithm === "old" ? "assist-ext-segment--active" : ""}`}
                onClick={() => handleHighlightAlgorithmChange("old")}
              >
                Old (no slider)
              </button>
              <button
                className={`assist-ext-segment ${highlightAlgorithm === "new" ? "assist-ext-segment--active" : ""}`}
                onClick={() => handleHighlightAlgorithmChange("new")}
              >
                New (with slider)
              </button>
            </div>
            <div className="assist-ext-meta">
              Old uses legacy keyword spans. New uses POS-based importance scoring with a threshold slider.
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

          {authState.error ? <div className="assist-ext-error">{authState.error}</div> : null}
          {accountState.error ? <div className="assist-ext-error">{accountState.error}</div> : null}
        </section>
      )}

    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
