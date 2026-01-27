import { Link } from 'react-router-dom';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  BookOpen, 
  Sparkles, 
  BarChart3, 
  Zap,
  CheckCircle2,
  ArrowRight
} from 'lucide-react';

const features = [
  {
    icon: BarChart3,
    title: 'Instant Readability Analysis',
    description: 'Get reading difficulty scores, word counts, and estimated reading time the moment you paste your text.',
  },
  {
    icon: Sparkles,
    title: 'Highlight Difficult Passages',
    description: 'Hard sentences are automatically highlighted so you know exactly where to focus your attention.',
  },
  {
    icon: Zap,
    title: 'One-Click Simplification',
    description: 'Simplify complex paragraphs with a single click. Keep the meaning, lose the complexity.',
  },
];

const benefits = [
  'Works with any text—articles, contracts, research papers',
  'Extract key sentences and keywords automatically',
  'No account required to analyse text',
  '14-day free trial with full features',
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Hero Section */}
      <section className="container py-16 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>Reading enhancement for everyone</span>
          </div>
          
          <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Make reading{' '}
            <span className="text-primary">easier</span>
          </h1>
          
          <p className="mt-6 text-lg text-muted-foreground md:text-xl">
            Paste any text and instantly see what's hard to read. Highlight difficult passages, 
            extract key information, and simplify complex paragraphs on demand.
          </p>
          
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="gap-2 px-8">
              <Link to="/demo">
                Try the Demo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/pricing">View Pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-y border-border bg-card/50 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              The inverse of Grammarly
            </h2>
            <p className="mt-4 text-muted-foreground">
              While Grammarly improves your writing, Reading Simplifier improves your reading experience.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-border bg-card">
                <CardContent className="pt-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container py-16 md:py-24">
        <div className="mx-auto grid max-w-5xl gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              Reading made simple
            </h2>
            <p className="mt-4 text-muted-foreground">
              Whether you're tackling dense academic papers, lengthy legal documents, 
              or complex technical articles, Reading Simplifier helps you understand faster.
            </p>
            
            <ul className="mt-8 space-y-4">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <span className="text-foreground">{benefit}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8">
              <Button asChild size="lg" className="gap-2">
                <Link to="/demo">
                  Start Analysing
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 lg:p-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-destructive" />
                <div className="h-3 w-3 rounded-full bg-yellow-500" />
                <div className="h-3 w-3 rounded-full bg-green-500" />
              </div>
              <div className="space-y-3 font-mono text-sm">
                <p className="text-muted-foreground">
                  <span className="text-foreground">Difficulty:</span> Moderate
                </p>
                <p className="text-muted-foreground">
                  <span className="text-foreground">Reading time:</span> 4 min
                </p>
                <p className="text-muted-foreground">
                  <span className="text-foreground">Hard sentences:</span> 3 of 12
                </p>
                <div className="mt-4 rounded bg-highlight-hard/30 p-3 text-foreground">
                  "The juxtaposition of these paradigms necessitates a fundamental reconceptualisation..."
                </div>
                <p className="text-xs text-muted-foreground">
                  ↑ This sentence was flagged as difficult
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-border bg-card/50 py-16 md:py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-foreground md:text-3xl">
              Ready to read smarter?
            </h2>
            <p className="mt-4 text-muted-foreground">
              Try the demo for free—no account required. Sign up to unlock paragraph simplification.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="gap-2 px-8">
                <Link to="/demo">
                  Try the Demo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/pricing">See Plans</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Reading Simplifier</span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Reading Simplifier. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
