export function getApiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3000";
  }
  throw new Error("VITE_API_BASE_URL is required for production builds.");
}

export const EXTENSION_DEBUG =
  import.meta.env.DEV || import.meta.env.VITE_EXTENSION_DEBUG === "true";
