import type {
  ApplyHighlightsAck,
  ApplyHighlightsRequest,
  ContentConnect,
  ContentReady,
  ExtractRequest,
  ExtractResult,
  HighlightClicked,
  LlmActionRequest,
  LlmActionResult,
  SidepanelConnect,
} from "../shared/messages";
import { error, log, runtimeLastError, warn } from "../shared/logger";

const tabState = new Map<number, { text?: string; lastHighlight?: HighlightClicked }>();
const readyTabs = new Set<number>();
const pendingByTab = new Map<
  number,
  {
    extract?: ExtractRequest;
    highlights?: ApplyHighlightsRequest;
  }
>();

function getApiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";
}

function resolveTabId(messageTabId: unknown, senderTabId: number | undefined): number | undefined {
  if (typeof messageTabId === "number" && Number.isFinite(messageTabId) && messageTabId >= 0) {
    return messageTabId;
  }
  return senderTabId;
}

function getContentScriptFilesFromManifest(): string[] {
  const manifest = chrome.runtime.getManifest();
  const js = manifest.content_scripts?.flatMap((script) => script.js ?? []) ?? [];
  return js.filter((file): file is string => typeof file === "string" && file.length > 0);
}

async function injectContentScript(tabId: number): Promise<boolean> {
  const files = getContentScriptFilesFromManifest();
  const first = files[0];
  if (!first) {
    warn("bg", "No content script file found in manifest content_scripts[].js");
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    log("bg", "Injecting content script", { tabId, file: first });
    chrome.scripting.executeScript({ target: { tabId }, files: [first] }, () => {
      const ok = !chrome.runtime.lastError;
      runtimeLastError("bg", "chrome.scripting.executeScript");
      log("bg", "Injection result", { tabId, ok });
      resolve(ok);
    });
  });
}

