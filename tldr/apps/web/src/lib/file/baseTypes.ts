export type SupportedFileType = "pdf" | "docx" | "txt";
export type RenderMode = "extract_text" | "preserve_layout";

export type FileProcessingWarning = {
  code: string;
  message: string;
};

export type ParsedDocumentBase = {
  fileName: string;
  fileType: SupportedFileType;
  mode: RenderMode;
  bytes: Uint8Array;
  fullText: string;
  warnings: FileProcessingWarning[];
};
