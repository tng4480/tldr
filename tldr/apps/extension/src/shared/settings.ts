export const HIGHLIGHT_CONTRAST_KEY = "tldrHighlightContrast";
export const HIGHLIGHT_IMPORTANCE_THRESHOLD_KEY = "tldrHighlightImportanceThreshold";
export const HIGHLIGHT_ALGORITHM_KEY = "tldrHighlightAlgorithm";
export const EXTENSION_THEME_COLORS_KEY = "tldrExtensionThemeColors";

export const DEFAULT_HIGHLIGHT_CONTRAST = 100;
export const DEFAULT_HIGHLIGHT_IMPORTANCE_THRESHOLD = 60;
export const DEFAULT_HIGHLIGHT_ALGORITHM = "new" as const;
export const DEFAULT_EXTENSION_THEME_BASE_COLOR = "#58aedd";

export type ExtensionThemeColors = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  danger: string;
};

export type HighlightAlgorithm = "new" | "old";

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

export function clampHighlightAlgorithm(value: unknown): HighlightAlgorithm {
  return value === "old" ? "old" : DEFAULT_HIGHLIGHT_ALGORITHM;
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleaned = hex.replace("#", "");
  return {
    r: Number.parseInt(cleaned.slice(0, 2), 16),
    g: Number.parseInt(cleaned.slice(2, 4), 16),
    b: Number.parseInt(cleaned.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function mixHex(colorA: string, colorB: string, weightB: number): string {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  const t = Math.max(0, Math.min(1, weightB));
  return rgbToHex(a.r * (1 - t) + b.r * t, a.g * (1 - t) + b.g * t, a.b * (1 - t) + b.b * t);
}

export function normalizeExtensionThemeBaseColor(value: unknown): string {
  if (isHexColor(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    // Backward compatibility with previously stored object-based theme payload.
    const legacy = value as Partial<Record<keyof ExtensionThemeColors, unknown>>;
    if (isHexColor(legacy.accent)) {
      return legacy.accent;
    }
    if (isHexColor(legacy.bg)) {
      return legacy.bg;
    }
  }
  return DEFAULT_EXTENSION_THEME_BASE_COLOR;
}

export function deriveExtensionThemeColors(baseColor: string): ExtensionThemeColors {
  const base = normalizeExtensionThemeBaseColor(baseColor);
  return {
    bg: mixHex(base, "#050b14", 0.88),
    surface: mixHex(base, "#10253b", 0.72),
    border: mixHex(base, "#2f5271", 0.5),
    text: mixHex(base, "#f4f9ff", 0.9),
    muted: mixHex(base, "#b4c8de", 0.78),
    accent: base,
    danger: mixHex(base, "#ff7a7a", 0.7),
  };
}
