export const HIGHLIGHT_CONTRAST_KEY = "tldrHighlightContrast";
export const HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY = "tldrHighlightImportanceThreshold";

export const DEFAULT_HIGHLIGHT_CONTRAST = 100;
export const DEFAULT_HIGHLIGHT_IMPORTANCE_THRESHOLD = 60;

export function clampHighlightContrast(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_HIGHLIGHT_CONTRAST;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

export function clampHighlightImportanceThreshold(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_HIGHLIGHT_IMPORTANCE_THRESHOLD;
  }
  return Math.max(0, Math.min(100, Math.round(numeric)));
}
