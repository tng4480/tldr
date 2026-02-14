import type { RenderMode } from "@/lib/file/baseTypes";
import type { ParsedDocxDocument } from "./types";
import { loadMammothRuntime } from "./runtime";

function normalizeExtractedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function parseDocxFile(file: File, mode: RenderMode): Promise<ParsedDocxDocument> {
  const mammoth = await loadMammothRuntime();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const rawTextResult = await mammoth.extractRawText({ arrayBuffer: buffer });
  const rawText = typeof rawTextResult?.value === "string" ? rawTextResult.value : "";
  const extractedText = normalizeExtractedText(rawText);
  const warnings = (rawTextResult?.messages ?? [])
    .filter((item: any) => typeof item?.message === "string")
    .map((item: any) => ({
      code: `DOCX_${String(item.type ?? "INFO").toUpperCase()}`,
      message: String(item.message),
    }));

  let html: string | null = null;
  if (mode === "preserve_layout") {
    const htmlResult = await mammoth.convertToHtml(
      { arrayBuffer: buffer },
      {
        convertImage: mammoth.images.imgElement((image: any) =>
          image.read("base64").then((content: string) => ({
            src: `data:${image.contentType};base64,${content}`,
          })),
        ),
      },
    );
    html = typeof htmlResult?.value === "string" ? htmlResult.value : "";
    if (Array.isArray(htmlResult?.messages)) {
      htmlResult.messages
        .filter((item: any) => typeof item?.message === "string")
        .forEach((item: any) => {
          warnings.push({
            code: `DOCX_${String(item.type ?? "INFO").toUpperCase()}`,
            message: String(item.message),
          });
        });
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
