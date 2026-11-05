import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <SignedIn />
      </Suspense>
    </main>
  );
}

// Reads the session cookie, so it sits behind Suspense (required with cacheComponents).
// proxy.ts redirects optimistically; this getClaims() check is the real gate.
async function SignedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) redirect("/login");

  return (
    <div className="flex items-center justify-between gap-4">
      <p>
        Signed in as <strong>{claims.email as string}</strong>
      </p>
      <form action="/auth/signout" method="post">
        <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700">
          Sign out
        </button>
      </form>
    </div>
  );
}
