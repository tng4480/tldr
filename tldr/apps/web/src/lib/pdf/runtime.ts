declare global {
  interface Window {
    pdfjsLib?: any;
    PDFLib?: any;
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

export async function loadPdfJsRuntime() {
  if (!window.pdfjsLib) {
    const candidates = [
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
      "https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
    ];
    let lastError: Error | null = null;
    for (const src of candidates) {
      try {
        await loadScript(src);
        if (window.pdfjsLib) {
          break;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (!window.pdfjsLib && lastError) {
      throw lastError;
    }
  }
  const pdfjs = window.pdfjsLib;
  if (!pdfjs) {
    throw new Error("PDF.js runtime is unavailable.");
  }
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  }
  return pdfjs;
}

export async function loadPdfLibRuntime() {
  if (!window.PDFLib) {
    await loadScript("https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js");
  }
  if (!window.PDFLib) {
    throw new Error("PDF-lib runtime is unavailable.");
  }
  return window.PDFLib;
}
