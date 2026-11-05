# Coin Rush — CLAUDE.md

Realtime multiplayer coin-collecting game at `/play`. Players join anonymously, move a dot with
arrow keys / WASD (or an on-screen D-pad on touch devices), and race to touch coins. Scores go
to a shared leaderboard. Built at the Supabase x Claude Amsterdam meetup, 5 Nov 2026.
Ship a working demo over a perfect one.

(The repo is named `demodrop` and still contains the earlier DemoDrop scaffold — see the end of
this file. Coin Rush is the active project.)

## Stack
- Next.js 16 (App Router, TypeScript) + Tailwind
- Supabase: anonymous Auth, Realtime (broadcast + presence), Postgres with RLS
- No server code for the game: everything runs in the browser under RLS

## Where things are
- `app/play/coin-rush.tsx` — the whole game: join form, arena loop, drawing, sound, D-pad
- `app/play/page.tsx` — route
- `lib/supabase/client.ts` — `createClient()` (cookie session, shared across tabs) and
  `createTabClient()` (session in the tab's own storage, so each tab is its own player).
  The game uses `createTabClient()`.
- `supabase/migrations/20261105140000_coin_rush_scores.sql` — `scores` table, RLS, `bump_score()`.
  Migrations are the source of truth for the schema.

## How the game works
- **Channel:** one Realtime channel, `coin-rush:arena`.
- **Positions:** broadcast ~15/s while moving, 1/s heartbeat when still; remote dots are smoothed.
- **Presence** drives the online list and host election: the lowest user id is host.
- **Host decides coins:** the host spawns coins, accepts the FIRST claim per coin, and broadcasts
  `collected`. Non-hosts only send `claim`. This is what stops a coin scoring twice.
- **Scoring:** the winning player calls `bump_score()` for their own row (SECURITY INVOKER, so RLS
  applies). Nobody can write another player's score.
- **Rounds:** host owns the clock — 60s round, then 5s "Round over! X wins". Round number and
  remaining time ride along on the `coins` broadcast.
- **Host handoff:** the outgoing host rebroadcasts round + coins when demoted; a new host waits
  `HOST_GRACE_MS` (2s) and adopts that state instead of restarting the round.

## Invariants — never break these
1. **RLS is always on.** Never disable RLS, never use the service_role key in the browser.
   Access rules live in Postgres policies, not in app code.
2. **Only the host decides who got a coin.** Don't let clients award themselves points directly.
3. **Scores change only through `bump_score()`** on the caller's own row. Don't add policies that
   let a player write someone else's row, and don't add a delete policy without asking.
4. Broadcast event names (`pos`, `coins`, `claim`, `collected`, `score`) are a protocol between
   clients — changing one breaks mixed old/new tabs.

## Known gaps
- Not tested: a newcomer taking over as host mid-round; the D-pad on a real touch device.
- Supabase limits anonymous sign-ins to 30/hour per IP by default. A shared wifi hits this fast:
  raise it in Dashboard → Authentication → Rate limits. Reloading a tab keeps its player.
- Test rows can clutter the leaderboard; clear them in the SQL editor (there's no delete policy).

## How we work
- Test racy things (two players claiming one coin, host leaving mid-round) with two or more
  real tabs/clients before calling them fixed.
- Small commits. One problem per branch/worktree.
- Ask before adding dependencies.

## Commands
- `npm run dev` — local app (game at http://localhost:3000/play)
- `npm run lint`
- `supabase db push` — apply migrations to the linked project

## Leftover DemoDrop scaffold (not in active development)
The repo started as DemoDrop, a hackathon submission portal. Still present: magic-link login
(`app/login`, `app/auth/*`), a protected `app/dashboard`, and `teams` / `team_members` /
`submissions` / `events` tables (`supabase/migrations/20261105120000_init.sql`, plus a fix).
Membership checks there go through `public.is_team_member(team_id_text, min_role)` — don't
inline membership subqueries in policies (causes RLS recursion). The upload flow and the
`review-submission` Edge Function were never built.

@AGENTS.md
