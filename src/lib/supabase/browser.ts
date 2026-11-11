"use client";
import { createBrowserClient } from "@supabase/ssr";
import { requirePublicSupabase } from "@/lib/env";

export function createSupabaseBrowser() {
  const { supabaseUrl, supabaseKey } = requirePublicSupabase();
  return createBrowserClient(supabaseUrl, supabaseKey);
}
