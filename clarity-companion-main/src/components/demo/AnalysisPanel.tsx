import { AnalysisResult } from '@/types/reading';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Clock, FileText, AlignLeft, Target, Tag } from 'lucide-react';

interface AnalysisPanelProps {
  analysis: AnalysisResult | null;
  onScrollToParagraph?: (paragraphId: string) => void;
}

export function AnalysisPanel({ analysis, onScrollToParagraph }: AnalysisPanelProps) {
  if (!analysis) {
    return (
      <Card className="h-fit">
        <CardContent className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted/30">
            <FileText className="h-6 w-6 text-muted" />
          </div>
          <p className="text-sm text-muted-foreground">
            Paste text and analyse to see readability insights
          </p>
        </CardContent>
      </Card>
    );
  }

  const difficultyColors = {
    easy: 'bg-success text-success-foreground',
    moderate: 'bg-warning text-warning-foreground',
    hard: 'bg-destructive text-destructive-foreground',
  };

  const difficultyLabels = {
    easy: 'Easy',
    moderate: 'Moderate',
    hard: 'Challenging',
  };

  return (
    <div className="space-y-4">
      {/* Difficulty Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4 text-muted-foreground" />
            Reading Difficulty
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge className={difficultyColors[analysis.difficulty]}>
              {difficultyLabels[analysis.difficulty]}
            </Badge>
            <span className="text-2xl font-semibold text-foreground">
              {analysis.difficultyScore}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </span>
          </div>
          <Progress value={analysis.difficultyScore} className="h-2" />
        </CardContent>
      </Card>

      {/* Stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <AlignLeft className="h-4 w-4 text-muted-foreground" />
            Statistics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-foreground">{analysis.wordCount}</p>
              <p className="text-xs text-muted-foreground">Words</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-foreground">{analysis.sentenceCount}</p>
              <p className="text-xs text-muted-foreground">Sentences</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-2xl font-semibold text-foreground">{analysis.readingTimeMinutes}</p>
              </div>
              <p className="text-xs text-muted-foreground">min read</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Sentences */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Target className="h-4 w-4 text-muted-foreground" />
            Key Sentences
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {analysis.keySentences.slice(0, 5).map((sentence, i) => (
              <li 
                key={i}
                onClick={() => sentence.paragraphId && onScrollToParagraph?.(sentence.paragraphId)}
                className={`text-sm text-muted-foreground leading-relaxed p-2 rounded-md transition-colors ${
                  sentence.paragraphId 
                    ? 'cursor-pointer hover:bg-muted/30 hover:text-foreground' 
                    : ''
                }`}
              >
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                  {i + 1}
                </span>
                {sentence.text.length > 100 
                  ? sentence.text.substring(0, 100) + '...' 
                  : sentence.text
                }
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Keywords */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Tag className="h-4 w-4 text-muted-foreground" />
            Keywords
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {analysis.keywords.map((keyword, i) => (
              <Badge 
                key={i} 
                variant="outline"
                className="bg-highlight-keyword-bg/50 text-highlight-keyword border-highlight-keyword/20"
              >
                {keyword}
              </Badge>
            ))}
            {analysis.keywords.length === 0 && (
              <p className="text-sm text-muted-foreground">No keywords detected</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
