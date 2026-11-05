-- Fix: creating a team with `insert ... returning` (supabase-js `.insert().select()`) fails.
--
-- INSERT ... RETURNING must pass the table's SELECT policy. "see own teams" only allows rows
-- where the caller is in team_members, but the owner row is added by the AFTER INSERT trigger
-- `on_team_created`, and the STABLE function is_team_member() reads the statement's snapshot,
-- which does not contain that row. The result is a misleading
-- "new row violates row-level security policy for table teams", and the app never gets the new id.
--
-- The creator can always see the team they created. This grants nothing new: the trigger
-- makes the creator the owner of that team anyway.

drop policy "see own teams" on public.teams;

create policy "see own teams" on public.teams for select to authenticated
  using (
    created_by = (select auth.uid())
    or public.is_team_member(id::text)
  );
