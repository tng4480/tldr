import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Sparkles, Trash2, FileText } from 'lucide-react';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onAnalyse: () => void;
  onClear: () => void;
  onTryExample: () => void;
  isAnalysing: boolean;
}

export function TextInput({ 
  value, 
  onChange, 
  onAnalyse, 
  onClear, 
  onTryExample,
  isAnalysing 
}: TextInputProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Textarea
          placeholder="Paste your text here to analyse readability and simplify complex passages..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[200px] resize-y bg-card text-base leading-relaxed font-serif placeholder:font-sans placeholder:text-muted"
        />
        {value.length > 0 && (
          <span className="absolute bottom-3 right-3 text-xs text-muted">
            {value.split(/\s+/).filter(w => w.length > 0).length} words
          </span>
        )}
      </div>
      
      <div className="flex flex-wrap items-center gap-2">
        <Button 
          onClick={onAnalyse} 
          disabled={!value.trim() || isAnalysing}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          {isAnalysing ? 'Analysing...' : 'Analyse'}
        </Button>
        
        <Button 
          variant="outline" 
          onClick={onClear}
          disabled={!value.trim()}
          className="gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Clear
        </Button>
        
        <Button 
          variant="ghost" 
          onClick={onTryExample}
          className="gap-2 text-muted-foreground"
        >
          <FileText className="h-4 w-4" />
          Try an example
        </Button>
      </div>
    </div>
  );
}
