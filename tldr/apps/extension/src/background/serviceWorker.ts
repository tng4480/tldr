import type {
  ApplyHighlightsAck,
  ApplyHighlightsRequest,
  ContentConnect,
  ExtractRequest,
  ExtractResult,
  HighlightClicked,
  LlmActionRequest,
  LlmActionResult,
  SidepanelConnect,
} from "../shared/messages";

const tabState = new Map<number, { text?: string; lastHighlight?: HighlightClicked }>();

function getApiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
}

async function callLlm(request: LlmActionRequest): Promise<LlmActionResult> {
  const apiBase = getApiBase();
  const url = request.action === "simplify" ? `${apiBase}/api/simplify` : `${apiBase}/api/simplify`;
  const body =
    request.action === "simplify"
      ? { text: request.text, readingLevel: "plain", tone: "preserve" }
      : { text: request.text, readingLevel: "plain", tone: "descriptive" };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok) {
      return {
        type: "LlmActionResult",
        requestId: request.requestId,
        tabId: request.tabId,
        action: request.action,
        result: "",
        error: data?.error ?? "LLM request failed",
      };
    }
    return {
      type: "LlmActionResult",
      requestId: request.requestId,
      tabId: request.tabId,
      action: request.action,
      result: data?.simplifiedText ?? data?.resultText ?? "",
    };
  } catch (error) {
    return {
      type: "LlmActionResult",
      requestId: request.requestId,
      tabId: request.tabId,
      action: request.action,
      result: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function sendToTab(tabId: number, message: ApplyHighlightsRequest | ExtractRequest) {
  chrome.tabs.sendMessage(tabId, message, () => {
    void chrome.runtime.lastError;
  });
}

function broadcastToSidepanel(message: ExtractResult | ApplyHighlightsAck | HighlightClicked | LlmActionResult) {
  chrome.runtime.sendMessage(message, () => {
    void chrome.runtime.lastError;
  });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const typed = message as { type?: string };
  if (!typed?.type) {
    return;
  }

  if (typed.type === "SidepanelConnect") {
    const connect = message as SidepanelConnect;
    const resolvedTabId = connect.tabId ?? sender.tab?.id;
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, tabState.get(resolvedTabId) ?? {});
    }
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ContentConnect") {
    const connect = message as ContentConnect;
    const resolvedTabId = connect.tabId ?? sender.tab?.id;
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, tabState.get(resolvedTabId) ?? {});
    }
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ExtractRequest") {
    const request = message as ExtractRequest;
    sendToTab(request.tabId, request);
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ApplyHighlightsRequest") {
    const request = message as ApplyHighlightsRequest;
    sendToTab(request.tabId, request);
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ExtractResult") {
    const result = message as ExtractResult;
    const resolvedTabId = result.tabId ?? sender.tab?.id;
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, { ...tabState.get(resolvedTabId), text: result.text });
      broadcastToSidepanel({ ...result, tabId: resolvedTabId });
    }
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ApplyHighlightsAck") {
    const ack = message as ApplyHighlightsAck;
    const resolvedTabId = ack.tabId ?? sender.tab?.id;
    if (resolvedTabId !== undefined) {
      broadcastToSidepanel({ ...ack, tabId: resolvedTabId });
    }
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "HighlightClicked") {
    const clicked = message as HighlightClicked;
    const resolvedTabId = clicked.tabId ?? sender.tab?.id;
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, { ...tabState.get(resolvedTabId), lastHighlight: clicked });
      broadcastToSidepanel({ ...clicked, tabId: resolvedTabId });
    }
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "LlmActionRequest") {
    const request = message as LlmActionRequest;
    callLlm(request).then((result) => broadcastToSidepanel(result));
    sendResponse({ ok: true });
    return;
  }
});
