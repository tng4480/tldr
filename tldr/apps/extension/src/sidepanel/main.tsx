import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ExtractResult,
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
  const [firstSentence, setFirstSentence] = useState<string>("");
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
    // Temporarily keep the sidepanel focused on the "Analyze page" flow only.
    // Other flows (highlighting, click actions, LLM actions) are commented out below.
    const handler = (message: ExtractResult) => {
      if (!message?.type) {
        return;
      }
      log("sp", "onMessage", { type: message.type, tabId: (message as any).tabId, requestId: (message as any).requestId });
      if (message.type === "ExtractResult") {
        setIsLoading(false);
        setError(message.error ?? null);
        const first = message.sentences?.find((s) => s.trim().length > 0) ?? "";
        setFirstSentence(first);
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

  return (
    <div style={panelStyles}>
      <div style={{ ...cardStyles, display: "flex", flexDirection: "column", gap: "10px" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>TLDR Reading Assistant</h2>
        <p style={{ margin: 0, opacity: 0.7 }}>Analyze the current page and show the first sentence.</p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={handleAnalyze}
            style={{ background: "#38bdf8", border: "none", color: "#0f172a", padding: "8px 12px", borderRadius: "8px" }}
          >
            Analyze page
          </button>
        </div>
        {error ? <div style={{ color: "#fca5a5" }}>{error}</div> : null}
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
      </div>
    </div>
  );
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
