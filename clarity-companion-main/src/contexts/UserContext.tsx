import React, { createContext, useContext, useState, ReactNode } from 'react';
import { UserState } from '@/types/reading';

interface UserContextType {
  user: UserState;
  signIn: (email: string, name: string) => void;
  signOut: () => void;
  incrementUsage: () => void;
}

const defaultUser: UserState = {
  isSignedIn: false,
  isTrialing: false,
  subscriptionStatus: 'none',
  plan: 'free',
  usageCount: 0,
  usageLimit: 5,
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserState>(defaultUser);

  const signIn = (email: string, name: string) => {
    setUser({
      isSignedIn: true,
      email,
      name,
      trialDaysRemaining: 14,
      isTrialing: true,
      subscriptionStatus: 'trialing',
      plan: 'starter',
      usageCount: 0,
      usageLimit: 50,
    });
  };

  const signOut = () => {
    setUser(defaultUser);
  };

  const incrementUsage = () => {
    setUser(prev => ({
      ...prev,
      usageCount: prev.usageCount + 1,
    }));
  };

  return (
    <UserContext.Provider value={{ user, signIn, signOut, incrementUsage }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
