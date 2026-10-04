import type { HighlightSpan } from "@tldr/core";
import type { HighlightRect, PdfPageData } from "./types";

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): [number, number] | null {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? [start, end] : null;
}

export function mapSpansToHighlightRects(pages: PdfPageData[], spans: HighlightSpan[]): HighlightRect[] {
  if (!pages.length || !spans.length) {
    return [];
  }

  const rects: HighlightRect[] = [];
  const sortedSpans = [...spans].sort((a, b) => a.start - b.start);

  pages.forEach((page) => {
    page.items.forEach((item) => {
      const itemLength = item.text.length;
      if (!itemLength) {
        return;
      }

      const covered: Array<[number, number]> = [];
      sortedSpans.forEach((span) => {
        const match = overlap(item.globalStart, item.globalEnd, span.start, span.end);
        if (!match) {
          return;
        }
        const [matchStart, matchEnd] = match;
        const localStart = Math.max(0, matchStart - item.globalStart);
        const localEnd = Math.min(itemLength, matchEnd - item.globalStart);
        if (localEnd > localStart) {
          covered.push([localStart, localEnd]);
        }
      });

      const widthRatio = itemLength > 0 ? item.viewportWidth / itemLength : 0;
      const rawWidthRatio = itemLength > 0 ? item.rawWidth / itemLength : 0;
      const viewportHeight = Math.max(6, item.viewportHeight || item.viewportFontSize * 1.05);
      const rawHeight = Math.max(5, item.rawFontSize * 0.9);

      covered.forEach(([localStart, localEnd]) => {
        if (localEnd <= localStart) {
          return;
        }
        const slice = item.text.slice(localStart, localEnd);
        if (!slice.trim()) {
          return;
        }

        rects.push({
          pageIndex: page.pageIndex,
          viewportX: item.viewportX + widthRatio * localStart,
          viewportTop: item.viewportTop,
          viewportWidth: Math.max(0, widthRatio * (localEnd - localStart)),
          viewportHeight,
          rawX: item.rawX + rawWidthRatio * localStart,
          rawY: item.rawY - rawHeight * 0.25,
          rawWidth: Math.max(0, rawWidthRatio * (localEnd - localStart)),
          rawHeight,
        });
      });
    });
  });

  return rects;
}
