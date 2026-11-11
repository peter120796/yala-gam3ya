"use client";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { Direction } from "radix-ui";
import { PrivacyProvider } from "./privacy";

export function AppProviders({
  children,
  dir,
  privacyMode,
}: {
  children: ReactNode;
  dir: "rtl" | "ltr";
  privacyMode: boolean;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <Direction.Provider dir={dir}>
        <PrivacyProvider initial={privacyMode}>
          {children}
          <Toaster dir={dir} position={dir === "rtl" ? "top-left" : "top-right"} richColors closeButton />
        </PrivacyProvider>
      </Direction.Provider>
    </ThemeProvider>
  );
}
