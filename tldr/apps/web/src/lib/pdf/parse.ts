import type { ParsedPdfDocument, PdfPageData, PdfTextItem, PdfProcessingWarning } from "./types";
import { loadPdfJsRuntime } from "./runtime";

const DEFAULT_SCALE = 1.35;

let cachedPdfJs: Promise<any> | null = null;

async function getPdfJs() {
  if (!cachedPdfJs) {
    cachedPdfJs = loadPdfJsRuntime();
  }
  return cachedPdfJs;
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer);
}

function toImageDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

function buildWarningSet(fullText: string, pages: PdfPageData[]): PdfProcessingWarning[] {
  const warnings: PdfProcessingWarning[] = [];
  const trimmed = fullText.trim();
  if (!trimmed.length) {
    warnings.push({
      code: "NO_TEXT_LAYER",
      message: "No selectable text was detected in this PDF. This is often a scanned file.",
    });
  } else if (trimmed.length < 120 || pages.some((page) => page.items.length === 0)) {
    warnings.push({
      code: "LOW_TEXT_DENSITY",
      message: "Limited selectable text was detected. Keyword bolding may be incomplete.",
    });
  }
  return warnings;
}

export async function parsePdfFile(file: File, scale = DEFAULT_SCALE): Promise<ParsedPdfDocument> {
  const pdfjs = await getPdfJs();
  const buffer = await file.arrayBuffer();
  const bytes = toUint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  const pages: PdfPageData[] = [];
  let fullText = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Unable to render PDF page.");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;

    const textContent = await page.getTextContent();
    const items: PdfTextItem[] = [];

    let itemCursor = fullText.length;
    const textItems = textContent.items as Array<{
      str?: string;
      width?: number;
      height?: number;
      transform?: number[];
      hasEOL?: boolean;
    }>;

    textItems.forEach((item, itemIndex) => {
      const text = (item.str ?? "").replace(/\u0000/g, "");
      if (!text) {
        return;
      }

      const rawTransform = item.transform ?? [1, 0, 0, 1, 0, 0];
      const transformed = pdfjs.Util.transform(viewport.transform, rawTransform) as number[];
      const viewportX = transformed[4] ?? 0;
      const viewportY = transformed[5] ?? 0;
      const viewportFontSize = Math.max(8, Math.hypot(transformed[2] ?? 0, transformed[3] ?? 0));
      const viewportWidth = Math.max(0, (item.width ?? 0) * scale);
      const viewportHeight = Math.max(0, Math.abs(item.height ?? viewportFontSize));
      const separator = item.hasEOL ? "\n" : " ";
      const globalStart = itemCursor;
      const globalEnd = globalStart + text.length;
      itemCursor = globalEnd + separator.length;

      items.push({
        pageIndex: pageNumber - 1,
        itemIndex,
        text,
        globalStart,
        globalEnd,
        separator,
        viewportX,
        viewportTop: viewportY - viewportFontSize,
        viewportWidth,
        viewportHeight,
        viewportFontSize,
        rawX: rawTransform[4] ?? 0,
        rawY: rawTransform[5] ?? 0,
        rawWidth: Math.max(0, item.width ?? 0),
        rawFontSize: Math.max(6, Math.hypot(rawTransform[2] ?? 0, rawTransform[3] ?? 0)),
      });

      fullText += text;
      fullText += separator;
    });

    pages.push({
      pageIndex: pageNumber - 1,
      width: viewport.width,
      height: viewport.height,
      imageDataUrl: toImageDataUrl(canvas),
      items,
    });
  }

  await pdf.destroy();

  const warnings = buildWarningSet(fullText, pages);
  return {
    fileName: file.name,
    bytes,
    fullText,
    pages,
    warnings,
  };
}
