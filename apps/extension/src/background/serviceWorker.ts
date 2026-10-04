/// <reference types="vite/client" />

import type {
  ApplyHighlightsAck,
  ApplyHighlightsRequest,
  ApplyRsvpCursorRequest,
  ClearRsvpCursorRequest,
  ContentConnect,
  ExtractRequest,
  ExtractResult,
  HighlightClicked,
  SidepanelConnect,
  StartRsvpFromText,
} from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { log, runtimeLastError, warn } from "../shared/logger";

const RSVP_CONTEXT_MENU_ID = "tldr-start-rsvp-selection";

// Storage keys written by versions that had accounts and an update check. Removed on install/update.
const LEGACY_STORAGE_KEYS = ["extensionToken", "extensionUpdateNotice"];

const tabState = new Map<number, { text?: string; lastHighlight?: HighlightClicked }>();
const pendingRsvpStartByTab = new Map<number, StartRsvpFromText>();
let actionClickOpensPanel = false;

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

const SEND_TO_TAB_MAX_ATTEMPTS = 3;
const SEND_TO_TAB_RETRY_MS = 250;

/** Content script never calls sendResponse; it sends a separate message. So this error is expected and not a real failure. */
const MESSAGE_PORT_CLOSED = "The message port closed before a response was received.";

/** Chrome's error when no content script is listening in the tab (never injected, or the page predates the extension). */
const NO_RECEIVER = "Receiving end does not exist";
/** Time to let a freshly injected content script register its message listener. */
const INJECT_SETTLE_MS = 300;

type TabRequest = ApplyHighlightsRequest | ExtractRequest | ApplyRsvpCursorRequest | ClearRsvpCursorRequest;

/**
 * Delivers a request to the tab's content script.
 *
 * Deliberately does not depend on any in-memory "ready" state: the service worker is suspended after
 * ~30s idle and loses all memory, but the content script (loaded by the manifest on page load) is still
 * alive. We just try to send; only if nothing is listening do we inject once and try again.
 */
function sendToTab(tabId: number, message: TabRequest) {
  let attempt = 0;
  let injected = false;

  function fail(error: string) {
    warn("bg", "sendToTab failed", { tabId, type: message.type, requestId: message.requestId, error });
    if (message.type === "ExtractRequest") {
      broadcastToSidepanel({
        type: "ExtractResult",
        requestId: message.requestId,
        tabId,
        text: "",
        sentences: [],
        error,
      });
    } else if (message.type === "ApplyHighlightsRequest") {
      broadcastToSidepanel({
        type: "ApplyHighlightsAck",
        requestId: message.requestId,
        tabId,
        count: 0,
        error,
      });
    }
  }

  function trySend() {
    attempt += 1;
    log("bg", "sendToTab", { tabId, type: message.type, requestId: message.requestId, attempt });

    chrome.tabs.sendMessage(tabId, message, () => {
      const err = chrome.runtime.lastError;
      if (!err) {
        log("bg", "sendToTab ok", { tabId, type: message.type, requestId: message.requestId });
        return;
      }

      if (err.message === MESSAGE_PORT_CLOSED) {
        log("bg", "sendToTab port closed (expected; content script replies via separate message)", {
          tabId,
          type: message.type,
        });
        return;
      }

      if (!injected && (err.message ?? "").includes(NO_RECEIVER)) {
        // Nothing is listening: the page was open before the extension was installed/reloaded.
        injected = true;
        warn("bg", "No content script in tab; injecting", { tabId, type: message.type });
        void injectContentScript(tabId).then((ok) => {
          if (!ok) {
            fail("Unable to reach content script on this page.");
            return;
          }
          attempt = 0;
          setTimeout(trySend, INJECT_SETTLE_MS);
        });
        return;
      }

      if (attempt < SEND_TO_TAB_MAX_ATTEMPTS) {
        warn("bg", "sendToTab failed, retrying", {
          tabId,
          type: message.type,
          attempt,
          error: err.message,
        });
        setTimeout(trySend, SEND_TO_TAB_RETRY_MS);
        return;
      }

      fail(err.message || "Unable to reach content script on this page.");
    });
  }

  trySend();
}

