import { createBrowserClient } from "@supabase/ssr";

// Browser client: publishable key only. RLS is what protects data, not this key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
