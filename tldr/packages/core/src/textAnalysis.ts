import winkNLP from "wink-nlp";
import model from "wink-eng-lite-web-model";

const nlp = winkNLP(model);
const its = nlp.its;

export type HighlightSpan = {
  text: string;
  start: number;
  end: number;
  importance?: number;
};

const NEGATION_WORDS = new Set([
  "no",
  "not",
  "never",
  "none",
  "neither",
  "nor",
  "nothing",
  "nobody",
  "nowhere",
  "without",
  "zero",
  "cannot",
  "can't",
  "cant",
  "don't",
  "dont",
  "doesn't",
  "doesnt",
  "didn't",
  "didnt",
  "won't",
  "wont",
  "isn't",
  "isnt",
  "aren't",
  "arent",
  "wasn't",
  "wasnt",
  "weren't",
  "werent",
  "shouldn't",
  "shouldnt",
  "couldn't",
  "couldnt",
  "wouldn't",
  "wouldnt",
]);

const NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
  "million",
  "billion",
  "trillion",
  "dozen",
  "half",
  "quarter",
]);

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

export function extractTopHighlightTerms(text: string, topWords = 12): string[] {
  /**
   * @deprecated Use extractKeywordHighlightSpans instead. This adapter now
   * returns phrases derived from keyword highlighting without TF-IDF scoring.
   */
  const spans = extractKeywordHighlightSpans(text);
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
  numberStart?: number;
  numberEnd?: number;
  isStopword: boolean;
  isNumber: boolean;
};

type HighlightCandidateKind = "noun_chunk" | "secondary_propn" | "secondary_numeric" | "secondary_adj" | "negation";

type HighlightCandidate = HighlightSpan & {
  hasProper: boolean;
  tokenCount: number;
  containsPropn: boolean;
  endsWithNoun: boolean;
  hasContiguousPropnPair: boolean;
  isNumericLike: boolean;
  hasUnitOrAdjacentNoun: boolean;
  isStandaloneAdj: boolean;
  isAdjectiveHeavy: boolean;
  kind: HighlightCandidateKind;
};

