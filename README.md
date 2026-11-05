# Coin Rush

**Play it:** https://coin-rush-silk.vercel.app/play

A realtime multiplayer coin-collecting game built on Supabase. Pick a name, and you're in the
arena with everyone else: move your dot with the arrow keys / WASD (or the on-screen D-pad on a
phone) and touch coins before anyone else does. Rounds last 60 seconds; the round winner is
announced, and every coin also counts toward a shared all-time leaderboard.

Built at the Supabase x Claude Amsterdam meetup, 5 November 2026.

## How it uses Supabase

| Supabase feature | What it does in Coin Rush |
| --- | --- |
| **Anonymous Auth** | No sign-up. Each browser tab signs in anonymously and is its own player. |
| **Realtime broadcast** | Player positions (~15/s), coin spawns, coin claims and round state on one channel. |
| **Realtime presence** | The "online now" list, and choosing the host (the player with the lowest id). |
| **Postgres + RLS** | A `scores` table anyone can read, but each player can only write their own row. |
| **Database function** | `bump_score()` adds 1 to the caller's own score atomically, under RLS. |

There is no game server. The game runs entirely in the browser; the database's security rules
are what keep scores honest.

## How it works

- **The host decides who got each coin.** One player (chosen by presence) spawns coins and
  accepts only the *first* claim on each coin, then tells everyone who won it. Two players
  touching the same coin can't both score.
- **Scores are protected by the database, not the app.** The winner calls `bump_score()` for
  their own row. RLS refuses any attempt to write another player's score, and no
  `service_role` key is used anywhere.
- **Smooth movement.** Positions are broadcast about 15 times a second (once a second when
  standing still), and other players' dots are smoothed between updates.
- **Host handoff.** If the host leaves or a new player becomes host, the round and coins are
  handed over instead of restarting.

## Tested

- Two players in separate browsers: joining, seeing each other move live, collecting coins
  (each coin scores once), and the same leaderboard on both screens.
- Security rules with real anonymous users: anyone can read scores, nobody can insert or update
  another player's row, and signed-out writes are refused.
- The round clock stays in sync when a third player joins.

Not yet tested: a newly joined player taking over as host mid-round, and the D-pad on a real
phone.

## Run it locally

You need Node.js and a Supabase project with **anonymous sign-ins enabled**
(Authentication → Sign In / Providers).

```bash
npm install
cp .env.example .env.local   # then fill in your project URL and publishable key
supabase link --project-ref <your-project-ref>
supabase db push             # creates the scores table, policies and bump_score()
npm run dev
```

Open http://localhost:3000/play in two browser windows to play against yourself.

If lots of people play from one network (a meetup wifi), raise the anonymous sign-in rate
limit under Authentication → Rate limits; the default is 30 per hour per IP.

## Code map

- `app/play/coin-rush.tsx` — the whole game: join form, game loop, realtime, drawing, sound, D-pad
- `lib/supabase/client.ts` — `createTabClient()` keeps each tab's session separate, so one
  browser can run several players
- `supabase/migrations/20261105140000_coin_rush_scores.sql` — `scores` table, RLS policies,
  `bump_score()`

Stack: Next.js 16 (App Router, TypeScript), Tailwind, Supabase, deployed on Vercel.

The repo also contains an earlier, unfinished project scaffold (DemoDrop: magic-link login, a
dashboard and team tables). Coin Rush doesn't use it.
