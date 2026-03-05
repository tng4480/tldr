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
  AuthClearRequest,
  AuthConnectRequest,
  AuthSetTokenRequest,
  AuthStatusRequest,
  AuthStatusResult,
  LlmActionRequest,
  LlmActionResult,
  SidepanelConnect,
  StartRsvpFromText,
} from "../shared/messages";
import { createRequestId } from "../shared/messages";
import { getApiBase } from "../shared/config";
import { error, log, runtimeLastError, warn } from "../shared/logger";
import { isNewerVersion } from "../shared/version";

type StoredExtensionToken = {
  token: string;
  expiresAt: string;
};

const EXTENSION_UPDATE_NOTICE_KEY = "extensionUpdateNotice";

type ExtensionUpdateNotice = {
  latestVersion: string;
};

const tabState = new Map<number, { text?: string; lastHighlight?: HighlightClicked }>();
const readyTabs = new Set<number>();
const RSVP_CONTEXT_MENU_ID = "tldr-start-rsvp-selection";
const pendingRsvpStartByTab = new Map<number, StartRsvpFromText>();
let actionClickOpensPanel = false;
const pendingByTab = new Map<
  number,
  {
    extract?: ExtractRequest;
    highlights?: ApplyHighlightsRequest;
    cursor?: ApplyRsvpCursorRequest | ClearRsvpCursorRequest;
  }
>();

async function setExtensionUpdateNotice(notice: ExtensionUpdateNotice): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [EXTENSION_UPDATE_NOTICE_KEY]: notice }, () => resolve());
  });
}

async function clearExtensionUpdateNotice(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove([EXTENSION_UPDATE_NOTICE_KEY], () => resolve());
  });
}

async function checkForExtensionUpdate(): Promise<void> {
  let apiBase = "";
  try {
    apiBase = getApiBase();
  } catch {
    await clearExtensionUpdateNotice();
    return;
  }

  let response: Response;
  try {
    response = await fetch(`${apiBase}/api/extension/version`, {
      method: "GET",
      cache: "no-store",
    });
  } catch {
    await clearExtensionUpdateNotice();
    return;
  }

  if (!response.ok) {
    await clearExtensionUpdateNotice();
    return;
  }

  const data = (await response.json().catch(() => ({}))) as { version?: unknown };
  const latestVersion = typeof data.version === "string" ? data.version.trim() : "";
  if (!latestVersion) {
    await clearExtensionUpdateNotice();
    return;
  }

  const localVersion = chrome.runtime.getManifest().version;
  if (isNewerVersion(localVersion, latestVersion)) {
    await setExtensionUpdateNotice({ latestVersion });
    return;
  }

  await clearExtensionUpdateNotice();
}

async function getStoredToken(): Promise<StoredExtensionToken | null> {
  return await new Promise((resolve) => {
    chrome.storage.local.get(["extensionToken"], (result) => {
      const raw = (result as any)?.extensionToken as unknown;
      if (!raw || typeof raw !== "object") {
        resolve(null);
        return;
      }
      const token = (raw as any).token;
      const expiresAt = (raw as any).expiresAt;
      if (typeof token !== "string" || typeof expiresAt !== "string" || !token || !expiresAt) {
        resolve(null);
        return;
      }
      resolve({ token, expiresAt });
    });
  });
}

async function setStoredToken(value: StoredExtensionToken): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ extensionToken: value }, () => resolve());
  });
}

async function clearStoredToken(): Promise<void> {
  await new Promise<void>((resolve) => {
    chrome.storage.local.remove(["extensionToken"], () => resolve());
  });
}

function isTokenExpired(expiresAt: string): boolean {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) {
    return true;
  }
  return expiry <= Date.now() + 60_000;
}

