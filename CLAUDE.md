# DemoDrop — CLAUDE.md

Hackathon submission portal. Teams upload a "demo pack" (README, PDF, screenshots, optional video).
Claude reviews the text/PDF/images and writes judge notes. Built at the Supabase x Claude
Amsterdam meetup, 5 Nov 2026. Time box: 90 minutes. Ship a working demo over a perfect one.

## Stack
- Next.js (App Router, TypeScript) + Tailwind
- Supabase: Auth (email magic link), Postgres with RLS, Storage bucket `demos`, one Edge Function
- Anthropic API from the Edge Function only, model `claude-sonnet-5-5`
- Big files (> 6 MB): TUS resumable upload via `tus-js-client` to `/storage/v1/upload/resumable`

## Data model (see supabase/migrations/0001_init.sql — that file is the source of truth)
- `teams`, `team_members(role: owner | editor | viewer)`
- `submissions` — one per team entry; `object_path` points at the CURRENT file
- `events` — product milestones (see "Milestones" below)
- Storage paths: `{team_id}/{submission_id}/{filename}`

## Invariants — never break these
1. **RLS is always on.** Never disable RLS, never use the service_role key in the browser.
   Access rules live in Postgres policies, not in app code.
2. **Never hold a DB transaction or connection across slow I/O** (uploads, Claude calls, fetches).
   Pattern: short check -> do the slow work -> short write.
3. **Write new, then swap.** New uploads get a new path; update `submissions.object_path`
   in one statement. Old files are removed afterwards, never overwritten in place.
4. **Membership checks go through `public.is_team_member(team_id_text, min_role)`.**
   Do not inline membership subqueries in policies (causes RLS recursion).
5. The Edge Function acts AS THE CALLER (forward the user's JWT), so RLS applies to its reads.
   Only the final status write may use elevated rights, and only after re-checking membership.

## Edge Function `review-submission` (spec)
POST { submission_id }
1. Verify JWT; load submission with the user's client (RLS proves membership).
2. Set status = 'summarizing' (short statement, done).
3. Download the file, call Claude for judge notes: what it does, how complex, what's impressive,
   one risk. Max ~200 words. No DB connection held during this call.
4. Write summary + status = 'summarized' (or 'failed' with the error). Log event `review_generated`.

## Milestones (Skene-style "heartbeat" — log each to `events`)
team_created -> member_invited -> upload_started -> upload_completed -> review_generated
Event names are a contract. Do not rename them.

## How we work
- Tests before fixes for anything racy (two uploads to the same submission, client drops mid-upload).
- Small commits. One problem per branch/worktree.
- Ask before adding dependencies.

## Commands
- `npm run dev` — local app
- `supabase db push` — apply migrations to the linked project
- `supabase functions deploy review-submission`
- `supabase secrets set ANTHROPIC_API_KEY=...`

@AGENTS.md
