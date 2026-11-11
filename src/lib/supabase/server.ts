import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requirePublicSupabase } from "@/lib/env";

/** Supabase client bound to the request cookies (Auth only — data goes through Drizzle + RLS). */
export async function createSupabaseServer() {
  const { supabaseUrl, supabaseKey } = requirePublicSupabase();
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
