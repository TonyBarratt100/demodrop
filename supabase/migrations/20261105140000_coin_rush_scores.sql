-- Coin Rush: one score row per player (anonymous users included).
-- Anyone can read the leaderboard; a player can only insert/update their own row.

create table public.scores (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 20),
  score       integer not null default 0 check (score >= 0),
  updated_at  timestamptz not null default now()
);

create index scores_score_idx on public.scores (score desc);

alter table public.scores enable row level security;

create policy "scores: anyone can read"
  on public.scores for select
  to anon, authenticated
  using (true);

create policy "scores: insert own row"
  on public.scores for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "scores: update own row"
  on public.scores for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Atomic +1 for the caller's own row. SECURITY INVOKER, so the update policy above applies.
create or replace function public.bump_score()
returns integer
language sql volatile security invoker set search_path = ''
as $$
  update public.scores
     set score = score + 1, updated_at = now()
   where user_id = (select auth.uid())
  returning score;
$$;

revoke execute on function public.bump_score() from public, anon;
grant execute on function public.bump_score() to authenticated;
