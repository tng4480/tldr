export interface AnalysedParagraph {
  id: string;
  originalText: string;
  simplifiedText?: string;
  isHardSentence: boolean;
  keywords: string[];
  isSimplifying: boolean;
  showSimplified: boolean;
}

export interface AnalysisResult {
  paragraphs: AnalysedParagraph[];
  difficulty: 'easy' | 'moderate' | 'hard';
  difficultyScore: number;
  wordCount: number;
  sentenceCount: number;
  readingTimeMinutes: number;
  keySentences: { text: string; paragraphId: string }[];
  keywords: string[];
}

export interface UserState {
  isSignedIn: boolean;
  email?: string;
  name?: string;
  trialDaysRemaining?: number;
  isTrialing: boolean;
  subscriptionStatus: 'none' | 'trialing' | 'active' | 'canceled' | 'past_due';
  plan: 'free' | 'starter' | 'pro';
  usageCount: number;
  usageLimit: number;
}

export type SubscriptionTier = 'free' | 'starter' | 'pro';
