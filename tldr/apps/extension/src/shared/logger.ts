type LogArgs = unknown[];

// Keep this on for now so production builds of the unpacked extension still emit useful logs.
// If you want to gate it, we can wire this to chrome.storage/local settings or a Vite env var.
export const DEBUG = true;

function prefix(scope: string): string {
  return `[TLDR:${scope}]`;
}

export function log(scope: string, ...args: LogArgs) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(prefix(scope), ...args);
}

export function warn(scope: string, ...args: LogArgs) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.warn(prefix(scope), ...args);
}

export function error(scope: string, ...args: LogArgs) {
  if (!DEBUG) return;
  // eslint-disable-next-line no-console
  console.error(prefix(scope), ...args);
}

export function runtimeLastError(scope: string, label: string) {
  const err = chrome.runtime.lastError;
  if (!err) return;
  warn(scope, `${label}: chrome.runtime.lastError`, err.message);
}

