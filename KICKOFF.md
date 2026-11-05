# DemoDrop — kickoff plan (build session 13:00–14:30)

## Before 13:00 (over lunch, on the Mac)
1. Node 20+: `node -v` (if missing: `brew install node`)
2. Supabase CLI: `brew install supabase/tap/supabase`, then `supabase login`
3. Claude Code installed and signed in (see https://docs.claude.com/en/docs/claude-code/overview)
4. Create a hosted Supabase project at supabase.com (no Docker needed). Note the project ref.
5. Have an Anthropic API key ready for the Edge Function secret.
6. Scaffold and link:
   ```
   npx create-next-app@latest demodrop --ts --tailwind --app --eslint
   cd demodrop
   supabase init
   supabase link --project-ref <your-ref>
   ```
   Copy this kit's `CLAUDE.md` and `supabase/migrations/0001_init.sql` into the repo.
7. Optional: connect the Supabase MCP server to Claude Code so it can inspect tables and policies
   (instructions in the Supabase docs under "MCP").

## Prompts for Claude Code, in order
1. "Read CLAUDE.md and the migration. Push the migration with `supabase db push`, then list
   any problems you see with the RLS policies before we write app code."
2. "Build magic-link login, a page to create a team, and a page to invite a member by email
   (owner only). Log team_created and member_invited."
3. "Build the submission page: create a submission, upload a file to
   {team_id}/{submission_id}/{filename}. Use standard upload under 6 MB and tus-js-client above it.
   After upload, swap submissions.object_path in one update. Log upload_started and upload_completed."
4. "Write the review-submission Edge Function exactly as specced in CLAUDE.md. No DB connection
   held during the Claude call."
5. "Show the milestone heartbeat per team: the five events in order, with counts."

## Time boxes
- 13:00–13:15 migration pushed, auth working
- 13:15–13:45 teams + uploads (the MVP: stop here if short on time)
- 13:45–14:10 Claude review Edge Function
- 14:10–14:20 heartbeat view + resumable uploads (stretch)
- 14:20–14:30 demo prep: freeze code, rehearse

## Demo script (2 minutes)
1. Log in as owner, create team, invite a viewer.
2. Upload a demo pack, show Claude's judge notes appear.
3. Log in as the viewer: can read, cannot upload (RLS refuses it). That's the "files obey the
   same policies as tables" line from Ferhat's talk.
4. Show the heartbeat: every milestone tracked, Skene-style.
