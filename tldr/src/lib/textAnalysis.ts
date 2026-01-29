import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

const nlp = winkNLP(model);
const its = nlp.its;

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
  "I"
]);

export function extractKeywords(text: string, topK = 6): string[] {
  const words = text
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
  if (!text.trim()) {
    return [];
  }

  const doc = nlp.readDoc(text);
  const sentences = doc.sentences();
  const sentenceCount = sentences.length();
  if (sentenceCount === 0) {
    return [];
  }

  const allWords: string[] = [];
  const documentFrequency = new Map<string, number>();

  sentences.each((sentence) => {
    const tokens = sentence.tokens().filter((token) => token.out(its.type) === "word");
    const normalizedWords = tokens
      .out(its.normal)
      .map((word) => word.toLowerCase())
      .filter((word) => word && !STOP_WORDS.has(word));

    if (!normalizedWords.length) {
      return;
    }

    allWords.push(...normalizedWords);
    const uniqueWords = new Set(normalizedWords);
    uniqueWords.forEach((word) => {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    });
  });

  if (!allWords.length) {
    return [];
  }

  const termFrequency = new Map<string, number>();
  allWords.forEach((word) => {
    termFrequency.set(word, (termFrequency.get(word) ?? 0) + 1);
  });

  const totalWords = allWords.length;
  const tfidf: Array<[string, number]> = [];

  termFrequency.forEach((count, word) => {
    const tf = count / totalWords;
    const docFreq = documentFrequency.get(word) ?? 0;
    const idf = Math.log((sentenceCount + 1) / (1 + docFreq)) + 1;
    tfidf.push([word, tf * idf]);
  });

  return tfidf
    .sort((a, b) => b[1] - a[1])
    .slice(0, topWords)
    .map(([word]) => word);
}

export async function computeStableHash(text: string): Promise<string> {
  if (typeof window === "undefined") {
    const { createHash } = await import("crypto");
    return createHash("sha256").update(text).digest("hex");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
