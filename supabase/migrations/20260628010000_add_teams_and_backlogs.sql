create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_not_blank check (length(trim(name)) > 0),
  constraint teams_slug_not_blank check (length(trim(slug)) > 0)
);

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  member_kind text not null default 'human',
  display_name text not null default '',
  created_at timestamptz not null default now(),
  constraint team_memberships_role_valid check (role in ('owner', 'maintainer', 'member', 'agent')),
  constraint team_memberships_member_kind_valid check (member_kind in ('human', 'agent')),
  unique (team_id, user_id)
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint team_invitations_email_not_blank check (length(trim(email)) > 0),
  constraint team_invitations_role_valid check (role in ('owner', 'maintainer', 'member', 'agent'))
);

create unique index team_invitations_one_open_invite_per_email
  on public.team_invitations (team_id, lower(email))
  where accepted_at is null;

create table public.backlogs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backlogs_name_not_blank check (length(trim(name)) > 0),
  constraint backlogs_slug_not_blank check (length(trim(slug)) > 0),
  unique (team_id, slug)
);

alter table public.work_items
add column backlog_id uuid references public.backlogs(id) on delete cascade;

create index backlogs_team_idx
  on public.backlogs (team_id, name);

create index team_memberships_user_idx
  on public.team_memberships (user_id, team_id);

create index work_items_backlog_queue_idx
  on public.work_items (backlog_id, status, priority_rank, created_at);

create index work_items_backlog_idx
  on public.work_items (backlog_id);

create function public.touch_team_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teams_touch_updated_at
before update on public.teams
for each row
execute function public.touch_team_updated_at();

create function public.touch_backlog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger backlogs_touch_updated_at
before update on public.backlogs
for each row
execute function public.touch_backlog_updated_at();

insert into public.teams (name, slug)
values ('Team Daedalus', 'daedalus')
on conflict (slug) do nothing;

insert into public.backlogs (team_id, name, slug, description)
select id, 'Daedalus Backlog', 'daedalus-backlog', 'Default backlog for Daedalus agent work.'
from public.teams
where slug = 'daedalus'
on conflict (team_id, slug) do nothing;

update public.work_items
set backlog_id = (
  select backlogs.id
  from public.backlogs
  inner join public.teams on teams.id = backlogs.team_id
  where teams.slug = 'daedalus'
    and backlogs.slug = 'daedalus-backlog'
)
where backlog_id is null;

alter table public.work_items
alter column backlog_id set not null;

insert into public.team_invitations (team_id, email, role)
select id, 'ryan@test', 'member'
from public.teams
where slug = 'daedalus'
on conflict do nothing;

insert into public.team_memberships (team_id, user_id, role, member_kind, display_name)
select
  teams.id,
  users.id,
  'member',
  'human',
  coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), users.email, 'Ryan')
from public.teams
cross join auth.users
where teams.slug = 'daedalus'
  and lower(users.email) = 'ryan@test'
on conflict (team_id, user_id) do nothing;

update public.team_invitations
set
  accepted_by_user_id = users.id,
  accepted_at = coalesce(public.team_invitations.accepted_at, now())
from auth.users
inner join public.teams on teams.slug = 'daedalus'
where teams.id = public.team_invitations.team_id
  and lower(public.team_invitations.email) = 'ryan@test'
  and lower(users.email) = 'ryan@test'
  and public.team_invitations.accepted_by_user_id is null;

drop policy if exists "Authenticated users can read work items" on public.work_items;
drop policy if exists "Authenticated users can create work items" on public.work_items;
drop policy if exists "Authenticated users can update work items" on public.work_items;
drop policy if exists "Authenticated users can read workers" on public.workers;
drop policy if exists "Authenticated users can read leases" on public.work_leases;
drop policy if exists "Authenticated users can read run events" on public.run_events;

create or replace function public.current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.current_user_is_team_member(target_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_memberships
    where team_memberships.team_id = target_team_id
      and team_memberships.user_id = auth.uid()
  );
$$;

create or replace function public.current_user_can_access_backlog(target_backlog_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backlogs
    where backlogs.id = target_backlog_id
      and public.current_user_is_team_member(backlogs.team_id)
  );
$$;

create or replace function public.current_user_can_access_work_item(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_items
    where work_items.id = target_work_item_id
      and public.current_user_can_access_backlog(work_items.backlog_id)
  );
$$;

create or replace function public.current_user_can_manage_backlog()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

create function public.accept_pending_team_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := public.current_user_email();
  accepted_count integer := 0;