async function fetchNewToken(): Promise<StoredExtensionToken | null> {
  try {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/extension/token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { token?: unknown; expiresAt?: unknown };
    if (typeof data?.token !== "string" || typeof data?.expiresAt !== "string") {
      return null;
    }
    return { token: data.token, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

type ManualTokenVerification =
  | { ok: true; token: StoredExtensionToken }
  | { ok: false; error: string };

async function verifyManualToken(rawToken: string): Promise<ManualTokenVerification> {
  try {
    const apiBase = getApiBase();
    const response = await fetch(`${apiBase}/api/extension/token/verify`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rawToken}`,
      },
    });
    const data = (await response.json().catch(() => ({}))) as {
      expiresAt?: unknown;
      error?: unknown;
    };

    if (!response.ok) {
      const message =
        typeof data.error === "string"
          ? data.error
          : "Token verification failed.";
      return { ok: false, error: message };
    }

    if (typeof data.expiresAt !== "string" || !data.expiresAt) {
      return { ok: false, error: "Token verification returned invalid expiry." };
    }

    return {
      ok: true,
      token: {
        token: rawToken,
        expiresAt: data.expiresAt,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Token verification failed.",
    };
  }
}

async function ensureExtensionToken(): Promise<StoredExtensionToken | null> {
  const existing = await getStoredToken();
  if (existing && !isTokenExpired(existing.expiresAt)) {
    return existing;
  }

  if (existing) {
    await clearStoredToken();
  }

  const fresh = await fetchNewToken();
  if (fresh) {
    await setStoredToken(fresh);
    return fresh;
  }

  return null;
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
  const token = await ensureExtensionToken();
  if (!token) {
    return {
      type: "LlmActionResult",
      requestId: request.requestId,
      tabId: request.tabId,
      action: request.action,
      result: "",
      error: "Sign in on the TLDR website to use summaries.",
    };
  }

  const body =
    request.action === "key_info"
      ? { text: request.text, mode: "key_info" }
      : request.action === "simplify"
        ? { text: request.text, readingLevel: "plain", tone: "preserve" }
        : { text: request.text, readingLevel: "plain", tone: "descriptive" };

  try {
    const apiBase = getApiBase();
    const url =
      request.action === "key_info"
        ? `${apiBase}/api/whole-text`
        : `${apiBase}/api/simplify`;
    log("bg", "LLM request start", { tabId: request.tabId, action: request.action, url, bytes: request.text.length });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.token}` },
      body: JSON.stringify(body),
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

const SEND_TO_TAB_MAX_ATTEMPTS = 3;
const SEND_TO_TAB_RETRY_MS = 250;

/** Content script never calls sendResponse; it sends a separate message. So this error is expected and not a real failure. */
const MESSAGE_PORT_CLOSED = "The message port closed before a response was received.";

function sendToTab(tabId: number, message: ApplyHighlightsRequest | ExtractRequest | ApplyRsvpCursorRequest | ClearRsvpCursorRequest) {
  let attempt = 0;

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

      const msg = err.message || "Unable to reach content script on this page.";
      warn("bg", "sendToTab failed after retries", {
        tabId,
        type: message.type,
        requestId: message.requestId,
        error: msg,
      });
      if (message.type === "ExtractRequest") {
        broadcastToSidepanel({
          type: "ExtractResult",
          requestId: message.requestId,
          tabId,
          text: "",
          sentences: [],
          error: msg,
        });
      } else if (message.type === "ApplyHighlightsRequest") {
        broadcastToSidepanel({
          type: "ApplyHighlightsAck",
          requestId: message.requestId,
          tabId,
          count: 0,
          error: msg,
        });
      }
    });
  }

  trySend();
}

function broadcastToSidepanel(message: ExtractResult | ApplyHighlightsAck | HighlightClicked | LlmActionResult) {
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

function markPending(
  tabId: number,
  message: ExtractRequest | ApplyHighlightsRequest | ApplyRsvpCursorRequest | ClearRsvpCursorRequest,
) {
  const pending = pendingByTab.get(tabId) ?? {};
  if (message.type === "ExtractRequest") {
    pending.extract = message;
  } else if (message.type === "ApplyHighlightsRequest") {
    pending.highlights = message;
  } else {
    pending.cursor = message;
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
  if (pending.cursor) {
    sendToTab(tabId, pending.cursor);
  }
}

function resetTabReadiness(tabId: number) {
  readyTabs.delete(tabId);
  pendingByTab.delete(tabId);
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
  pendingRsvpStartByTab.delete(tabId);
});

chrome.runtime.onInstalled.addListener(() => {
  configureSidePanelActionClick();
  void checkForExtensionUpdate();
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
  void checkForExtensionUpdate();
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

  if (typed.type === "AuthStatusRequest") {
    const request = message as AuthStatusRequest;
    getStoredToken()
      .then((stored) => {
        if (!stored || isTokenExpired(stored.expiresAt)) {
          if (stored) {
            return clearStoredToken().then(() => null);
          }
          return null;
        }
        return stored;
      })
      .then((stored) => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: Boolean(stored),
          expiresAt: stored?.expiresAt ?? null,
        } satisfies AuthStatusResult);
      })
      .catch((e) => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: false,
          expiresAt: null,
          error: e instanceof Error ? e.message : "Unknown error",
        } satisfies AuthStatusResult);
      });
    return true;
  }

  if (typed.type === "AuthConnectRequest") {
    const request = message as AuthConnectRequest;
    ensureExtensionToken()
      .then((token) => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: Boolean(token),
          expiresAt: token?.expiresAt ?? null,
          error: token ? undefined : "Not signed in.",
        } satisfies AuthStatusResult);
      })
      .catch((e) => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: false,
          expiresAt: null,
          error: e instanceof Error ? e.message : "Unknown error",
        } satisfies AuthStatusResult);
      });
    return true;
  }

  if (typed.type === "AuthSetTokenRequest") {
    const request = message as AuthSetTokenRequest;
    const rawToken = request.token.trim();

    if (!rawToken) {
      sendResponse({
        type: "AuthStatusResult",
        requestId: request.requestId,
        isAuthenticated: false,
        expiresAt: null,
        error: "Paste a token first.",
      } satisfies AuthStatusResult);
      return true;
    }

    verifyManualToken(rawToken)
      .then(async (result) => {
        if (!result.ok) {
          sendResponse({
            type: "AuthStatusResult",
            requestId: request.requestId,
            isAuthenticated: false,
            expiresAt: null,
            error: result.error,
          } satisfies AuthStatusResult);
          return;
        }

        await setStoredToken(result.token);
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: true,
          expiresAt: result.token.expiresAt,
        } satisfies AuthStatusResult);
      })
      .catch((e) => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: false,
          expiresAt: null,
          error: e instanceof Error ? e.message : "Unknown error",
        } satisfies AuthStatusResult);
      });
    return true;
  }

  if (typed.type === "AuthClearRequest") {
    const request = message as AuthClearRequest;
    clearStoredToken()
      .then(() => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: false,
          expiresAt: null,
        } satisfies AuthStatusResult);
      })
      .catch((e) => {
        sendResponse({
          type: "AuthStatusResult",
          requestId: request.requestId,
          isAuthenticated: false,
          expiresAt: null,
          error: e instanceof Error ? e.message : "Unknown error",
        } satisfies AuthStatusResult);
      });
    return true;
  }

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

  if (typed.type === "ApplyRsvpCursorRequest" || typed.type === "ClearRsvpCursorRequest") {
    const request = message as ApplyRsvpCursorRequest | ClearRsvpCursorRequest;
    const resolvedTabId = resolveTabId(request.tabId, sender.tab?.id);
    if (resolvedTabId === undefined) {
      sendResponse({ ok: false });
      return;
    }

    log("bg", typed.type, { tabId: resolvedTabId, requestId: (request as any).requestId });

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
