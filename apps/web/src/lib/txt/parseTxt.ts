import type { RenderMode } from "@/lib/file/baseTypes";
import type { ParsedTxtDocument } from "./types";

function normalizeExtractedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function parseTxtFile(file: File, mode: RenderMode): Promise<ParsedTxtDocument> {
  const rawText = await file.text();
  const extractedText = normalizeExtractedText(rawText);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fullText = mode === "preserve_layout" ? rawText : extractedText;

  return {
    fileName: file.name,
    fileType: "txt",
    mode,
    bytes,
    fullText,
    warnings: [],
    rawText,
    extractedText,
    preservedText: rawText,
  };
}
