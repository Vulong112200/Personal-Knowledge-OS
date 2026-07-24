"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    // disableTransitionOnChange suppresses the color cross-fade when the theme resolves on
    // hydration / toggle, which otherwise reads as a brief "half-dark" flash (FOUC).
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
