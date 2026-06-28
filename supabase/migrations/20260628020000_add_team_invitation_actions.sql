drop policy if exists "Team members can read teams" on public.teams;

create policy "Team members and invitees can read teams"
on public.teams
for select
to authenticated
using (
  public.current_user_is_team_member(id)
  or exists (
    select 1
    from public.team_invitations
    where team_invitations.team_id = teams.id
      and lower(team_invitations.email) = public.current_user_email()
      and team_invitations.accepted_at is null
  )
);

create or replace function public.team_invitation_to_json(target public.team_invitations)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', target.id,
    'teamId', target.team_id,
    'email', target.email,
    'role', target.role,
    'acceptedAt', target.accepted_at,
    'createdAt', target.created_at
  );
$$;

create or replace function public.invite_team_member(
  target_team_id uuid,
  invitee_email text,
  target_role text default 'member'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(invitee_email));
  normalized_role text := coalesce(nullif(trim(target_role), ''), 'member');
  existing_user_id uuid;
  selected_invitation public.team_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before inviting a team member.';
  end if;

  if not public.current_user_is_team_member(target_team_id) then
    raise exception 'Only team members can invite people to this team.';
  end if;

  if normalized_email = '' or position('@' in normalized_email) < 2 then
    raise exception 'Enter a valid email address.';
  end if;

  if normalized_role not in ('owner', 'maintainer', 'member', 'agent') then
    raise exception 'Unsupported team role.';
  end if;

  select id
  into existing_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if existing_user_id is not null and exists (
    select 1
    from public.team_memberships
    where team_id = target_team_id
      and user_id = existing_user_id
  ) then
    raise exception 'That user is already a team member.';
  end if;

  insert into public.team_invitations (
    team_id,
    email,
    role,
    invited_by_user_id
  )
  values (
    target_team_id,
    normalized_email,
    normalized_role,
    auth.uid()
  )
  on conflict do nothing;

  select *
  into selected_invitation
  from public.team_invitations
  where team_id = target_team_id
    and lower(email) = normalized_email
    and accepted_at is null
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'Could not create invitation.';
  end if;

  return public.team_invitation_to_json(selected_invitation);
end;
$$;

create or replace function public.accept_team_invitation(target_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_invitation public.team_invitations%rowtype;
  current_email text := public.current_user_email();
begin
  if auth.uid() is null or current_email = '' then
    raise exception 'Sign in before accepting an invitation.';
  end if;

  select *
  into selected_invitation
  from public.team_invitations
  where id = target_invitation_id
    and accepted_at is null;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  if lower(selected_invitation.email) <> current_email then
    raise exception 'This invitation belongs to another email address.';
  end if;

  insert into public.team_memberships (
    team_id,
    user_id,
    role,
    member_kind,
    display_name
  )
  values (
    selected_invitation.team_id,
    auth.uid(),
    selected_invitation.role,
    case when selected_invitation.role = 'agent' then 'agent' else 'human' end,
    coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''), current_email)
  )
  on conflict (team_id, user_id) do nothing;

  update public.team_invitations
  set
    accepted_by_user_id = auth.uid(),
    accepted_at = now()
  where id = selected_invitation.id
  returning * into selected_invitation;

  return public.team_invitation_to_json(selected_invitation);
end;
$$;

create or replace function public.reject_team_invitation(target_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_invitation public.team_invitations%rowtype;
  current_email text := public.current_user_email();
begin
  if auth.uid() is null or current_email = '' then
    raise exception 'Sign in before rejecting an invitation.';
  end if;

  select *
  into selected_invitation
  from public.team_invitations
  where id = target_invitation_id
    and accepted_at is null;

  if not found then
    raise exception 'Invitation not found.';
  end if;

  if lower(selected_invitation.email) <> current_email then
    raise exception 'This invitation belongs to another email address.';
  end if;

  delete from public.team_invitations
  where id = selected_invitation.id;

  return jsonb_build_object(
    'id', selected_invitation.id,
    'teamId', selected_invitation.team_id
  );
end;
$$;

grant execute on function public.team_invitation_to_json(public.team_invitations) to service_role;
grant execute on function public.invite_team_member(uuid, text, text) to authenticated;
grant execute on function public.accept_team_invitation(uuid) to authenticated;
grant execute on function public.reject_team_invitation(uuid) to authenticated;

revoke execute on function public.team_invitation_to_json(public.team_invitations) from public, anon, authenticated;
revoke execute on function public.invite_team_member(uuid, text, text) from public, anon;
revoke execute on function public.accept_team_invitation(uuid) from public, anon;
revoke execute on function public.reject_team_invitation(uuid) from public, anon;
