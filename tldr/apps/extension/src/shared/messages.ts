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
  highlights: string[];
  highlightType: "sentences" | "keywords";
};

export type ApplyHighlightsAck = MessageBase & {
  type: "ApplyHighlightsAck";
  tabId: number;
  count: number;
  error?: string;
};

export type HighlightClicked = MessageBase & {
  type: "HighlightClicked";
  tabId?: number;
  sentence: string;
  context: string;
};

export type LlmActionRequest = MessageBase & {
  type: "LlmActionRequest";
  tabId: number;
  action: "simplify" | "explain" | "key_info";
  text: string;
  tone?: string;
};

export type LlmActionResult = MessageBase & {
  type: "LlmActionResult";
  tabId: number;
  action: "simplify" | "explain" | "key_info";
  result: string;
  error?: string;
};

export type ExtensionMessage =
  | SidepanelConnect
  | ContentConnect
  | ContentReady
  | ExtractRequest
  | ExtractResult
  | ApplyHighlightsRequest
  | ApplyHighlightsAck
  | HighlightClicked
  | LlmActionRequest
  | LlmActionResult;

export function createRequestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
