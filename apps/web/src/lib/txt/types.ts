import type { ParsedDocumentBase } from "@/lib/file/baseTypes";

export type ParsedTxtDocument = ParsedDocumentBase & {
  fileType: "txt";
  rawText: string;
  extractedText: string;
  preservedText: string;
};
