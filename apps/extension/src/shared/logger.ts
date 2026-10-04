import { EXTENSION_DEBUG } from "./config";

type LogArgs = unknown[];

export const DEBUG = EXTENSION_DEBUG;

function prefix(scope: string): string {
  return `[TLDR:${scope}]`;
}

export function log(scope: string, ...args: LogArgs) {
  if (!DEBUG) return;
  console.log(prefix(scope), ...args);
}

export function warn(scope: string, ...args: LogArgs) {
  if (!DEBUG) return;
  console.warn(prefix(scope), ...args);
}

export function error(scope: string, ...args: LogArgs) {
  if (!DEBUG) return;
  console.error(prefix(scope), ...args);
}

export function runtimeLastError(scope: string, label: string) {
  const err = chrome.runtime.lastError;
  if (!err) return;
  warn(scope, `${label}: chrome.runtime.lastError`, err.message);
}