function broadcastToSidepanel(message: ExtractResult | ApplyHighlightsAck | HighlightClicked) {
  log("bg", "broadcastToSidepanel", { type: message.type, tabId: message.tabId, requestId: message.requestId });
  // Fire-and-forget: the sidepanel does not call `sendResponse`, so using a callback here
  // produces noisy "message port closed before a response was received" warnings.
  chrome.runtime.sendMessage(message);
}

function trySendStartRsvp(message: StartRsvpFromText) {
  chrome.runtime.sendMessage(message, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      // No receiver yet (sidepanel unopened) or the message port is otherwise unavailable.
      log("bg", "StartRsvpFromText not delivered yet", { tabId: message.tabId, requestId: message.requestId, error: err.message });
      return;
    }
    pendingRsvpStartByTab.delete(message.tabId);
    log("bg", "StartRsvpFromText delivered", { tabId: message.tabId, requestId: message.requestId });
  });
}

function configureSidePanelActionClick() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    warn("bg", "chrome.sidePanel.setPanelBehavior is unavailable; using action.onClicked fallback");
    actionClickOpensPanel = false;
    return;
  }

  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }, () => {
    const err = chrome.runtime.lastError;
    if (err) {
      warn("bg", "setPanelBehavior failed; using action.onClicked fallback", { error: err.message });
      actionClickOpensPanel = false;
      return;
    }
    actionClickOpensPanel = true;
    log("bg", "Configured side panel to open on action click");
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
  pendingRsvpStartByTab.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelActionClick();
  chrome.storage.local.remove(LEGACY_STORAGE_KEYS, () => runtimeLastError("bg", "chrome.storage.local.remove legacy keys"));
  chrome.contextMenus.removeAll(() => {
    runtimeLastError("bg", "chrome.contextMenus.removeAll");
    chrome.contextMenus.create(
      {
        id: RSVP_CONTEXT_MENU_ID,
        title: "Start RSVP",
        contexts: ["selection"],
      },
      () => runtimeLastError("bg", "chrome.contextMenus.create"),
    );
  });
});

chrome.runtime.onStartup.addListener(() => {
  configureSidePanelActionClick();
});

// Configure immediately when the service worker is evaluated.
configureSidePanelActionClick();

chrome.action.onClicked.addListener((tab) => {
  // If openPanelOnActionClick is configured, Chrome will handle this click automatically.
  if (actionClickOpensPanel) {
    return;
  }

  const tabId = tab.id;
  if (typeof tabId !== "number") {
    warn("bg", "Action clicked without a tab id");
    return;
  }

  chrome.sidePanel.open({ tabId }, () => runtimeLastError("bg", "chrome.sidePanel.open (action click fallback)"));
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== RSVP_CONTEXT_MENU_ID) {
    return;
  }

  const tabId = tab?.id;
  if (typeof tabId !== "number") {
    warn("bg", "Start RSVP clicked without tabId");
    return;
  }

  const text = (info.selectionText ?? "").trim();
  if (!text) {
    return;
  }

  const message: StartRsvpFromText = {
    type: "StartRsvpFromText",
    requestId: createRequestId("rsvp-selection"),
    tabId,
    text,
    source: "selection",
  };

  pendingRsvpStartByTab.set(tabId, message);

  chrome.sidePanel.open({ tabId }, () => runtimeLastError("bg", "chrome.sidePanel.open"));
  trySendStartRsvp(message);
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
    if (resolvedTabId !== undefined) {
      const pending = pendingRsvpStartByTab.get(resolvedTabId);
      if (pending) {
        trySendStartRsvp(pending);
      }
    }
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

  if (typed.type === "ContentReady") {
    // Informational only: delivery never depends on this (see sendToTab).
    log("bg", "ContentReady", { tabId: sender.tab?.id });
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
    sendToTab(resolvedTabId, normalized);
    sendResponse({ ok: true });
    return;
  }

  if (typed.type === "ApplyRsvpCursorRequest" || typed.type === "ClearRsvpCursorRequest") {
    const request = message as ApplyRsvpCursorRequest | ClearRsvpCursorRequest;
    const resolvedTabId = resolveTabId(request.tabId, sender.tab?.id);
    if (resolvedTabId === undefined) {
      sendResponse({ ok: false });
      return;
    }

    log("bg", typed.type, { tabId: resolvedTabId, requestId: request.requestId });

    const normalized = { ...request, tabId: resolvedTabId };
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
});