begin
  if auth.uid() is null or current_email = '' then
    return 0;
  end if;

  insert into public.team_memberships (team_id, user_id, role, member_kind, display_name)
  select
    team_invitations.team_id,
    auth.uid(),
    team_invitations.role,
    case when team_invitations.role = 'agent' then 'agent' else 'human' end,
    current_email
  from public.team_invitations
  where lower(team_invitations.email) = current_email
    and team_invitations.accepted_at is null
  on conflict (team_id, user_id) do nothing;

  update public.team_invitations
  set
    accepted_by_user_id = auth.uid(),
    accepted_at = now()
  where lower(email) = current_email
    and accepted_at is null;

  get diagnostics accepted_count = row_count;

  return accepted_count;
end;
$$;

create or replace function public.expire_stale_work_leases()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.work_leases
  set
    status = 'expired',
    ended_at = now(),
    release_reason = 'lease expired'
  where status = 'active'
    and expires_at <= now();

  update public.work_items
  set status = 'ready'
  where status in ('claimed', 'in_progress')
    and not exists (
      select 1
      from public.work_leases
      where work_leases.work_item_id = work_items.id
        and work_leases.status = 'active'
    );
end;
$$;

create or replace function public.work_item_to_json(target public.work_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', target.id,
    'backlogId', target.backlog_id,
    'title', target.title,
    'description', target.description,
    'repository', target.repository,
    'acceptanceCriteria', target.acceptance_criteria,
    'labels', target.labels,
    'status', target.status,
    'priorityRank', target.priority_rank,
    'assignee', target.assignee,
    'resultSummary', target.result_summary,
    'resultUrl', target.result_url,
    'createdAt', target.created_at,
    'updatedAt', target.updated_at
  );
$$;

drop function public.claim_next_work_item(text, text, text[], integer);

