export type MammothMessage = {
  type?: string;
  message?: string;
};

export type MammothImage = {
  contentType?: string;
  read(format: "base64"): Promise<string>;
};

export type MammothRuntime = {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{
    value?: string;
    messages?: MammothMessage[];
  }>;
  convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options: {
      convertImage: (image: MammothImage) => Promise<{ src: string }>;
    },
  ): Promise<{
    value?: string;
    messages?: MammothMessage[];
  }>;
  images: {
    imgElement(
      resolver: (image: MammothImage) => Promise<{ src: string }>,
    ): (image: MammothImage) => Promise<{ src: string }>;
  };
};

declare global {
  interface Window {
    mammoth?: MammothRuntime;
  }
}

const scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const existing = scriptCache.get(src);
  if (existing) {
    return existing;
  }

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
  scriptCache.set(src, promise);
  return promise;
}

export async function loadMammothRuntime(): Promise<MammothRuntime> {
  if (!window.mammoth) {
    const candidates = [
      "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
      "https://unpkg.com/mammoth@1.8.0/mammoth.browser.min.js",
      "https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js",
      "https://unpkg.com/mammoth@1.7.2/mammoth.browser.min.js",
    ];
    let lastError: Error | null = null;
    for (const src of candidates) {
      try {
        await loadScript(src);
        if (window.mammoth) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (!window.mammoth && lastError) {
      throw lastError;
    }
  }

  if (!window.mammoth) {
    throw new Error("DOCX runtime is unavailable.");
  }
  return window.mammoth;
}
