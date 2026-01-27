import "@mantine/core/styles.css";
import "./globals.css";

import type { Metadata } from "next";
import { ReactNode } from "react";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "Clarity Companion",
  description: "Simplify and understand reading material with on-demand explanations.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
