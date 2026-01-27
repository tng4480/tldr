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

const STOP_WORDS = new Set([
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
