import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

const nlp = winkNLP(model);
const its = nlp.its;

export type HighlightSpan = {
  text: string;
  start: number;
  end: number;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function splitIntoSentences(text: string): string[] {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (!normalised) {
    return [];
  }
  return normalised
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function wordCount(text: string): number {
  const matches = text.trim().match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) {
    return 0;
  }
  const syllables = cleaned.match(/[aeiouy]+/g);
  const count = syllables ? syllables.length : 1;
  return Math.max(1, count);
}

export function fleschReadingEase(text: string): number {
  const sentences = splitIntoSentences(text);
  const words = text.match(/\b\w+\b/g) ?? [];
  const sentenceCount = Math.max(1, sentences.length);
  const wordTotal = Math.max(1, words.length);
  const syllableTotal = words.reduce((total, word) => total + countSyllables(word), 0);
  const score = 206.835 - 1.015 * (wordTotal / sentenceCount) - 84.6 * (syllableTotal / wordTotal);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

export const STOP_WORDS = new Set([
  "the",
  "and",
  "that",
  "with",
  "this",
  "from",
  "have",
  "they",
  "your",
  "about",
  "would",
  "there",
  "their",
  "what",
  "when",
  "which",
  "were",
  "will",
  "could",
  "should",
  "into",
  "than",
  "then",
  "them",
  "been",
  "because",
  "also",
  "over",
  "some",
  "such",
  "more",
  "most",
  "other",
  "these",
  "those",
  "just",
  "like",
  "you",
  "our",
  "for",
  "are",
  "not",
  "but",
  "was",
  "can",
  "use",
  "has",
  "to",
  "in",
  "of",
  "or",
  "a",
  "an",
  "is",
  "on",
  "as",
  "per",
  "we",
  "you",
  "I",
  "it",
  "be",
  "all",
  "must",
  "along","at", "out", "using", "if", "add"
]);

export function extractKeywords(text: string, topK = 6): string[] {
  const words =
    text
      .toLowerCase()
      .match(/\b[a-z][a-z\-']+\b/g)
      ?.filter((word) => !STOP_WORDS.has(word)) ?? [];

  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([word]) => word);
}

export function scoreSentences(sentences: string[], keywords: string[]): number[] {
  const keywordSet = new Set(keywords);
  return sentences.map((sentence) => {
    const words = sentence.toLowerCase().match(/\b[a-z][a-z\-']+\b/g) ?? [];
    const keywordHits = words.filter((word) => keywordSet.has(word)).length;
    const lengthScore = Math.min(words.length / 20, 1);
    return keywordHits * 2 + lengthScore;
  });
}

export function pickTopSentences(sentences: string[], topN = 3): string[] {
  if (!sentences.length) {
    return [];
  }
  const keywords = extractKeywords(sentences.join(" "), 8);
  const scores = scoreSentences(sentences, keywords);
  return sentences
    .map((sentence, index) => ({ sentence, score: scores[index] }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((item) => item.sentence);
}

export function detectHardSentences(sentences: string[]): boolean[] {
  return sentences.map((sentence) => {
    const words = sentence.match(/\b\w+\b/g) ?? [];
    const longSentence = words.length > 24;
    const rareWords = words.filter((word) => word.length > 10).length;
    return longSentence || rareWords >= 3;
  });
}

export function computeTfIdfHighlights(text: string, topWords = 12): string[] {
  /**
   * @deprecated Use computeSpacyStyleHighlights instead. This adapter now returns
   * phrases derived from spaCy-style highlighting without TF-IDF scoring.
   */
  const spans = computeSpacyStyleHighlights(text);
  if (!spans.length) {
    return [];
  }
  const phrases = spans.map((span) => span.text);
  if (!Number.isFinite(topWords) || topWords <= 0) {
    return phrases;
  }
  return phrases.slice(0, topWords);
}

type TokenInfo = {
  value: string;
  normal: string;
  pos: string;
  type: string;
  start: number;
  end: number;
  isStopword: boolean;
  isNumber: boolean;
};

type HighlightCandidate = HighlightSpan & { hasProper: boolean };

function buildTokenIndex(text: string): { tokens: TokenInfo[]; sentences: Array<[number, number]> } {
  const doc = nlp.readDoc(text);
  const tokens: TokenInfo[] = [];
  let cursor = 0;
  const isNumeric = (value: string) => /^[\d.,]+$/.test(value);

  doc.tokens().each((token: any) => {
    const value = String(token.out(its.value));
    const normal = String(token.out(its.normal)).toLowerCase();
    const pos = String(token.out(its.pos));
    const type = String(token.out(its.type));
    let start = text.indexOf(value, cursor);
    if (start === -1 && value) {
      start = text.indexOf(value.trim(), cursor);
    }
    if (start === -1) {
      start = cursor;
    }
    const end = Math.min(text.length, start + value.length);
    cursor = end;

    tokens.push({
      value,
      normal,
      pos,
      type,
      start,
      end,
      isStopword: STOP_WORDS.has(normal),
      isNumber: isNumeric(value),
    });
  });

  const sentences: Array<[number, number]> = [];
  doc.sentences().each((sentence: any) => {
    const span = sentence.out(its.span) as number[];
    if (!Array.isArray(span) || span.length < 2) {
      return;
    }
    sentences.push([span[0], span[1]]);
  });

  return { tokens, sentences };
}

function dedupeOverlappingSpans(candidates: HighlightCandidate[]): HighlightCandidate[] {
  const sorted = [...candidates].sort((a, b) => {
    if (a.start !== b.start) {
      return a.start - b.start;
    }
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) {
      return lengthDiff;
    }
    if (a.hasProper !== b.hasProper) {
      return a.hasProper ? -1 : 1;
    }
    return 0;
  });

  const deduped: HighlightCandidate[] = [];
  for (const candidate of sorted) {
    const last = deduped[deduped.length - 1];
    if (!last) {
      deduped.push(candidate);
      continue;
    }
    if (candidate.start >= last.end) {
      deduped.push(candidate);
      continue;
    }
    if (candidate.start === last.start && candidate.end > last.end) {
      deduped[deduped.length - 1] = candidate;
    }
  }
  return deduped;
}

/**
 * Approximate spaCy noun-chunk based highlighting using wink-nlp.
 * Note: wink-nlp lacks dependency parsing, so we approximate noun chunks with
 * (ADJ)* + (NOUN|PROPN)+ patterns confined to sentence boundaries.
 */
export function computeSpacyStyleHighlights(text: string): HighlightSpan[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const { tokens, sentences } = buildTokenIndex(text);
  if (!tokens.length || !sentences.length) {
    return [];
  }

  const nounChunkCandidates: HighlightCandidate[] = [];

  for (const [sentenceStart, sentenceEnd] of sentences) {
    const sentenceTokens = tokens
      .slice(sentenceStart, sentenceEnd + 1)
      .filter((token) => token.type === "word");

    for (let index = 0; index < sentenceTokens.length; index += 1) {
      let cursor = index;
      while (cursor < sentenceTokens.length && sentenceTokens[cursor].pos === "ADJ") {
        cursor += 1;
      }

      const nounStart = cursor;
      while (
        cursor < sentenceTokens.length &&
        (sentenceTokens[cursor].pos === "NOUN" || sentenceTokens[cursor].pos === "PROPN")
      ) {
        cursor += 1;
      }

      if (cursor === nounStart) {
        continue;
      }

      const phraseTokens = sentenceTokens.slice(index, cursor);
      const start = phraseTokens[0].start;
      const end = phraseTokens[phraseTokens.length - 1].end;
      const phrase = text.slice(start, end).trim();
      if (!phrase || phrase.length < 3) {
        index = cursor - 1;
        continue;
      }
      if (!phraseTokens.some((token) => !token.isStopword)) {
        index = cursor - 1;
        continue;
      }
      if (phraseTokens.every((token) => token.isNumber)) {
        index = cursor - 1;
        continue;
      }

      nounChunkCandidates.push({
        text: phrase,
        start,
        end,
        hasProper: phraseTokens.some((token) => token.pos === "PROPN"),
      });
      index = cursor - 1;
    }
  }

  const nounChunks = dedupeOverlappingSpans(nounChunkCandidates);

  const hasCoverage = (start: number, end: number) =>
    nounChunks.some((chunk) => start >= chunk.start && end <= chunk.end);

  const secondaryHighlights: HighlightCandidate[] = [];
  const seenSecondary = new Set<string>();
  tokens.forEach((token) => {
    if (token.type !== "word") {
      return;
    }
    if (token.pos !== "PROPN" && token.pos !== "ADJ") {
      return;
    }
    if (hasCoverage(token.start, token.end)) {
      return;
    }
    const key = `${token.start}-${token.end}`;
    if (seenSecondary.has(key)) {
      return;
    }
    seenSecondary.add(key);
    secondaryHighlights.push({
      text: text.slice(token.start, token.end),
      start: token.start,
      end: token.end,
      hasProper: token.pos === "PROPN",
    });
  });

  return [...nounChunks, ...secondaryHighlights]
    .sort((a, b) => {
      if (a.start !== b.start) {
        return a.start - b.start;
      }
      const lengthDiff = b.end - b.start - (a.end - a.start);
      if (lengthDiff !== 0) {
        return lengthDiff;
      }
      if (a.hasProper !== b.hasProper) {
        return a.hasProper ? -1 : 1;
      }
      return 0;
    })
    .map(({ text: spanText, start, end }) => ({ text: spanText, start, end }));
}

export function extractDateHighlights(text: string, maxMatches = 12): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const patterns = [
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,]+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/gi,
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/g,
    /\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b/g,
    /\b(?:mon|tue|tues|wed|thu|thur|fri|sat|sun)(?:day)?(?:,\s*)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s,]+\d{1,2}(?:st|nd|rd|th)?(?:,\s*\d{4})?\b/gi,
  ];

  const matches: Array<{ value: string; index: number }> = [];
  patterns.forEach((pattern) => {
    let match: RegExpExecArray | null = pattern.exec(trimmed);
    while (match) {
      matches.push({ value: match[0].trim(), index: match.index });
      match = pattern.exec(trimmed);
    }
    pattern.lastIndex = 0;
  });

  const seen = new Set<string>();
  return matches
    .sort((a, b) => a.index - b.index)
    .map((match) => match.value)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, maxMatches);
}

type SentenceVector = Map<string, number>;

function buildSentenceVectors(text: string): { sentences: string[]; vectors: SentenceVector[] } {
  const doc = nlp.readDoc(text);
  const sentences = doc.sentences();
  const sentenceCount = sentences.length();
  if (sentenceCount === 0) {
    return { sentences: [], vectors: [] };
  }

  const sentenceTokens: string[][] = [];
  const documentFrequency = new Map<string, number>();

  sentences.each((sentence: any) => {
    const tokens = sentence.tokens().filter((token: any) => token.out(its.type) === "word");
    const normalizedWords = toStringArray(tokens.out(its.normal))
      .map((word) => word.toLowerCase())
      .filter((word) => word && !STOP_WORDS.has(word));
    sentenceTokens.push(normalizedWords);

    const uniqueWords = new Set(normalizedWords);
    uniqueWords.forEach((word) => {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    });
  });

  const idf = new Map<string, number>();
  documentFrequency.forEach((count, word) => {
    idf.set(word, Math.log((sentenceCount + 1) / (1 + count)) + 1);
  });

  const vectors = sentenceTokens.map((words) => {
    const vector = new Map<string, number>();
    if (!words.length) {
      return vector;
    }
    const counts = new Map<string, number>();
    words.forEach((word) => {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    });
    const totalWords = words.length;
    counts.forEach((count, word) => {
      const tf = count / totalWords;
      const weight = tf * (idf.get(word) ?? 0);
      if (weight > 0) {
        vector.set(word, weight);
      }
    });
    return vector;
  });

  const sentenceTexts = toStringArray(sentences.out(its.value))
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return { sentences: sentenceTexts, vectors };
}

function cosineSimilarity(first: SentenceVector, second: SentenceVector): number {
  if (!first.size || !second.size) {
    return 0;
  }
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  first.forEach((value, key) => {
    magnitudeA += value * value;
    if (second.has(key)) {
      dotProduct += value * (second.get(key) ?? 0);
    }
  });
  second.forEach((value) => {
    magnitudeB += value * value;
  });

  const denominator = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (!denominator) {
    return 0;
  }
  return dotProduct / denominator;
}

export function segmentTextIntoSubsections(
  text: string,
  {
    minSentences = 2,
    maxSentences = 5,
    similarityThreshold = 0.2,
  }: { minSentences?: number; maxSentences?: number; similarityThreshold?: number } = {},
): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  const { sentences, vectors } = buildSentenceVectors(trimmed);
  if (!sentences.length) {
    return [];
  }
  if (sentences.length === 1) {
    return [sentences[0]];
  }

  const sections: string[] = [];
  let current: string[] = [sentences[0]];

  for (let index = 1; index < sentences.length; index += 1) {
    const similarity = cosineSimilarity(vectors[index - 1], vectors[index]);
    const hasMinimum = current.length >= minSentences;
    const reachedMax = current.length >= maxSentences;

    if (reachedMax || (hasMinimum && similarity < similarityThreshold)) {
      sections.push(current.join(" ").trim());
      current = [sentences[index]];
    } else {
      current.push(sentences[index]);
    }
  }

  if (current.length) {
    sections.push(current.join(" ").trim());
  }

  return sections.filter(Boolean);
}

export async function computeStableHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto is unavailable in this environment.");
  }
  const hashBuffer = await subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
