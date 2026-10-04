import type { HighlightSpan } from "@tldr/core";

export type MessageBase = {
  type: string;
  requestId: string;
  tabId?: number;
};

export type SidepanelConnect = MessageBase & {
  type: "SidepanelConnect";
  tabId: number;
};

export type ContentConnect = MessageBase & {
  type: "ContentConnect";
  tabId?: number;
};

export type ContentReady = MessageBase & {
  type: "ContentReady";
  tabId?: number;
};

export type ExtractRequest = MessageBase & {
  type: "ExtractRequest";
  tabId: number;
};

export type ExtractResult = MessageBase & {
  type: "ExtractResult";
  tabId: number;
  text: string;
  sentences: string[];
  error?: string;
  stats?: {
    wordCount: number;
    readability: number;
    keywords: string[];
    keySentences: string[];
  };
};

export type ApplyHighlightsRequest = MessageBase & {
  type: "ApplyHighlightsRequest";
  tabId: number;
  highlights: HighlightSpan[] | string[];
  highlightType: "sentences" | "keywords";
};

export type ApplyHighlightsAck = MessageBase & {
  type: "ApplyHighlightsAck";
  tabId: number;
  count: number;
  error?: string;
};

export type ApplyRsvpCursorRequest = MessageBase & {
  type: "ApplyRsvpCursorRequest";
  tabId: number;
  start: number;
  end: number;
  word?: string;
  scrollIntoView?: boolean;
};

export type ClearRsvpCursorRequest = MessageBase & {
  type: "ClearRsvpCursorRequest";
  tabId: number;
};

export type StartRsvpFromText = MessageBase & {
  type: "StartRsvpFromText";
  tabId: number;
  text: string;
  source: "selection";
};

export type HighlightClicked = MessageBase & {
  type: "HighlightClicked";
  tabId?: number;
  sentence: string;
  context: string;
};

export type ExtensionMessage =
  | SidepanelConnect
  | ContentConnect
  | ContentReady
  | ExtractRequest
  | ExtractResult
  | ApplyHighlightsRequest
  | ApplyHighlightsAck
  | ApplyRsvpCursorRequest
  | ClearRsvpCursorRequest
  | StartRsvpFromText
  | HighlightClicked;

export function createRequestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
