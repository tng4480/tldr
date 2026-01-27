"use client";

import { MantineProvider } from "@mantine/core";
import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

const theme = {
  primaryColor: "indigo",
  fontFamily: "Inter, system-ui, -apple-system, sans-serif",
};

type ProvidersProps = {
  children: ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <MantineProvider theme={theme}>{children}</MantineProvider>
    </SessionProvider>
  );
}