create function public.claim_next_work_item(
  worker_id text,
  worker_display_name text default null,
  worker_capabilities text[] default '{}',
  lease_seconds integer default 1800,
  target_backlog_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_item public.work_items%rowtype;
  selected_lease public.work_leases%rowtype;
  normalized_worker_id text := trim(worker_id);
  normalized_display_name text := coalesce(nullif(trim(worker_display_name), ''), normalized_worker_id);
  bounded_lease_seconds integer := greatest(60, least(coalesce(lease_seconds, 1800), 14400));
begin
  if normalized_worker_id = '' then
    raise exception 'worker_id is required';
  end if;

  if target_backlog_id is null then
    raise exception 'backlog_id is required';
  end if;

  if auth.role() <> 'service_role' and not public.current_user_can_access_backlog(target_backlog_id) then
    raise exception 'backlog is not visible to this worker';
  end if;

  perform public.expire_stale_work_leases();

  insert into public.workers (id, display_name, capabilities, last_seen_at)
  values (normalized_worker_id, normalized_display_name, coalesce(worker_capabilities, '{}'), now())
  on conflict (id) do update
  set
    display_name = excluded.display_name,
    capabilities = excluded.capabilities,
    last_seen_at = now();

  select *
  into selected_item
  from public.work_items
  where backlog_id = target_backlog_id
    and status = 'ready'
    and not exists (
      select 1
      from public.work_leases
      where work_leases.work_item_id = work_items.id
        and work_leases.status = 'active'
    )
  order by priority_rank asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.work_items
  set status = 'claimed'
  where id = selected_item.id
  returning * into selected_item;

  insert into public.work_leases (
    work_item_id,
    worker_id,
    status,
    heartbeat_at,
    expires_at
  )
  values (
    selected_item.id,
    normalized_worker_id,
    'active',
    now(),
    now() + make_interval(secs => bounded_lease_seconds)
  )
  returning * into selected_lease;

  insert into public.run_events (work_item_id, lease_id, worker_id, event_type, summary)
  values (selected_item.id, selected_lease.id, normalized_worker_id, 'claimed', 'Work item claimed.');

  return jsonb_build_object(
    'leaseToken', selected_lease.lease_token,
    'leaseExpiresAt', selected_lease.expires_at,
    'workItem', public.work_item_to_json(selected_item) || jsonb_build_object(
      'activeLease',
      public.active_lease_to_json(selected_lease)
    )
  );
end;
$$;

create or replace function public.heartbeat_work_lease(
  target_lease_token uuid,
  lease_seconds integer default 1800
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_lease public.work_leases%rowtype;
  bounded_lease_seconds integer := greatest(60, least(coalesce(lease_seconds, 1800), 14400));
begin
  perform public.expire_stale_work_leases();

  update public.work_leases
  set
    heartbeat_at = now(),
    expires_at = now() + make_interval(secs => bounded_lease_seconds)
  where lease_token = target_lease_token
    and status = 'active'
    and expires_at > now()
  returning * into selected_lease;

  if not found then
    raise exception 'active lease not found';
  end if;

  if auth.role() <> 'service_role' and not public.current_user_can_access_work_item(selected_lease.work_item_id) then
    raise exception 'lease is not visible to this worker';
  end if;

  update public.workers
  set last_seen_at = now()
  where id = selected_lease.worker_id;

  insert into public.run_events (work_item_id, lease_id, worker_id, event_type, summary)
  values (selected_lease.work_item_id, selected_lease.id, selected_lease.worker_id, 'heartbeat', 'Lease heartbeat received.');

  return jsonb_build_object(
    'leaseToken', selected_lease.lease_token,
    'leaseExpiresAt', selected_lease.expires_at
  );
end;
$$;

create or replace function public.release_work_lease(
  target_lease_token uuid,
  reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_lease public.work_leases%rowtype;
begin
  perform public.expire_stale_work_leases();

  update public.work_leases
  set
    status = 'released',
    ended_at = now(),
    release_reason = coalesce(reason, '')
  where lease_token = target_lease_token
    and status = 'active'
  returning * into selected_lease;

  if not found then
    raise exception 'active lease not found';
  end if;

  if auth.role() <> 'service_role' and not public.current_user_can_access_work_item(selected_lease.work_item_id) then
    raise exception 'lease is not visible to this worker';
  end if;

  update public.work_items
  set status = 'ready'
  where id = selected_lease.work_item_id;

  insert into public.run_events (work_item_id, lease_id, worker_id, event_type, summary)
  values (selected_lease.work_item_id, selected_lease.id, selected_lease.worker_id, 'released', coalesce(reason, 'Lease released.'));

  return jsonb_build_object('released', true);
end;
$$;

create or replace function public.complete_work_lease(
  target_lease_token uuid,
  result_summary text default '',
  result_url text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_lease public.work_leases%rowtype;
  selected_item public.work_items%rowtype;
begin
  perform public.expire_stale_work_leases();

  update public.work_leases
  set
    status = 'completed',
    ended_at = now()
  where lease_token = target_lease_token
    and status = 'active'
    and expires_at > now()
  returning * into selected_lease;

  if not found then
    raise exception 'active lease not found';
  end if;

  if auth.role() <> 'service_role' and not public.current_user_can_access_work_item(selected_lease.work_item_id) then
    raise exception 'lease is not visible to this worker';
  end if;

  update public.work_items
  set
    status = 'review',
    result_summary = coalesce(result_summary, ''),
    result_url = coalesce(result_url, '')
  where id = selected_lease.work_item_id
  returning * into selected_item;

  insert into public.run_events (work_item_id, lease_id, worker_id, event_type, summary)
  values (selected_lease.work_item_id, selected_lease.id, selected_lease.worker_id, 'completed', coalesce(result_summary, 'Worker completed the item.'));

  return public.work_item_to_json(selected_item);
end;
$$;

create or replace function public.fail_work_lease(
  target_lease_token uuid,
  error_summary text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_lease public.work_leases%rowtype;
  selected_item public.work_items%rowtype;
begin
  perform public.expire_stale_work_leases();

  update public.work_leases
  set
    status = 'failed',
    ended_at = now(),
    release_reason = coalesce(error_summary, '')
  where lease_token = target_lease_token
    and status = 'active'
  returning * into selected_lease;

  if not found then
    raise exception 'active lease not found';
  end if;

  if auth.role() <> 'service_role' and not public.current_user_can_access_work_item(selected_lease.work_item_id) then
    raise exception 'lease is not visible to this worker';
  end if;

  update public.work_items
  set
    status = 'blocked',
    result_summary = coalesce(error_summary, '')
  where id = selected_lease.work_item_id
  returning * into selected_item;

  insert into public.run_events (work_item_id, lease_id, worker_id, event_type, summary)
  values (selected_lease.work_item_id, selected_lease.id, selected_lease.worker_id, 'failed', coalesce(error_summary, 'Worker failed the item.'));

  return public.work_item_to_json(selected_item);
end;
$$;

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;
alter table public.team_invitations enable row level security;
alter table public.backlogs enable row level security;

create policy "Team members can read teams"
on public.teams
for select
to authenticated
using (public.current_user_is_team_member(id));

create policy "Team members can read memberships"
on public.team_memberships
for select
to authenticated
using (public.current_user_is_team_member(team_id));

create policy "Team members and invitees can read invitations"
on public.team_invitations
for select
to authenticated
using (
  public.current_user_is_team_member(team_id)
  or lower(email) = public.current_user_email()
);

create policy "Team members can read backlogs"
on public.backlogs
for select
to authenticated
using (public.current_user_is_team_member(team_id));

create policy "Team members can create backlogs"
on public.backlogs
for insert
to authenticated
with check (public.current_user_is_team_member(team_id));

create policy "Team members can update backlogs"
on public.backlogs
for update
to authenticated
using (public.current_user_is_team_member(team_id))
with check (public.current_user_is_team_member(team_id));

create policy "Team members can read work items"
on public.work_items
for select
to authenticated
using (public.current_user_can_access_backlog(backlog_id));

create policy "Team members can create work items"
on public.work_items
for insert
to authenticated
with check (public.current_user_can_access_backlog(backlog_id));

create policy "Team members can update work items"
on public.work_items
for update
to authenticated
using (public.current_user_can_access_backlog(backlog_id))
with check (public.current_user_can_access_backlog(backlog_id));

create policy "Team members can read workers"
on public.workers
for select
to authenticated
using (
  exists (
    select 1
    from public.work_leases
    inner join public.work_items on work_items.id = work_leases.work_item_id
    where work_leases.worker_id = workers.id
      and public.current_user_can_access_backlog(work_items.backlog_id)
  )
  or exists (
    select 1
    from public.run_events
    inner join public.work_items on work_items.id = run_events.work_item_id
    where run_events.worker_id = workers.id
      and public.current_user_can_access_backlog(work_items.backlog_id)
  )
);

create policy "Team members can read leases"
on public.work_leases
for select
to authenticated
using (public.current_user_can_access_work_item(work_item_id));

create policy "Team members can read run events"
on public.run_events
for select
to authenticated
using (
  work_item_id is not null
  and public.current_user_can_access_work_item(work_item_id)
);

grant usage on type public.work_item_status to authenticated;
grant usage on type public.work_lease_status to authenticated;
grant select on public.teams to authenticated;
grant select on public.team_memberships to authenticated;
grant select on public.team_invitations to authenticated;
grant select, insert, update on public.backlogs to authenticated;
grant select, insert, update on public.work_items to authenticated;
grant select on public.workers to authenticated;
grant select on public.work_leases to authenticated;
grant select on public.run_events to authenticated;
grant execute on function public.current_user_email() to authenticated;
grant execute on function public.current_user_is_team_member(uuid) to authenticated;
grant execute on function public.current_user_can_access_backlog(uuid) to authenticated;
grant execute on function public.current_user_can_access_work_item(uuid) to authenticated;
grant execute on function public.accept_pending_team_invitations() to authenticated;
grant execute on function public.expire_stale_work_leases() to authenticated;
grant execute on function public.claim_next_work_item(text, text, text[], integer, uuid) to authenticated;
grant execute on function public.heartbeat_work_lease(uuid, integer) to authenticated;
grant execute on function public.release_work_lease(uuid, text) to authenticated;
grant execute on function public.complete_work_lease(uuid, text, text) to authenticated;
grant execute on function public.fail_work_lease(uuid, text) to authenticated;

grant select, insert, update, delete on public.teams to service_role;
grant select, insert, update, delete on public.team_memberships to service_role;
grant select, insert, update, delete on public.team_invitations to service_role;
grant select, insert, update, delete on public.backlogs to service_role;
grant select, insert, update, delete on public.work_items to service_role;
grant select, insert, update, delete on public.workers to service_role;
grant select, insert, update, delete on public.work_leases to service_role;
grant select, insert, update, delete on public.run_events to service_role;
grant execute on function public.claim_next_work_item(text, text, text[], integer, uuid) to service_role;
grant execute on function public.heartbeat_work_lease(uuid, integer) to service_role;
grant execute on function public.release_work_lease(uuid, text) to service_role;
grant execute on function public.complete_work_lease(uuid, text, text) to service_role;
grant execute on function public.fail_work_lease(uuid, text) to service_role;

revoke execute on function public.current_user_email() from public, anon;
revoke execute on function public.current_user_is_team_member(uuid) from public, anon;
revoke execute on function public.current_user_can_access_backlog(uuid) from public, anon;
revoke execute on function public.current_user_can_access_work_item(uuid) from public, anon;
revoke execute on function public.accept_pending_team_invitations() from public, anon;
revoke execute on function public.work_item_to_json(public.work_items) from public, anon;
revoke execute on function public.active_lease_to_json(public.work_leases) from public, anon, authenticated;
revoke execute on function public.claim_next_work_item(text, text, text[], integer, uuid) from public, anon;
revoke execute on function public.heartbeat_work_lease(uuid, integer) from public, anon;
revoke execute on function public.release_work_lease(uuid, text) from public, anon;
revoke execute on function public.complete_work_lease(uuid, text, text) from public, anon;
revoke execute on function public.fail_work_lease(uuid, text) from public, anon;
