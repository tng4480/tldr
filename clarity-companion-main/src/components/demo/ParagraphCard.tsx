import { AnalysedParagraph } from '@/types/reading';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wand2, Copy, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { toast } from 'sonner';

interface ParagraphCardProps {
  paragraph: AnalysedParagraph;
  onSimplify: (id: string) => void;
  onToggleSimplified: (id: string) => void;
}

export function ParagraphCard({ paragraph, onSimplify, onToggleSimplified }: ParagraphCardProps) {
  const { user } = useUser();
  const canSimplify = user.isSignedIn && user.usageCount < user.usageLimit;
  const hasQuota = user.usageCount < user.usageLimit;

  const handleCopySimplified = () => {
    if (paragraph.simplifiedText) {
      navigator.clipboard.writeText(paragraph.simplifiedText);
      toast.success('Copied simplified text to clipboard');
    }
  };

  // Highlight keywords in text
  const renderHighlightedText = (text: string) => {
    if (paragraph.keywords.length === 0) return text;
    
    const regex = new RegExp(`\\b(${paragraph.keywords.join('|')})\\b`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) => {
      const isKeyword = paragraph.keywords.some(k => k.toLowerCase() === part.toLowerCase());
      if (isKeyword) {
        return (
          <span key={i} className="bg-highlight-keyword-bg text-highlight-keyword font-medium px-1 rounded">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <Card 
      className={`p-4 transition-all ${
        paragraph.isHardSentence 
          ? 'border-l-4 border-l-highlight-hard bg-highlight-hard-bg/30' 
          : 'bg-card'
      }`}
    >
      <div className="space-y-3">
        {paragraph.isHardSentence && (
          <Badge variant="secondary" className="text-xs bg-highlight-hard/10 text-highlight-hard border-0">
            Complex passage
          </Badge>
        )}
        
        <p className="font-serif text-base leading-relaxed text-foreground">
          {paragraph.showSimplified && paragraph.simplifiedText
            ? paragraph.simplifiedText
            : renderHighlightedText(paragraph.originalText)
          }
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          {!paragraph.simplifiedText ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onSimplify(paragraph.id)}
              disabled={!canSimplify || paragraph.isSimplifying}
              className="gap-2 text-xs"
            >
              {paragraph.isSimplifying ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Simplifying...
                </>
              ) : (
                <>
                  <Wand2 className="h-3 w-3" />
                  Simplify
                </>
              )}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleSimplified(paragraph.id)}
                className="gap-2 text-xs"
              >
                {paragraph.showSimplified ? (
                  <>
                    <EyeOff className="h-3 w-3" />
                    Show original
                  </>
                ) : (
                  <>
                    <Eye className="h-3 w-3" />
                    Show simplified
                  </>
                )}
              </Button>
              
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopySimplified}
                className="gap-2 text-xs text-muted-foreground"
              >
                <Copy className="h-3 w-3" />
                Copy simplified
              </Button>
            </>
          )}
          
          {!user.isSignedIn && (
            <span className="text-xs text-muted-foreground">
              Sign in to simplify paragraphs
            </span>
          )}
          
          {user.isSignedIn && !hasQuota && (
            <span className="text-xs text-warning">
              Usage limit reached. Upgrade to continue.
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
