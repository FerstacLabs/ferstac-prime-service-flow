import "server-only";
import { createClient } from "@supabase/supabase-js";

// Ordinary workshop reads/writes must retain the user's RLS context.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Təhlükəsizlik xidməti konfiqurasiya edilməyib.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
