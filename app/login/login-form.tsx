"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/dashboard` },
    });

    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <p className="text-zinc-700 dark:text-zinc-300">
        Check <strong>{email}</strong> for a sign-in link. Open it in this browser.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        placeholder="you@team.dev"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {state === "sending" ? "Sending…" : "Send magic link"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
