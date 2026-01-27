import { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from '@/components/layout/Header';
import { TextInput } from '@/components/demo/TextInput';
import { ParagraphCard } from '@/components/demo/ParagraphCard';
import { AnalysisPanel } from '@/components/demo/AnalysisPanel';
import { SignInModal } from '@/components/demo/SignInModal';
import { Button } from '@/components/ui/button';
import { analyseText, simplifyParagraph, SAMPLE_TEXT } from '@/lib/mockAnalysis';
import { AnalysisResult } from '@/types/reading';
import { useUser } from '@/contexts/UserContext';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, incrementUsage } = useUser();
  const [inputText, setInputText] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const paragraphRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Debounced analysis on text change
  useEffect(() => {
    if (!inputText.trim()) {
      setAnalysis(null);
      return;
    }

    const debounce = setTimeout(() => {
      setIsAnalysing(true);
      // Simulate async analysis
      setTimeout(() => {
        const result = analyseText(inputText);
        setAnalysis(result);
        setIsAnalysing(false);
      }, 500);
    }, 800);

    return () => clearTimeout(debounce);
  }, [inputText]);

  const handleAnalyse = useCallback(() => {
    if (!inputText.trim()) return;
    setIsAnalysing(true);
    setTimeout(() => {
      const result = analyseText(inputText);
      setAnalysis(result);
      setIsAnalysing(false);
    }, 500);
  }, [inputText]);

  const handleClear = useCallback(() => {
    setInputText('');
    setAnalysis(null);
  }, []);

  const handleTryExample = useCallback(() => {
    setInputText(SAMPLE_TEXT);
  }, []);

  const handleSimplify = useCallback(async (paragraphId: string) => {
    if (!user.isSignedIn) {
      setShowSignIn(true);
      return;
    }

    if (!analysis) return;

    // Update paragraph state to show loading
    setAnalysis(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        paragraphs: prev.paragraphs.map(p =>
          p.id === paragraphId ? { ...p, isSimplifying: true } : p
        ),
      };
    });

    const paragraph = analysis.paragraphs.find(p => p.id === paragraphId);
    if (!paragraph) return;

    try {
      const simplified = await simplifyParagraph(paragraph.originalText);
      incrementUsage();
      
      setAnalysis(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          paragraphs: prev.paragraphs.map(p =>
            p.id === paragraphId 
              ? { ...p, simplifiedText: simplified, isSimplifying: false, showSimplified: true }
              : p
          ),
        };
      });
    } catch {
      setAnalysis(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          paragraphs: prev.paragraphs.map(p =>
            p.id === paragraphId ? { ...p, isSimplifying: false } : p
          ),
        };
      });
    }
  }, [analysis, user.isSignedIn, incrementUsage]);

  const handleToggleSimplified = useCallback((paragraphId: string) => {
    setAnalysis(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        paragraphs: prev.paragraphs.map(p =>
          p.id === paragraphId ? { ...p, showSimplified: !p.showSimplified } : p
        ),
      };
    });
  }, []);

  const handleScrollToParagraph = useCallback((paragraphId: string) => {
    const ref = paragraphRefs.current[paragraphId];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ref.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
      setTimeout(() => {
        ref.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
      }, 2000);
    }
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">
            Make reading easier
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Analyse text complexity, highlight difficult passages, and simplify on demand.
          </p>
        </div>

        {!user.isSignedIn && (
          <div className="mb-6 flex items-center justify-center gap-4 rounded-lg border border-border bg-card p-4">
            <span className="text-sm text-muted-foreground">
              Try the demo below, or sign in to unlock simplification
            </span>
            <Button size="sm" onClick={() => setShowSignIn(true)}>
              Sign in free
            </Button>
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          {/* Main content area */}
          <div className="space-y-6">
            <TextInput
              value={inputText}
              onChange={setInputText}
              onAnalyse={handleAnalyse}
              onClear={handleClear}
              onTryExample={handleTryExample}
              isAnalysing={isAnalysing}
            />

            {isAnalysing && !analysis && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {analysis && analysis.paragraphs.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-lg font-medium text-foreground">
                  Analysed Text
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({analysis.paragraphs.length} paragraphs)
                  </span>
                </h2>
                <div className="space-y-3">
                  {analysis.paragraphs.map(paragraph => (
                    <div
                      key={paragraph.id}
                      ref={el => { paragraphRefs.current[paragraph.id] = el; }}
                      className="transition-all duration-300"
                    >
                      <ParagraphCard
                        paragraph={paragraph}
                        onSimplify={handleSimplify}
                        onToggleSimplified={handleToggleSimplified}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Analysis panel - sidebar on desktop, below on mobile */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            <AnalysisPanel 
              analysis={analysis} 
              onScrollToParagraph={handleScrollToParagraph}
            />
          </aside>
        </div>
      </main>

      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
    </div>
  );
};

export default Index;