async function callLlm(request: LlmActionRequest): Promise<LlmActionResult> {
  const apiBase = getApiBase();
  const url =
    request.action === "key_info"
      ? `${apiBase}/api/whole-text`
      : `${apiBase}/api/simplify`;
  const body =
    request.action === "key_info"
      ? { text: request.text, mode: "key_info" }
      : request.action === "simplify"
        ? { text: request.text, readingLevel: "plain", tone: "preserve" }
        : { text: request.text, readingLevel: "plain", tone: "descriptive" };

  try {
    log("bg", "LLM request start", { tabId: request.tabId, action: request.action, url, bytes: request.text.length });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
    const data = await response.json();
    if (!response.ok) {
      warn("bg", "LLM request failed", { status: response.status, data });
      return {
        type: "LlmActionResult",
        requestId: request.requestId,
        tabId: request.tabId,
        action: request.action,
        result: "",
        error: data?.error ?? "LLM request failed",
      };
    }
    log("bg", "LLM request ok", { tabId: request.tabId, action: request.action });
    return {
      type: "LlmActionResult",
      requestId: request.requestId,
      tabId: request.tabId,
      action: request.action,
      result: data?.simplifiedText ?? data?.resultText ?? "",
    };
  } catch (error) {
    warn("bg", "LLM request threw", error);
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
  log("bg", "sendToTab", { tabId, type: message.type, requestId: message.requestId });
  // chrome.tabs.sendMessage(tabId, message, () => {
  //   const err = chrome.runtime.lastError;
  //   if (!err) {
  //     log("bg", "sendToTab ok", { tabId, type: message.type, requestId: message.requestId });
  //     return;
  //   }

  //   const msg = err.message || "Unable to reach content script on this page.";
  //   warn("bg", "sendToTab failed; reporting error to sidepanel", {
  //     tabId,
  //     type: message.type,
  //     requestId: message.requestId,
  //     error: msg,
  //   });
  //   if (message.type === "ExtractRequest") {
  //     broadcastToSidepanel({
  //       type: "ExtractResult",
  //       requestId: message.requestId,
  //       tabId,
  //       text: "",
  //       sentences: [],
  //       error: msg,
  //     });
  //     return;
  //   }

  //   if (message.type === "ApplyHighlightsRequest") {
  //     broadcastToSidepanel({
  //       type: "ApplyHighlightsAck",
  //       requestId: message.requestId,
  //       tabId,
  //       count: 0,
  //       error: msg,
  //     });
  //   }
  // });
  chrome.tabs.sendMessage(tabId, message);

}

function broadcastToSidepanel(message: ExtractResult | ApplyHighlightsAck | HighlightClicked | LlmActionResult) {
  log("bg", "broadcastToSidepanel", { type: message.type, tabId: message.tabId, requestId: message.requestId });
  // Fire-and-forget: the sidepanel does not call `sendResponse`, so using a callback here
  // produces noisy "message port closed before a response was received" warnings.
  chrome.runtime.sendMessage(message);
}

function markPending(tabId: number, message: ExtractRequest | ApplyHighlightsRequest) {
  const pending = pendingByTab.get(tabId) ?? {};
  if (message.type === "ExtractRequest") {
    pending.extract = message;
  } else {
    pending.highlights = message;
  }
  pendingByTab.set(tabId, pending);
}

function flushPending(tabId: number) {
  const pending = pendingByTab.get(tabId);
  if (!pending) {
    return;
  }
  pendingByTab.delete(tabId);

  if (pending.extract) {
    sendToTab(tabId, pending.extract);
  }
  if (pending.highlights) {
    sendToTab(tabId, pending.highlights);
  }
}

function resetTabReadiness(tabId: number) {
  readyTabs.delete(tabId);
  pendingByTab.delete(tabId);
}

// chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
//   // When a tab navigates, any existing content script is torn down. Treat the tab as not-ready
//   // until it sends ContentReady again for the new document.
//   if (changeInfo.status === "loading") {
//     resetTabReadiness(tabId);
//   }
// });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    // Real navigation to a new URL
    resetTabReadiness(tabId);
    log("bg", "Tab navigated, reset readiness", { tabId, url: changeInfo.url });
  }
});


