import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requirePublicSupabase } from "@/lib/env";

/**
 * Service-role client for Auth admin operations (invitations, sign-out of
 * deactivated users). Server-only; callers MUST have verified the actor is a
 * super admin (aal2) first. Never import from client code.
 */
export function createSupabaseAdmin() {
  const { supabaseUrl } = requirePublicSupabase();
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
