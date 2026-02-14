export type OcrPageInput = {
  pageIndex: number;
  imageDataUrl: string;
};

export interface OcrProvider {
  isAvailable(): boolean;
  run(page: OcrPageInput): Promise<string>;
}

class NoopOcrProvider implements OcrProvider {
  isAvailable(): boolean {
    return false;
  }

  async run(_page: OcrPageInput): Promise<string> {
    throw new Error("OCR provider is not configured.");
  }
}

export const ocrProvider: OcrProvider = new NoopOcrProvider();
