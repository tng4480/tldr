import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  extractKeywords,
  fleschReadingEase,
  pickTopSentences,
  splitIntoSentences,
  wordCount,
} from "@tldr/core";
import type {
  ApplyHighlightsAck,
  ExtractResult,
  HighlightClicked,
  LlmActionResult,
} from "../shared/messages";
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
  const [text, setText] = useState<string>("");
  const [sentences, setSentences] = useState<string[]>([]);
  const [highlightCount, setHighlightCount] = useState<number>(0);
  const [clickedHighlight, setClickedHighlight] = useState<HighlightClicked | null>(null);
  const [llmResult, setLlmResult] = useState<LlmActionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const handler = (message: ExtractResult | ApplyHighlightsAck | HighlightClicked | LlmActionResult) => {
      if (!message?.type) {
        return;
      }
      log("sp", "onMessage", { type: message.type, tabId: (message as any).tabId, requestId: (message as any).requestId });
      if (message.type === "ExtractResult") {
        setError(message.error ?? null);
        setText(message.text);
        setSentences(message.sentences);
      }
      if (message.type === "ApplyHighlightsAck") {
        setError(message.error ?? null);
        setHighlightCount(message.count);
      }
      if (message.type === "HighlightClicked") {
        setError(null);
        setClickedHighlight(message);
        setLlmResult(null);
      }
      if (message.type === "LlmActionResult") {
        setIsLoading(false);
        setLlmResult(message);
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const stats = useMemo(() => {
    if (!text.trim()) {
      return null;
    }
    const summarySentences = splitIntoSentences(text);
    return {
      wordCount: wordCount(text),
      readability: fleschReadingEase(text),
      keywords: extractKeywords(text, 6),
      keySentences: pickTopSentences(summarySentences, 3),
    };
  }, [text]);

  const handleAnalyze = useCallback(() => {
    void (async () => {
      const activeId = await getActiveTabId();
      if (activeId === null) {
        setError("No active tab.");
        return;
      }
      setTabId(activeId);
      log("sp", "Analyze clicked", { tabId: activeId });
      chrome.runtime.sendMessage(
        {
          type: "ExtractRequest",
          requestId: createRequestId("extract"),
          tabId: activeId,
        },
        () => runtimeLastError("sp", "ExtractRequest sendMessage"),
      );
    })();
  }, [getActiveTabId]);

  const handleHighlight = useCallback(() => {
    void (async () => {
      const activeId = await getActiveTabId();
      if (activeId === null) {
        setError("No active tab.");
        return;
      }
      if (!text.trim()) {
        setError("Analyze the page first.");
        return;
      }
      setTabId(activeId);
      const top = pickTopSentences(sentences.length ? sentences : splitIntoSentences(text), 6);
      log("sp", "Highlight clicked", { tabId: activeId, sentences: top.length });
      chrome.runtime.sendMessage(
        {
          type: "ApplyHighlightsRequest",
          requestId: createRequestId("highlight"),
          tabId: activeId,
          sentences: top,
        },
        () => runtimeLastError("sp", "ApplyHighlightsRequest sendMessage"),
      );
    })();
  }, [getActiveTabId, text, sentences]);

  const handleAction = useCallback(
    (action: "simplify" | "explain") => {
      if (!tabId || !clickedHighlight) {
        return;
      }
      setIsLoading(true);
      log("sp", "LLM action clicked", { tabId, action, bytes: clickedHighlight.context?.length ?? 0 });
      chrome.runtime.sendMessage(
        {
          type: "LlmActionRequest",
          requestId: createRequestId(`llm-${action}`),
          tabId,
          action,
          text: clickedHighlight.context || clickedHighlight.sentence,
        },
        () => runtimeLastError("sp", "LlmActionRequest sendMessage"),
      );
    },
    [tabId, clickedHighlight],
  );

  return (
    <div style={panelStyles}>
      <div style={{ ...cardStyles, display: "flex", flexDirection: "column", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>TLDR Reading Assistant</h2>
        <p style={{ margin: 0, opacity: 0.7 }}>Analyze the current page and highlight key sentences.</p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleAnalyze}
            style={{ background: "#38bdf8", border: "none", color: "#0f172a", padding: "8px 12px", borderRadius: "8px" }}
          >
            Analyze page
          </button>
          <button
            onClick={handleHighlight}
            style={{ background: "#fbbf24", border: "none", color: "#0f172a", padding: "8px 12px", borderRadius: "8px" }}
          >
            Highlight key sentences
          </button>
        </div>
        {error ? <div style={{ color: "#fca5a5" }}>{error}</div> : null}
      </div>

      <div style={cardStyles}>
        <h3 style={{ marginTop: 0 }}>Page stats</h3>
        {stats ? (
          <div style={{ display: "grid", gap: "8px" }}>
            <div>Words: {stats.wordCount}</div>
            <div>Readability: {stats.readability}</div>
            <div>Keywords: {stats.keywords.join(", ")}</div>
            <div>Key sentences: {stats.keySentences.join(" ")}</div>
          </div>
        ) : (
          <div style={{ opacity: 0.7 }}>No page data yet.</div>
        )}
      </div>

      <div style={cardStyles}>
        <h3 style={{ marginTop: 0 }}>Highlights</h3>
        <div style={{ opacity: 0.7 }}>Highlighted sentences: {highlightCount}</div>
        {clickedHighlight ? (
          <div style={{ marginTop: "8px" }}>
            <div style={{ fontWeight: 600 }}>Last click</div>
            <div style={{ opacity: 0.9, marginTop: "4px" }}>{clickedHighlight.context}</div>
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
              <button
                onClick={() => handleAction("simplify")}
                style={{ background: "#22c55e", border: "none", color: "#0f172a", padding: "6px 10px", borderRadius: "6px" }}
              >
                Simplify
              </button>
              <button
                onClick={() => handleAction("explain")}
                style={{ background: "#60a5fa", border: "none", color: "#0f172a", padding: "6px 10px", borderRadius: "6px" }}
              >
                Explain
              </button>
            </div>
          </div>
        ) : (
          <div style={{ opacity: 0.7, marginTop: "8px" }}>Click a highlighted sentence to see actions.</div>
        )}
        {isLoading && <div style={{ marginTop: "8px" }}>Requesting LLM...</div>}
        {llmResult && (
          <div style={{ marginTop: "12px" }}>
            <div style={{ fontWeight: 600 }}>{llmResult.action === "simplify" ? "Simplified" : "Explanation"}</div>
            <div style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>{llmResult.result || llmResult.error}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
