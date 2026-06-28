create type public.work_item_status as enum (
  'backlog',
  'ready',
  'claimed',
  'in_progress',
  'review',
  'testing',
  'blocked',
  'done',
  'cancelled'
);

create type public.work_lease_status as enum (
  'active',
  'released',
  'completed',
  'failed',
  'expired'
);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  repository text not null default '',
  acceptance_criteria text[] not null default '{}',
  labels text[] not null default '{}',
  status public.work_item_status not null default 'backlog',
  priority_rank integer not null default 1000,
  assignee text not null default '',
  result_summary text not null default '',
  result_url text not null default '',
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_items_title_not_blank check (length(trim(title)) > 0),
  constraint work_items_priority_rank_positive check (priority_rank > 0)
);

create table public.workers (
  id text primary key,
  display_name text not null,
  capabilities text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint workers_id_not_blank check (length(trim(id)) > 0),
  constraint workers_display_name_not_blank check (length(trim(display_name)) > 0)
);

create table public.work_leases (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  worker_id text not null references public.workers(id) on delete cascade,
  lease_token uuid not null default gen_random_uuid(),
  status public.work_lease_status not null default 'active',
  heartbeat_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  release_reason text not null default ''
);

create table public.run_events (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid references public.work_items(id) on delete cascade,
  lease_id uuid references public.work_leases(id) on delete set null,
  worker_id text not null default '',
  event_type text not null,
  summary text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint run_events_event_type_not_blank check (length(trim(event_type)) > 0)
);

create unique index work_leases_one_active_per_item
  on public.work_leases (work_item_id)
  where status = 'active';

create index work_items_queue_idx
  on public.work_items (status, priority_rank, created_at);

create index work_leases_active_expiry_idx
  on public.work_leases (status, expires_at);

create index run_events_work_item_created_idx
  on public.run_events (work_item_id, created_at desc);

create function public.touch_work_item_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger work_items_touch_updated_at
before update on public.work_items
for each row
execute function public.touch_work_item_updated_at();

create function public.current_user_can_manage_backlog()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

create function public.expire_stale_work_leases()
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

create function public.work_item_to_json(target public.work_items)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', target.id,
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

create function public.active_lease_to_json(target public.work_leases)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', target.id,
    'workerId', target.worker_id,
    'heartbeatAt', target.heartbeat_at,
    'expiresAt', target.expires_at
  );
$$;

