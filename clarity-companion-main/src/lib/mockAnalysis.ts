import { AnalysisResult, AnalysedParagraph } from '@/types/reading';

const generateId = () => Math.random().toString(36).substring(2, 9);

// Simple readability analysis (Flesch-Kincaid inspired)
function analyseText(text: string): AnalysisResult {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const allSentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  
  // Simple keyword extraction (words > 6 chars, appearing multiple times)
  const wordFreq: Record<string, number> = {};
  words.forEach(w => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.length > 5) {
      wordFreq[clean] = (wordFreq[clean] || 0) + 1;
    }
  });
  
  const keywords = Object.entries(wordFreq)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);

  // Calculate difficulty based on average sentence length and word complexity
  const avgSentenceLength = words.length / Math.max(allSentences.length, 1);
  const complexWords = words.filter(w => w.length > 10).length;
  const complexityRatio = complexWords / Math.max(words.length, 1);
  
  const difficultyScore = Math.min(100, Math.round(
    (avgSentenceLength * 3) + (complexityRatio * 200)
  ));

  const difficulty: 'easy' | 'moderate' | 'hard' = 
    difficultyScore < 35 ? 'easy' : 
    difficultyScore < 60 ? 'moderate' : 'hard';

  // Analyse each paragraph
  const analysedParagraphs: AnalysedParagraph[] = paragraphs.map(p => {
    const pSentences = p.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const pWords = p.split(/\s+/).filter(w => w.length > 0);
    const avgLen = pWords.length / Math.max(pSentences.length, 1);
    
    const pKeywords = keywords.filter(kw => 
      p.toLowerCase().includes(kw)
    );

    return {
      id: generateId(),
      originalText: p.trim(),
      isHardSentence: avgLen > 20 || pWords.some(w => w.length > 12),
      keywords: pKeywords,
      isSimplifying: false,
      showSimplified: false,
    };
  });

  // Extract key sentences (longest sentences with keywords)
  const keySentences = allSentences
    .map(s => ({ text: s.trim(), score: s.split(/\s+/).length + (keywords.some(k => s.toLowerCase().includes(k)) ? 10 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => {
      const para = analysedParagraphs.find(p => p.originalText.includes(s.text));
      return { text: s.text, paragraphId: para?.id || '' };
    });

  return {
    paragraphs: analysedParagraphs,
    difficulty,
    difficultyScore,
    wordCount: words.length,
    sentenceCount: allSentences.length,
    readingTimeMinutes: Math.max(1, Math.round(words.length / 200)),
    keySentences,
    keywords,
  };
}

// Mock simplification (in real app, this would call an AI API)
async function simplifyParagraph(text: string): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Simple mock: shorten sentences and replace complex words
  const simplified = text
    .replace(/\b(utilise|utilize)\b/gi, 'use')
    .replace(/\b(implement)\b/gi, 'do')
    .replace(/\b(consequently)\b/gi, 'so')
    .replace(/\b(nevertheless)\b/gi, 'but')
    .replace(/\b(furthermore)\b/gi, 'also')
    .replace(/\b(approximately)\b/gi, 'about')
    .replace(/\b(demonstrate)\b/gi, 'show')
    .replace(/\b(endeavour)\b/gi, 'try')
    .replace(/\b(facilitate)\b/gi, 'help')
    .replace(/\b(subsequent)\b/gi, 'next');
  
  return simplified + " [Simplified]";
}

const SAMPLE_TEXT = `The implementation of comprehensive cognitive enhancement strategies represents a paradigm shift in contemporary educational methodologies. Consequently, educators must endeavour to facilitate more accessible learning experiences for students across diverse backgrounds.

Furthermore, the utilisation of advanced analytical frameworks demonstrates significant improvements in reading comprehension outcomes. Nevertheless, approximately 40% of learners continue to struggle with complex textual materials, particularly those containing domain-specific terminology.

Research indicates that subsequent exposure to simplified content, combined with strategic vocabulary acquisition techniques, substantially improves long-term retention. This multifaceted approach has been implemented across numerous educational institutions with remarkable success.

The fundamental principle underlying these methodologies is that comprehension difficulties often stem from unnecessarily complex sentence structures rather than conceptual complexity. By restructuring information presentation, educators can significantly enhance learning outcomes whilst maintaining intellectual rigour.`;

export { analyseText, simplifyParagraph, SAMPLE_TEXT };
