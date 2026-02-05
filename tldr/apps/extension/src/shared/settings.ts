export const HIGHLIGHT_CONTRAST_KEY = "tldrHighlightContrast";

export const DEFAULT_HIGHLIGHT_CONTRAST = 100;

export function clampHighlightContrast(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_HIGHLIGHT_CONTRAST;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

