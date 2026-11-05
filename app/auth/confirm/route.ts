import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link landing. Handles the default PKCE link (?code=) and a custom email
// template that sends ?token_hash=&type=.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Only allow same-site relative redirects.
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const supabase = await createClient();

  let error: string | null = "Missing sign-in token";
  if (code) {
    error = (await supabase.auth.exchangeCodeForSession(code)).error?.message ?? null;
  } else if (tokenHash && type) {
    error = (await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error?.message ?? null;
  }

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error)}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
