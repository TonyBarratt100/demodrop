-- DemoDrop: teams, roles, submissions, milestone events, and storage policies.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null default auth.uid() references auth.users(id),
  created_at  timestamptz not null default now()
);

create table public.team_members (
  team_id  uuid not null references public.teams(id) on delete cascade,
  user_id  uuid not null references auth.users(id) on delete cascade,
  role     text not null check (role in ('owner', 'editor', 'viewer')),
  primary key (team_id, user_id)
);

create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  team_id      uuid not null references public.teams(id) on delete cascade,
  title        text not null,
  object_path  text,                      -- pointer to the current file (write new, then swap)
  summary      text,
  status       text not null default 'draft'
               check (status in ('draft', 'uploaded', 'summarizing', 'summarized', 'failed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.events (
  id          bigint generated always as identity primary key,
  team_id     uuid references public.teams(id) on delete cascade,
  user_id     uuid default auth.uid(),
  name        text not null check (name in
                ('team_created','member_invited','upload_started','upload_completed','review_generated')),
  props       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Membership helper. SECURITY DEFINER so policies can call it without RLS recursion.
-- Takes text so it can be fed storage.foldername() directly.
create or replace function public.is_team_member(t text, min_role text default 'viewer')
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id::text = t
      and m.user_id = (select auth.uid())
      and case min_role
            when 'viewer' then true
            when 'editor' then m.role in ('editor', 'owner')
            when 'owner'  then m.role = 'owner'
            else false
          end
  );
$$;

-- Whoever creates a team becomes its owner.
create or replace function public.add_team_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.team_members (team_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_team_created after insert on public.teams
for each row execute function public.add_team_owner();

-- RLS
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.submissions  enable row level security;
alter table public.events       enable row level security;

create policy "create teams"  on public.teams for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy "see own teams" on public.teams for select to authenticated
  using (public.is_team_member(id::text));

create policy "see teammates"     on public.team_members for select to authenticated
  using (public.is_team_member(team_id::text));
create policy "owners add members" on public.team_members for insert to authenticated
  with check (public.is_team_member(team_id::text, 'owner'));
create policy "owners remove members" on public.team_members for delete to authenticated
  using (public.is_team_member(team_id::text, 'owner'));

create policy "members read submissions" on public.submissions for select to authenticated
  using (public.is_team_member(team_id::text));
create policy "editors create submissions" on public.submissions for insert to authenticated
  with check (public.is_team_member(team_id::text, 'editor'));
create policy "editors update submissions" on public.submissions for update to authenticated
  using (public.is_team_member(team_id::text, 'editor'))
  with check (public.is_team_member(team_id::text, 'editor'));

create policy "members log events" on public.events for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_team_member(team_id::text));
create policy "members read events" on public.events for select to authenticated
  using (public.is_team_member(team_id::text));

-- Storage: private bucket, 50 MB cap (Free plan max). Path = {team_id}/{submission_id}/{file}
insert into storage.buckets (id, name, public, file_size_limit)
values ('demos', 'demos', false, 52428800)
on conflict (id) do nothing;

create policy "members read demos" on storage.objects for select to authenticated
  using (bucket_id = 'demos' and public.is_team_member((storage.foldername(name))[1]));
create policy "editors upload demos" on storage.objects for insert to authenticated
  with check (bucket_id = 'demos' and public.is_team_member((storage.foldername(name))[1], 'editor'));
create policy "editors replace demos" on storage.objects for update to authenticated
  using (bucket_id = 'demos' and public.is_team_member((storage.foldername(name))[1], 'editor'));
create policy "editors delete demos" on storage.objects for delete to authenticated
  using (bucket_id = 'demos' and public.is_team_member((storage.foldername(name))[1], 'editor'));
