import type { HighlightRect } from "./types";
import { loadPdfLibRuntime } from "./runtime";

function groupByPage(rects: HighlightRect[]): Map<number, HighlightRect[]> {
  const map = new Map<number, HighlightRect[]>();
  rects.forEach((rect) => {
    const list = map.get(rect.pageIndex) ?? [];
    list.push(rect);
    map.set(rect.pageIndex, list);
  });
  return map;
}

export async function exportHighlightedPdf(originalBytes: Uint8Array, rects: HighlightRect[]): Promise<Uint8Array> {
  const { PDFDocument, rgb } = await loadPdfLibRuntime();
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pageMap = groupByPage(rects);
  const pages: any[] = pdfDoc.getPages();

  pages.forEach((page: any, pageIndex: number) => {
    const pageRects = pageMap.get(pageIndex) ?? [];
    if (!pageRects.length) {
      return;
    }

    pageRects.forEach((rect) => {
      if (rect.rawWidth <= 0 || rect.rawHeight <= 0) {
        return;
      }
      page.drawRectangle({
        x: Math.max(0, rect.rawX),
        y: Math.max(0, rect.rawY),
        width: rect.rawWidth,
        height: rect.rawHeight,
        color: rgb(0.98, 0.73, 0.28),
        opacity: 0.35,
        borderWidth: 0,
      });
    });
  });

  const bytes = await pdfDoc.save();
  return bytes;
}

export async function exportPseudoBoldPdf(originalBytes: Uint8Array, rects: HighlightRect[]): Promise<Uint8Array> {
  // Backward-compatible alias while callers migrate to the explicit name.
  return exportHighlightedPdf(originalBytes, rects);
}
