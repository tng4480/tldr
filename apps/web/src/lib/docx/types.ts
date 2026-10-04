import type { ParsedDocumentBase } from "@/lib/file/baseTypes";

export type ParsedDocxDocument = ParsedDocumentBase & {
  fileType: "docx";
  html: string | null;
  rawText: string;
  extractedText: string;
  preservedText: string;
};
