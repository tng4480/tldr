import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { HighlightSpan } from "@tldr/core";
import { computeSpacyStyleHighlights, extractDateHighlights } from "@tldr/core";
import type { ApplyHighlightsAck, AuthStatusResult, ExtractResult, LlmActionResult } from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { log, runtimeLastError, warn } from "../shared/logger";
import "./sidepanel.css";

function buildHighlights(text: string): HighlightSpan[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const highlightSpans = computeSpacyStyleHighlights(trimmed);
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

function App() {
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

  const [tabId, setTabId] = useState<number | null>(null);
  const [pageText, setPageText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
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
  const [keyInfoResult, setKeyInfoResult] = useState<string>("");

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

  const getActiveTabId = useCallback(async (): Promise<number | null> => {
    return await new Promise<number | null>((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs[0]?.id ?? null);
      });
    });
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
    const handler = (message: ExtractResult | ApplyHighlightsAck | LlmActionResult) => {
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
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const handleSignIn = useCallback(() => {
    chrome.tabs.create({ url: `${apiBase}/api/auth/signin` }, () => runtimeLastError("sp", "chrome.tabs.create sign-in"));
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

        const highlights = buildHighlights(extract.text ?? "");
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

  return (
    <div className="assist-ext-shell">
      <header className="assist-ext-header">
        <div>
          <h1 className="assist-ext-title">TLDR</h1>
          <p className="assist-ext-subtitle">Reading assistant</p>
        </div>
        <span className="assist-ext-pill">Side panel</span>
      </header>

      <section className="assist-ext-section">
        <div className="assist-ext-section-title">Connection</div>
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
        {authState.error ? <div className="assist-ext-error">{authState.error}</div> : null}
      </section>

      <section className="assist-ext-section">
        <div className="assist-ext-section-title">Actions</div>
        <div className="assist-ext-segmented" role="group" aria-label="Page actions">
          <button className="assist-ext-segment" onClick={handleHighlightKeywords}>
            {highlightState.isLoading ? "Highlighting…" : "Highlight keywords"}
          </button>
          <button className="assist-ext-segment" onClick={handleKeyInfo} disabled={!authState.isAuthenticated}>
            {keyInfoState.isLoading ? "Extracting…" : "Extract key info"}
          </button>
        </div>
        {error ? <div className="assist-ext-error">{error}</div> : null}
        {highlightState.error ? <div className="assist-ext-error">{highlightState.error}</div> : null}
        {highlightState.count !== null && !highlightState.error ? (
          <div className="assist-ext-status">Highlighted {highlightState.count} keyword matches.</div>
        ) : null}
      </section>

      <section className="assist-ext-section">
        <div className="assist-ext-section-title">Key information</div>
        {keyInfoState.isLoading ? (
          <div className="assist-ext-status">Extracting key info…</div>
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

    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
