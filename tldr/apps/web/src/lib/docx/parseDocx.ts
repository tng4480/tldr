import type { RenderMode } from "@/lib/file/baseTypes";
import type { ParsedDocxDocument } from "./types";
import type { MammothMessage } from "./runtime";
import { loadMammothRuntime } from "./runtime";

function normalizeExtractedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function parseDocxFile(file: File, mode: RenderMode): Promise<ParsedDocxDocument> {
  const mammoth = await loadMammothRuntime();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const normalizeMessages = (messages: MammothMessage[]) =>
    messages
      .filter((item) => typeof item?.message === "string")
      .map((item) => ({
        code: `DOCX_${String(item.type ?? "INFO").toUpperCase()}`,
        message: String(item.message),
      }));

  const rawTextResult = await mammoth.extractRawText({ arrayBuffer: buffer });
  const rawText = typeof rawTextResult?.value === "string" ? rawTextResult.value : "";
  const extractedText = normalizeExtractedText(rawText);
  const warnings = normalizeMessages(rawTextResult?.messages ?? []);

  let html: string | null = null;
  if (mode === "preserve_layout") {
    const htmlResult = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      {
        convertImage: mammoth.images.imgElement((image) =>
          image.read("base64").then((content) => ({
            src: `data:${image.contentType};base64,${content}`,
          })),
        ),
      },
    );
    html = typeof htmlResult?.value === "string" ? htmlResult.value : "";
    if (Array.isArray(htmlResult?.messages)) {
      warnings.push(...normalizeMessages(htmlResult.messages));
    }
  }

  return {
    fileName: file.name,
    fileType: "docx",
    mode,
    bytes,
    fullText: mode === "preserve_layout" ? rawText : extractedText,
    warnings,
    html,
    rawText,
    extractedText,
    preservedText: rawText,
  };
}