function scorePosOnlyCandidate(candidate: HighlightCandidate): number {
  let score = 40;

  if (candidate.kind === "noun_chunk") {
    if (candidate.containsPropn) {
      score = 92;
    } else if (candidate.isAdjectiveHeavy) {
      score = 74;
    } else if (candidate.endsWithNoun) {
      score = 82;
    } else {
      score = 74;
    }

    if (candidate.hasContiguousPropnPair) {
      score += 4;
    }
    if (candidate.endsWithNoun) {
      score += 3;
    }
    if (candidate.tokenCount > 4) {
      score -= 2 * (candidate.tokenCount - 4);
    }
  } else if (candidate.kind === "secondary_propn") {
    score = 70;
  } else if (candidate.kind === "secondary_numeric") {
    score = candidate.hasUnitOrAdjacentNoun ? 68 : 64;
  } else if (candidate.kind === "secondary_adj") {
    score = 52;
    if (candidate.isStandaloneAdj) {
      score -= 6;
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildTokenIndex(text: string): { tokens: TokenInfo[]; sentences: Array<[number, number]> } {
  const doc = nlp.readDoc(text);
  const tokens: TokenInfo[] = [];
  let cursor = 0;

  const getNumberSpan = (start: number, end: number): { numberStart: number; numberEnd: number } | null => {
    if (end <= start) {
      return null;
    }

    const raw = text.slice(start, end);
    const firstDigitOffset = raw.search(/\d/);
    if (firstDigitOffset < 0) {
      return null;
    }

    let numberStart = start + firstDigitOffset;
    if (numberStart > start) {
      const sign = text[numberStart - 1];
      if (sign === "-" || sign === "+") {
        numberStart -= 1;
      }
    }

    let lastDigitOffset = -1;
    for (let index = raw.length - 1; index >= 0; index -= 1) {
      if (/\d/.test(raw[index])) {
        lastDigitOffset = index;
        break;
      }
    }
    if (lastDigitOffset < 0) {
      return null;
    }

    const numberEnd = start + lastDigitOffset + 1;
    if (numberEnd <= numberStart) {
      return null;
    }

    const candidate = text.slice(numberStart, numberEnd);
    const normalized = candidate.replace(/^[+-]/, "").replace(/,/g, "");
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
      return null;
    }

    return { numberStart, numberEnd };
  };

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

    const numberSpan = getNumberSpan(start, end);

    tokens.push({
      value,
      normal,
      pos,
      type,
      start,
      end,
      numberStart: numberSpan?.numberStart,
      numberEnd: numberSpan?.numberEnd,
      isStopword: STOP_WORDS.has(normal),
      isNumber: numberSpan !== null,
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

function findTokenEndingBefore(tokens: TokenInfo[], position: number): TokenInfo | undefined {
  let low = 0;
  let high = tokens.length - 1;
  let resultIndex = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const tokenEnd = tokens[mid].end;
    if (tokenEnd <= position) {
      resultIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return resultIndex >= 0 ? tokens[resultIndex] : undefined;
}

function addLeadingNegations(
  text: string,
  tokens: TokenInfo[],
  candidates: HighlightCandidate[],
): HighlightCandidate[] {
  if (!candidates.length || !tokens.length) {
    return candidates;
  }

  const sorted = [...candidates].sort((a, b) => a.start - b.start);
  const hasCoverage = (start: number, end: number) =>
    sorted.some((chunk) => start >= chunk.start && end <= chunk.end);

  const seen = new Set<string>();
  const expanded: HighlightCandidate[] = [...candidates];

  for (const candidate of sorted) {
    const token = findTokenEndingBefore(tokens, candidate.start);
    if (!token) {
      continue;
    }
    if (token.type !== "word") {
      continue;
    }
    if (!NEGATION_WORDS.has(token.normal)) {
      continue;
    }
    if (hasCoverage(token.start, token.end)) {
      continue;
    }

    const gap = text.slice(token.end, candidate.start);
    if (gap.trim().length !== 0) {
      continue;
    }

    const key = `${token.start}-${token.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    expanded.push({
      text: text.slice(token.start, token.end),
      start: token.start,
      end: token.end,
      hasProper: false,
      tokenCount: 1,
      containsPropn: false,
      endsWithNoun: false,
      hasContiguousPropnPair: false,
      isNumericLike: false,
      hasUnitOrAdjacentNoun: false,
      isStandaloneAdj: false,
      isAdjectiveHeavy: false,
      kind: "negation",
    });
  }

  return expanded;
}

const UNIT_WORDS = new Set([
  "%",
  "b",
  "kb",
  "mb",
  "gb",
  "tb",
  "bps",
  "kbps",
  "mbps",
  "gbps",
  "ms",
  "s",
  "sec",
  "secs",
  "min",
  "mins",
  "h",
  "hr",
  "hrs",
  "d",
  "day",
  "days",
  "wk",
  "wks",
  "mo",
  "mos",
  "yr",
  "yrs",
  "g",
  "kg",
  "mg",
  "lb",
  "lbs",
  "oz",
  "m",
  "km",
  "cm",
  "mm",
  "ft",
  "in",
  "mi",
  "c",
  "f",
]);

const MAGNITUDE_SUFFIXES = new Set(["m", "k", "g", "t", "b", "\u03bc", "\u00b5", "u"]);

function trimSpanToAllowed(text: string, start: number, end: number, allowed: RegExp): [number, number] | null {
  let left = start;
  let right = end;

  while (left < right && !allowed.test(text[left])) {
    left += 1;
  }
  while (right > left && !allowed.test(text[right - 1])) {
    right -= 1;
  }

  return right > left ? [left, right] : null;
}

function isUnitLikeToken(token: TokenInfo): boolean {
  if (token.type !== "word") {
    return false;
  }
  const normalized = token.value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (UNIT_WORDS.has(normalized)) {
    return true;
  }
  if (normalized.length === 1 && MAGNITUDE_SUFFIXES.has(normalized)) {
    return true;
  }
  return false;
}

function isNumberWord(token: TokenInfo): boolean {
  if (token.type !== "word") {
    return false;
  }

  const normal = token.normal;
  if (NUMBER_WORDS.has(normal)) {
    return true;
  }

  if (normal.endsWith("s") && NUMBER_WORDS.has(normal.slice(0, -1))) {
    return true;
  }

  if (normal.includes("-")) {
    const parts = normal.split("-").filter(Boolean);
    if (!parts.length) {
      return false;
    }
    return parts.every((part) => NUMBER_WORDS.has(part) || (part.endsWith("s") && NUMBER_WORDS.has(part.slice(0, -1))));
  }

  return false;
}

function findPreviousWordToken(tokens: TokenInfo[], index: number): TokenInfo | null {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (tokens[cursor].type === "word") {
      return tokens[cursor];
    }
  }
  return null;
}

function findNextWordToken(tokens: TokenInfo[], index: number): TokenInfo | null {
  for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor].type === "word") {
      return tokens[cursor];
    }
  }
  return null;
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
function extractKeywordHighlightSpansInternal(text: string, includeImportance: boolean): HighlightSpan[] {
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
      const containsPropn = phraseTokens.some((token) => token.pos === "PROPN");
      const endsWithNoun = phraseTokens[phraseTokens.length - 1]?.pos === "NOUN";
      const hasContiguousPropnPair = phraseTokens.some(
        (token, tokenIndex) => token.pos === "PROPN" && phraseTokens[tokenIndex + 1]?.pos === "PROPN",
      );
      const adjectiveCount = phraseTokens.filter((token) => token.pos === "ADJ").length;
      const nominalCount = phraseTokens.filter((token) => token.pos === "NOUN" || token.pos === "PROPN").length;

      nounChunkCandidates.push({
        text: phrase,
        start,
        end,
        hasProper: containsPropn,
        tokenCount: phraseTokens.length,
        containsPropn,
        endsWithNoun,
        hasContiguousPropnPair,
        isNumericLike: false,
        hasUnitOrAdjacentNoun: false,
        isStandaloneAdj: false,
        isAdjectiveHeavy: adjectiveCount >= nominalCount,
        kind: "noun_chunk",
      });
      index = cursor - 1;
    }
  }

  const nounChunks = dedupeOverlappingSpans(nounChunkCandidates);

  const hasCoverage = (start: number, end: number) =>
    nounChunks.some((chunk) => start >= chunk.start && end <= chunk.end);

  const secondaryHighlights: HighlightCandidate[] = [];
  const seenSecondary = new Set<string>();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== "word" && !token.isNumber) {
      continue;
    }

    const isNumericLike = token.isNumber || isNumberWord(token);
    const shouldHighlightSecondary = isNumericLike || token.pos === "PROPN" || token.pos === "ADJ";
    if (!shouldHighlightSecondary) {
      continue;
    }
    const previousWord = findPreviousWordToken(tokens, index);
    const nextWord = findNextWordToken(tokens, index);
    const hasAdjacentNoun = previousWord?.pos === "NOUN" || nextWord?.pos === "NOUN";

    const spanStart = token.isNumber ? (token.numberStart ?? token.start) : token.start;
    const spanEnd = token.isNumber ? (token.numberEnd ?? token.end) : token.end;
    const trimmedSpan = token.isNumber
      ? trimSpanToAllowed(text, spanStart, spanEnd, /[\d.,+-]/)
      : trimSpanToAllowed(text, spanStart, spanEnd, /[\p{L}\p{N}%\u00b5\u03bc\u00b0']/u);
    if (!trimmedSpan) {
      continue;
    }

    const [highlightStart, highlightEnd] = trimmedSpan;
    if (hasCoverage(highlightStart, highlightEnd)) {
      continue;
    }

    const key = `${highlightStart}-${highlightEnd}`;
    if (seenSecondary.has(key)) {
      continue;
    }
    seenSecondary.add(key);
    const nextToken = tokens[index + 1];
    const hasImmediateUnit =
      Boolean(nextToken) && isUnitLikeToken(nextToken) && text.slice(token.end, nextToken.start).trim().length === 0;
    const hasUnitSuffix =
      token.isNumber &&
      (token.numberEnd ?? token.end) < token.end &&
      Boolean(trimSpanToAllowed(text, token.numberEnd ?? token.end, token.end, /[\p{L}%\u00b5\u03bc\u00b0]/u));
    const hasUnitOrAdjacentNoun = isNumericLike && (hasAdjacentNoun || hasImmediateUnit || hasUnitSuffix);

    secondaryHighlights.push({
      text: text.slice(highlightStart, highlightEnd),
      start: highlightStart,
      end: highlightEnd,
      hasProper: token.pos === "PROPN",
      tokenCount: 1,
      containsPropn: token.pos === "PROPN",
      endsWithNoun: false,
      hasContiguousPropnPair: false,
      isNumericLike,
      hasUnitOrAdjacentNoun,
      isStandaloneAdj: token.pos === "ADJ",
      isAdjectiveHeavy: false,
      kind: token.pos === "PROPN" ? "secondary_propn" : isNumericLike ? "secondary_numeric" : "secondary_adj",
    });

    if (!isNumericLike) {
      continue;
    }

    const next = tokens[index + 1];
    if (next && isUnitLikeToken(next)) {
      const gap = text.slice(token.end, next.start);
      if (gap.trim().length === 0) {
        const unitSpan = trimSpanToAllowed(text, next.start, next.end, /[\p{L}%\u00b5\u03bc\u00b0]/u);
        if (unitSpan) {
          const [unitStart, unitEnd] = unitSpan;
          if (!hasCoverage(unitStart, unitEnd)) {
            const unitKey = `${unitStart}-${unitEnd}`;
            if (!seenSecondary.has(unitKey)) {
              seenSecondary.add(unitKey);
              secondaryHighlights.push({
                text: text.slice(unitStart, unitEnd),
                start: unitStart,
                end: unitEnd,
                hasProper: false,
                tokenCount: 1,
                containsPropn: false,
                endsWithNoun: false,
                hasContiguousPropnPair: false,
                isNumericLike: true,
                hasUnitOrAdjacentNoun: true,
                isStandaloneAdj: false,
                isAdjectiveHeavy: false,
                kind: "secondary_numeric",
              });
            }
          }
        }
      }
    }

    if (token.isNumber && (token.numberEnd ?? token.end) < token.end) {
      const suffixStart = token.numberEnd ?? token.end;
      const suffixSpan = trimSpanToAllowed(text, suffixStart, token.end, /[\p{L}%\u00b5\u03bc\u00b0]/u);
      if (suffixSpan) {
        const [unitStart, unitEnd] = suffixSpan;
        const suffixText = text.slice(unitStart, unitEnd).trim().toLowerCase();
        if (suffixText.length > 0 && (UNIT_WORDS.has(suffixText) || MAGNITUDE_SUFFIXES.has(suffixText))) {
          if (!hasCoverage(unitStart, unitEnd)) {
            const unitKey = `${unitStart}-${unitEnd}`;
            if (!seenSecondary.has(unitKey)) {
              seenSecondary.add(unitKey);
              secondaryHighlights.push({
                text: text.slice(unitStart, unitEnd),
                start: unitStart,
                end: unitEnd,
                hasProper: false,
                tokenCount: 1,
                containsPropn: false,
                endsWithNoun: false,
                hasContiguousPropnPair: false,
                isNumericLike: true,
                hasUnitOrAdjacentNoun: true,
                isStandaloneAdj: false,
                isAdjectiveHeavy: false,
                kind: "secondary_numeric",
              });
            }
          }
        }
      }
    }
  }

  const expandedCandidates = addLeadingNegations(text, tokens, [...nounChunks, ...secondaryHighlights]);

  return expandedCandidates
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
    .map((candidate) =>
      includeImportance
        ? {
            text: candidate.text,
            start: candidate.start,
            end: candidate.end,
            importance: scorePosOnlyCandidate(candidate),
          }
        : {
            text: candidate.text,
            start: candidate.start,
            end: candidate.end,
          },
    );
}

export function extractLegacyKeywordHighlightSpans(text: string): HighlightSpan[] {
  return extractKeywordHighlightSpansInternal(text, false);
}

export function extractKeywordHighlightSpans(text: string): HighlightSpan[] {
  return extractKeywordHighlightSpansInternal(text, true);
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
