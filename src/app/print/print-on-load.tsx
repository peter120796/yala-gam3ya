"use client";
import { useEffect } from "react";

export function PrintOnLoad() {
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300);
    return () => clearTimeout(id);
  }, []);
  return null;
}
