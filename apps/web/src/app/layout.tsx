import "./globals.css";

import type { Metadata } from "next";
import { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "tldr",
  description: "Read faster with keyword highlights, RSVP and an in-browser file reader. Everything runs on your device.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
