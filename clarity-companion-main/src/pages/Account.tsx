import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useUser } from '@/contexts/UserContext';
import { useNavigate } from 'react-router-dom';
import { User, CreditCard, Clock, BarChart3 } from 'lucide-react';

const Account = () => {
  const { user, signOut } = useUser();
  const navigate = useNavigate();

  if (!user.isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container py-16">
          <div className="mx-auto max-w-md text-center">
            <h1 className="text-2xl font-bold text-foreground">Account</h1>
            <p className="mt-2 text-muted-foreground">
              Please sign in to view your account.
            </p>
            <Button className="mt-6" onClick={() => navigate('/')}>
              Go to demo
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const usagePercentage = (user.usageCount / user.usageLimit) * 100;

  const statusLabels = {
    none: 'No subscription',
    trialing: 'Trial',
    active: 'Active',
    canceled: 'Cancelled',
    past_due: 'Past due',
  };

  const statusColors = {
    none: 'bg-muted text-muted-foreground',
    trialing: 'bg-accent text-accent-foreground',
    active: 'bg-success text-success-foreground',
    canceled: 'bg-destructive/20 text-destructive',
    past_due: 'bg-warning text-warning-foreground',
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-3xl font-bold text-foreground">Account</h1>

          {/* Identity */}
          <Card>
            <CardHeader className="flex flex-row items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>{user.name}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
              </div>
            </CardHeader>
          </Card>

          {/* Subscription Status */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">Subscription</CardTitle>
                </div>
                <Badge className={statusColors[user.subscriptionStatus]}>
                  {statusLabels[user.subscriptionStatus]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current plan</span>
                <span className="font-medium text-foreground capitalize">{user.plan}</span>
              </div>
              
              {user.isTrialing && user.trialDaysRemaining && (
                <div className="flex items-center gap-3 rounded-lg bg-accent/50 p-3">
                  <Clock className="h-5 w-5 text-accent-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Trial ends in {user.trialDaysRemaining} days
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Subscribe to keep your access after the trial
                    </p>
                  </div>
                </div>
              )}

              <Button variant="outline" className="w-full">
                Manage subscription
              </Button>
            </CardContent>
          </Card>

          {/* Usage */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Monthly Usage</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Simplifications used</span>
                  <span className="font-medium text-foreground">
                    {user.usageCount} / {user.usageLimit}
                  </span>
                </div>
                <Progress 
                  value={usagePercentage} 
                  className={`h-2 ${usagePercentage > 80 ? '[&>div]:bg-warning' : ''}`} 
                />
              </div>
              
              {usagePercentage >= 80 && (
                <p className="text-sm text-warning">
                  You&apos;re approaching your monthly limit. Consider upgrading for more.
                </p>
              )}

              <Button variant="secondary" className="w-full" onClick={() => navigate('/pricing')}>
                Upgrade plan
              </Button>
            </CardContent>
          </Card>

          {/* Sign Out */}
          <Card>
            <CardContent className="py-4">
              <Button 
                variant="ghost" 
                className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  signOut();
                  navigate('/');
                }}
              >
                Sign out
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default Account;
