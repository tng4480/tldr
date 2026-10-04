import type { ParsedDocumentBase } from "@/lib/file/baseTypes";

export type PdfProcessingWarning = ParsedDocumentBase["warnings"][number] & {
  code: "NO_TEXT_LAYER" | "LOW_TEXT_DENSITY";
};

export type PdfTextItem = {
  pageIndex: number;
  itemIndex: number;
  text: string;
  globalStart: number;
  globalEnd: number;
  separator: string;
  viewportX: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  viewportFontSize: number;
  rawX: number;
  rawY: number;
  rawWidth: number;
  rawFontSize: number;
};

export type PdfPageData = {
  pageIndex: number;
  width: number;
  height: number;
  imageDataUrl: string;
  items: PdfTextItem[];
};

export type ParsedPdfDocument = ParsedDocumentBase & {
  fileType: "pdf";
  pages: PdfPageData[];
};

export type HighlightRect = {
  pageIndex: number;
  viewportX: number;
  viewportTop: number;
  viewportWidth: number;
  viewportHeight: number;
  rawX: number;
  rawY: number;
  rawWidth: number;
  rawHeight: number;
};
