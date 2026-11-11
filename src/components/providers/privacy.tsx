"use client";
import { createContext, useContext, useState, type ReactNode } from "react";

const PrivacyContext = createContext<{ hidden: boolean; setHidden: (v: boolean) => void }>({
  hidden: false,
  setHidden: () => {},
});

export function PrivacyProvider({ initial, children }: { initial: boolean; children: ReactNode }) {
  const [hidden, setHidden] = useState(initial);
  // Adopt a new server value (e.g. after sign-in) without an effect.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setHidden(initial);
  }
  return <PrivacyContext value={{ hidden, setHidden }}>{children}</PrivacyContext>;
}

export const usePrivacy = () => useContext(PrivacyContext);
