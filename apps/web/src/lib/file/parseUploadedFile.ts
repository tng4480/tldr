import { parseDocxFile } from "@/lib/docx/parseDocx";
import { parsePdfFile, parsePdfTextOnly } from "@/lib/pdf/parse";
import { parseTxtFile } from "@/lib/txt/parseTxt";
import type { ParsedDocument, RenderMode, SupportedFileType } from "./types";

function detectFileType(file: File): SupportedFileType | null {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    return "pdf";
  }
  if (lowerName.endsWith(".docx")) {
    return "docx";
  }
  if (lowerName.endsWith(".txt")) {
    return "txt";
  }
  return null;
}

export async function parseUploadedFile(file: File, mode: RenderMode): Promise<ParsedDocument> {
  const fileType = detectFileType(file);
  if (!fileType) {
    throw new Error("Unsupported file type. Please upload a PDF, DOCX, or TXT file.");
  }

  if (fileType === "pdf") {
    return mode === "preserve_layout" ? parsePdfFile(file) : parsePdfTextOnly(file);
  }

  if (fileType === "docx") {
    return parseDocxFile(file, "preserve_layout");
  }

  return parseTxtFile(file, "preserve_layout");
}
