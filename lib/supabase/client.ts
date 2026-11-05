import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client: publishable key only. RLS is what protects data, not this key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

// Per-tab client for /play: session lives in sessionStorage, so two tabs in the same
// browser are two different anonymous players (the cookie client above is shared).
let tabClient: SupabaseClient | undefined;
export function createTabClient() {
  tabClient ??= createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: window.sessionStorage, storageKey: "coin-rush-auth" } },
  );
  return tabClient;
}
