import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useState } from 'react';
import { SignInModal } from '@/components/demo/SignInModal';

const tiers = [
  {
    name: 'Free',
    price: '£0',
    period: 'forever',
    description: 'Basic analysis for occasional use',
    features: [
      'Text readability analysis',
      'Keyword highlighting',
      'Difficulty scoring',
      '5 simplifications per month',
    ],
    cta: 'Get started',
    tier: 'free' as const,
  },
  {
    name: 'Starter',
    price: '£9',
    period: 'per month',
    description: 'For students and casual readers',
    features: [
      'Everything in Free',
      '50 simplifications per month',
      'Priority processing',
      'Export simplified text',
    ],
    cta: 'Start free trial',
    tier: 'starter' as const,
    popular: true,
  },
  {
    name: 'Pro',
    price: '£29',
    period: 'per month',
    description: 'For professionals and researchers',
    features: [
      'Everything in Starter',
      'Unlimited simplifications',
      'URL analysis (coming soon)',
      'API access',
      'Priority support',
    ],
    cta: 'Start free trial',
    tier: 'pro' as const,
  },
];

const Pricing = () => {
  const { user } = useUser();
  const [showSignIn, setShowSignIn] = useState(false);

  const handleCTA = (tier: 'free' | 'starter' | 'pro') => {
    if (!user.isSignedIn) {
      setShowSignIn(true);
    }
    // In real app, this would handle subscription flow
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-bold text-foreground">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Start with a 14-day free trial on Starter. No credit card required.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <Card 
              key={tier.name}
              className={`relative flex flex-col ${
                tier.popular 
                  ? 'border-primary shadow-lg scale-105' 
                  : 'border-border'
              }`}
            >
              {tier.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                  Most popular
                </Badge>
              )}
              
              <CardHeader>
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <CardDescription>{tier.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-foreground">{tier.price}</span>
                  <span className="text-muted-foreground">/{tier.period}</span>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1">
                <ul className="space-y-3">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-success" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter>
                <Button 
                  className="w-full"
                  variant={tier.popular ? 'default' : 'outline'}
                  onClick={() => handleCTA(tier.tier)}
                >
                  {user.isSignedIn && user.plan === tier.tier 
                    ? 'Current plan' 
                    : tier.cta
                  }
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="mt-16 mx-auto max-w-2xl">
          <Card className="bg-accent/30 border-accent">
            <CardContent className="py-6">
              <h3 className="text-lg font-semibold text-foreground text-center">
                14-day free trial on all paid plans
              </h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Your trial starts the moment you sign in. You&apos;ll get Starter-level limits 
                during the trial period. Cancel anytime with no obligation.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      <SignInModal open={showSignIn} onOpenChange={setShowSignIn} />
    </div>
  );
};

export default Pricing;
