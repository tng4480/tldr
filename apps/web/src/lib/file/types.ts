import type { ParsedDocxDocument } from "@/lib/docx/types";
import type { ParsedPdfDocument } from "@/lib/pdf/types";
import type { ParsedTxtDocument } from "@/lib/txt/types";

export type { FileProcessingWarning, ParsedDocumentBase, RenderMode, SupportedFileType } from "./baseTypes";

export type ParsedDocument = ParsedPdfDocument | ParsedDocxDocument | ParsedTxtDocument;