chrome.tabs.onRemoved.addListener((tabId) => {
  resetTabReadiness(tabId);
  tabState.delete(tabId);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const typed = message as { type?: string };
  if (!typed?.type) {
    return;
  }

  log("bg", "onMessage", { type: typed.type, senderTabId: sender.tab?.id });

  if (typed.type === "SidepanelConnect") {
    const connect = message as SidepanelConnect;
    const resolvedTabId = resolveTabId(connect.tabId, sender.tab?.id);
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, tabState.get(resolvedTabId) ?? {});
    }
    log("bg", "SidepanelConnect", { resolvedTabId });
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ContentConnect") {
    const connect = message as ContentConnect;
    const resolvedTabId = resolveTabId(connect.tabId, sender.tab?.id);
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, tabState.get(resolvedTabId) ?? {});
    }
    log("bg", "ContentConnect", { resolvedTabId });
    sendResponse({ ok: true });
    return;
  }

  // if (typed.type === "ContentReady") {
  //   const ready = message as ContentReady;
  //   const resolvedTabId = resolveTabId(ready.tabId, sender.tab?.id);
  //   if (resolvedTabId !== undefined) {
  //     readyTabs.add(resolvedTabId);
  //     log("bg", "ContentReady", { tabId: resolvedTabId });
  //     flushPending(resolvedTabId);
  //   }
  //   sendResponse({ ok: true });
  //   return;
  // }

  if (typed.type === "ContentReady") {
    const tabId = sender.tab?.id;
    if (typeof tabId === "number") {
      readyTabs.add(tabId);
      log("bg", "ContentReady", { tabId });
      flushPending(tabId);
    } else {
      warn("bg", "ContentReady received without sender.tab.id");
    }
    sendResponse({ ok: true });
    return;
  }


  if (typed.type === "ExtractRequest") {
    const request = message as ExtractRequest;
    const resolvedTabId = resolveTabId(request.tabId, sender.tab?.id);
    if (resolvedTabId === undefined) {
      broadcastToSidepanel({
        type: "ExtractResult",
        requestId: request.requestId,
        tabId: request.tabId,
        text: "",
        sentences: [],
        error: "No active tab selected.",
      });
      sendResponse({ ok: false });
      return;
    }
    log("bg", "ExtractRequest", { tabId: resolvedTabId, requestId: request.requestId });

    const normalized = { ...request, tabId: resolvedTabId };
    if (!readyTabs.has(resolvedTabId)) {
      // Content script readiness is message-based; never send page requests until the tab reports ContentReady.
      markPending(resolvedTabId, normalized);
      void injectContentScript(resolvedTabId);
      sendResponse({ ok: true });
      return;
    }

    sendToTab(resolvedTabId, normalized);
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ApplyHighlightsRequest") {
    const request = message as ApplyHighlightsRequest;
    const resolvedTabId = resolveTabId(request.tabId, sender.tab?.id);
    if (resolvedTabId === undefined) {
      broadcastToSidepanel({
        type: "ApplyHighlightsAck",
        requestId: request.requestId,
        tabId: request.tabId,
        count: 0,
        error: "No active tab selected.",
      });
      sendResponse({ ok: false });
      return;
    }
    log("bg", "ApplyHighlightsRequest", {
      tabId: resolvedTabId,
      requestId: request.requestId,
      highlights: request.highlights?.length ?? 0,
      type: request.highlightType,
    });

    const normalized = { ...request, tabId: resolvedTabId };
    if (!readyTabs.has(resolvedTabId)) {
      markPending(resolvedTabId, normalized);
      void injectContentScript(resolvedTabId);
      sendResponse({ ok: true });
      return;
    }

    sendToTab(resolvedTabId, normalized);
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ExtractResult") {
    const result = message as ExtractResult;
    const resolvedTabId = resolveTabId(result.tabId, sender.tab?.id);
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, { ...tabState.get(resolvedTabId), text: result.text });
      broadcastToSidepanel({ ...result, tabId: resolvedTabId });
    }
    log("bg", "ExtractResult", {
      tabId: resolvedTabId,
      requestId: result.requestId,
      textLen: result.text?.length ?? 0,
      sentences: result.sentences?.length ?? 0,
      error: result.error,
    });
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ApplyHighlightsAck") {
    const ack = message as ApplyHighlightsAck;
    const resolvedTabId = resolveTabId(ack.tabId, sender.tab?.id);
    if (resolvedTabId !== undefined) {
      broadcastToSidepanel({ ...ack, tabId: resolvedTabId });
    }
    log("bg", "ApplyHighlightsAck", { tabId: resolvedTabId, requestId: ack.requestId, count: ack.count, error: ack.error });
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "HighlightClicked") {
    const clicked = message as HighlightClicked;
    const resolvedTabId = resolveTabId(clicked.tabId, sender.tab?.id);
    if (resolvedTabId !== undefined) {
      tabState.set(resolvedTabId, { ...tabState.get(resolvedTabId), lastHighlight: clicked });
      broadcastToSidepanel({ ...clicked, tabId: resolvedTabId });
    }
    log("bg", "HighlightClicked", { tabId: resolvedTabId, requestId: clicked.requestId });
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "LlmActionRequest") {
    const request = message as LlmActionRequest;
    log("bg", "LlmActionRequest", {
      tabId: request.tabId,
      requestId: request.requestId,
      action: request.action,
      bytes: request.text?.length ?? 0,
    });
    callLlm(request).then((result) => broadcastToSidepanel(result)).catch((e) => error("bg", "LLM call failed", e));
    sendResponse({ ok: true });
    return;
  }
});