create function public.claim_next_work_item(
  worker_id text,
  worker_display_name text default null,
  worker_capabilities text[] default '{}',
  lease_seconds integer default 1800
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
  where status = 'ready'
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

create function public.get_active_lease_by_token(target_lease_token uuid)
returns public.work_leases
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.work_leases
  where lease_token = target_lease_token
    and status = 'active'
    and expires_at > now()
  limit 1;
$$;

create function public.heartbeat_work_lease(
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

create function public.release_work_lease(
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

  update public.work_items
  set status = 'ready'
  where id = selected_lease.work_item_id;

  insert into public.run_events (work_item_id, lease_id, worker_id, event_type, summary)
  values (selected_lease.work_item_id, selected_lease.id, selected_lease.worker_id, 'released', coalesce(reason, 'Lease released.'));

  return jsonb_build_object('released', true);
end;
$$;

create function public.complete_work_lease(
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

create function public.fail_work_lease(
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

alter table public.work_items enable row level security;
alter table public.workers enable row level security;
alter table public.work_leases enable row level security;
alter table public.run_events enable row level security;

create policy "Authenticated users can read work items"
on public.work_items
for select
to authenticated
using (public.current_user_can_manage_backlog());

create policy "Authenticated users can create work items"
on public.work_items
for insert
to authenticated
with check (public.current_user_can_manage_backlog());

create policy "Authenticated users can update work items"
on public.work_items
for update
to authenticated
using (public.current_user_can_manage_backlog())
with check (public.current_user_can_manage_backlog());

create policy "Authenticated users can read workers"
on public.workers
for select
to authenticated
using (public.current_user_can_manage_backlog());

create policy "Authenticated users can read leases"
on public.work_leases
for select
to authenticated
using (public.current_user_can_manage_backlog());

create policy "Authenticated users can read run events"
on public.run_events
for select
to authenticated
using (public.current_user_can_manage_backlog());

grant usage on schema public to authenticated;
grant usage on type public.work_item_status to authenticated;
grant usage on type public.work_lease_status to authenticated;
grant select, insert, update on public.work_items to authenticated;
grant select on public.workers to authenticated;
grant select on public.work_leases to authenticated;
grant select on public.run_events to authenticated;
grant execute on function public.current_user_can_manage_backlog() to authenticated;
grant execute on function public.expire_stale_work_leases() to authenticated;

grant usage on schema public to service_role;
grant usage on type public.work_item_status to service_role;
grant usage on type public.work_lease_status to service_role;
grant select, insert, update, delete on public.work_items to service_role;
grant select, insert, update, delete on public.workers to service_role;
grant select, insert, update, delete on public.work_leases to service_role;
grant select, insert, update, delete on public.run_events to service_role;
grant execute on function public.claim_next_work_item(text, text, text[], integer) to service_role;
grant execute on function public.heartbeat_work_lease(uuid, integer) to service_role;
grant execute on function public.release_work_lease(uuid, text) to service_role;
grant execute on function public.complete_work_lease(uuid, text, text) to service_role;
grant execute on function public.fail_work_lease(uuid, text) to service_role;

revoke execute on function public.current_user_can_manage_backlog() from public, anon;
revoke execute on function public.expire_stale_work_leases() from public, anon;
revoke execute on function public.work_item_to_json(public.work_items) from public, anon, authenticated;
revoke execute on function public.active_lease_to_json(public.work_leases) from public, anon, authenticated;
revoke execute on function public.claim_next_work_item(text, text, text[], integer) from public, anon, authenticated;
revoke execute on function public.get_active_lease_by_token(uuid) from public, anon, authenticated;
revoke execute on function public.heartbeat_work_lease(uuid, integer) from public, anon, authenticated;
revoke execute on function public.release_work_lease(uuid, text) from public, anon, authenticated;
revoke execute on function public.complete_work_lease(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.fail_work_lease(uuid, text) from public, anon, authenticated;

insert into public.work_items (
  title,
  description,
  repository,
  acceptance_criteria,
  labels,
  status,
  priority_rank,
  assignee
)
values
  (
    'Create the first autonomous worker loop',
    'Add a Daedalus runner that claims exactly one ready item, runs Codex once, records events, and exits cleanly.',
    'TheWorstProgrammerEver/Project-Management',
    array[
      'Runner uses the worker claim API and never selects a task directly.',
      'A local process lock prevents overlapping runner processes on Daedalus.',
      'A dry-run mode prints the selected prompt without running Codex.'
    ],
    array['agent-loop', 'runner'],
    'backlog',
    10,
    'Daedalus'
  ),
  (
    'Expose worker API reference in the app',
    'Keep the first operator-facing API docs close to the backlog so a human can inspect the claim contract over LAN.',
    'TheWorstProgrammerEver/Project-Management',
    array[
      'Authenticated users can see worker actions and required fields.',
      'The docs include the local LAN function endpoint shape.',
      'The docs state that duplicate prevention is enforced by database leases.'
    ],
    array['docs', 'api'],
    'ready',
    20,
    'Daedalus'
  ),
  (
    'Track bootstrap progress visibility follow-up',
    'Follow-up from the boot-drive CLI PR: make first-boot bootstrap progress visible from console or a status command.',
    'TheWorstProgrammerEver/Codex-Create-Agent-Boot-Drive-CLI',
    array[
      'Progress view distinguishes done, in progress, remaining, and blocked setup steps.',
      'The design does not require Codex auth to be complete.',
      'The task links back to GitHub issue #3.'
    ],
    array['boot-drive', 'status'],
    'ready',
    30,
    'Daedalus'
  );
