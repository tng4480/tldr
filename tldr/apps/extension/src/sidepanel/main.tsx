import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { computeTfIdfHighlights } from "@tldr/core";
import type { ApplyHighlightsAck, ExtractResult, LlmActionResult } from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { log, runtimeLastError, warn } from "../shared/logger";

const panelStyles: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  padding: "16px",
};

const cardStyles: React.CSSProperties = {
  background: "#111827",
  borderRadius: "12px",
  padding: "14px",
  border: "1px solid rgba(148, 163, 184, 0.2)",
};

function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [firstSentence, setFirstSentence] = useState<string>("");
  const [pageText, setPageText] = useState<string>("");
  const [sentences, setSentences] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const highlightTerms = useMemo(() => computeTfIdfHighlights(pageText, 14), [pageText]);
  const keyInfoLines = useMemo(
    () =>
      keyInfoResult
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [keyInfoResult],
  );

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
    // Temporarily keep the sidepanel focused on the "Analyze page" flow only.
    // Other flows (highlighting, click actions, LLM actions) are commented out below.
    const handler = (message: ExtractResult | ApplyHighlightsAck | LlmActionResult) => {
      if (!message?.type) {
        return;
      }
      log("sp", "onMessage", { type: message.type, tabId: (message as any).tabId, requestId: (message as any).requestId });
      if (message.type === "ExtractResult") {
        setIsLoading(false);
        setError(message.error ?? null);
        const first = message.sentences?.find((s) => s.trim().length > 0) ?? "";
        setFirstSentence(first);
        setPageText(message.text ?? "");
        setSentences(message.sentences ?? []);
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

  const handleAnalyze = useCallback(() => {
    void (async () => {
      const activeId = await getActiveTabId();
      if (activeId === null) {
        setError("No active tab.");
        return;
      }
      setTabId(activeId);
      setIsLoading(true);
      setError(null);
      setFirstSentence("");
      setPageText("");
      setSentences([]);
      setHighlightState({ isLoading: false, error: null, count: null });
      setKeyInfoState({ isLoading: false, error: null });
      setKeyInfoResult("");
      log("sp", "Analyze clicked", { tabId: activeId });
      // chrome.runtime.sendMessage(
      //   {
      //     type: "ExtractRequest",
      //     requestId: createRequestId("extract"),
      //     tabId: activeId,
      //   },
      //   () => runtimeLastError("sp", "ExtractRequest sendMessage"),
      // );
      chrome.runtime.sendMessage({
        type: "ExtractRequest",
        requestId: createRequestId("extract"),
        tabId: activeId,
      });
    })();
  }, [getActiveTabId]);

  const handleHighlightKeywords = useCallback(() => {
    if (!tabId) {
      setHighlightState({ isLoading: false, error: "No active tab.", count: null });
      return;
    }
    if (!pageText.trim()) {
      setHighlightState({ isLoading: false, error: "Analyze the page first.", count: null });
      return;
    }
    if (!highlightTerms.length) {
      setHighlightState({ isLoading: false, error: "No highlight terms found.", count: null });
      return;
    }
    setHighlightState({ isLoading: true, error: null, count: null });
    chrome.runtime.sendMessage({
      type: "ApplyHighlightsRequest",
      requestId: createRequestId("highlight-terms"),
      tabId,
      highlights: highlightTerms,
      highlightType: "keywords",
    });
  }, [highlightTerms, pageText, tabId]);

  const handleKeyInfo = useCallback(() => {
    if (!tabId) {
      setKeyInfoState({ isLoading: false, error: "No active tab." });
      return;
    }
    if (!pageText.trim()) {
      setKeyInfoState({ isLoading: false, error: "Analyze the page first." });
      return;
    }
    setKeyInfoState({ isLoading: true, error: null });
    setKeyInfoResult("");
    chrome.runtime.sendMessage({
      type: "LlmActionRequest",
      requestId: createRequestId("key-info"),
      tabId,
      action: "key_info",
      text: pageText,
    });
  }, [pageText, tabId]);

  return (
    <div style={panelStyles}>
      <div style={{ ...cardStyles, display: "flex", flexDirection: "column", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>TLDR Reading Assistant</h2>
        <p style={{ margin: 0, opacity: 0.7 }}>Analyze the current page, highlight keywords, or extract key info.</p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={handleAnalyze}
            style={{ background: "#38bdf8", border: "none", color: "#0f172a", padding: "8px 12px", borderRadius: "8px" }}
          >
            Analyze page
          </button>
          <button
            onClick={handleHighlightKeywords}
            style={{ background: "#fbbf24", border: "none", color: "#111827", padding: "8px 12px", borderRadius: "8px" }}
          >
            {highlightState.isLoading ? "Highlighting…" : "Highlight keywords"}
          </button>
          <button
            onClick={handleKeyInfo}
            style={{ background: "#a78bfa", border: "none", color: "#111827", padding: "8px 12px", borderRadius: "8px" }}
          >
            {keyInfoState.isLoading ? "Extracting…" : "Extract key info"}
          </button>
        </div>
        {error ? <div style={{ color: "#fca5a5" }}>{error}</div> : null}
        {highlightState.error ? <div style={{ color: "#fca5a5" }}>{highlightState.error}</div> : null}
        {highlightState.count !== null && !highlightState.error ? (
          <div style={{ color: "#fcd34d" }}>Highlighted {highlightState.count} keyword matches.</div>
        ) : null}
      </div>

      <div style={cardStyles}>
        <h3 style={{ marginTop: 0 }}>Key information</h3>
        {keyInfoState.isLoading ? (
          <div style={{ opacity: 0.7 }}>Extracting key info…</div>
        ) : keyInfoResult ? (
          <ul style={{ paddingLeft: "16px", margin: 0 }}>
            {keyInfoLines.map((line, index) => (
              <li key={`${line}-${index}`} style={{ marginBottom: "6px", whiteSpace: "pre-wrap" }}>
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <div style={{ opacity: 0.7 }}>Run the key info tool to see the most important points.</div>
        )}
        {keyInfoState.error ? <div style={{ color: "#fca5a5", marginTop: "8px" }}>{keyInfoState.error}</div> : null}
      </div>

      <div style={cardStyles}>
        <h3 style={{ marginTop: 0 }}>Page data</h3>
        {isLoading ? (
          <div style={{ opacity: 0.7 }}>Analyzing…</div>
        ) : firstSentence ? (
          <div style={{ whiteSpace: "pre-wrap" }}>{firstSentence}</div>
        ) : (
          <div style={{ opacity: 0.7 }}>No page data yet.</div>
        )}
        {sentences.length ? (
          <div style={{ marginTop: "10px", opacity: 0.6, fontSize: "12px" }}>
            {sentences.length} sentences detected.
          </div>
        ) : null}
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
