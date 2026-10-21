-- One versioned document per account preserves the existing workspace atomically.
-- The private schema is not exposed by the Data API. RPCs run under the user's RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table private.account_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  data jsonb not null,
  last_write_id uuid not null,
  updated_at timestamptz not null default now(),
  constraint workspace_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['version','tasks','projects','pages','areas','daily','scratch']
    and data->>'version' = '3'
    and jsonb_typeof(data->'tasks') = 'array'
    and jsonb_typeof(data->'projects') = 'array'
    and jsonb_typeof(data->'pages') = 'array'
    and jsonb_typeof(data->'areas') = 'array'
    and jsonb_typeof(data->'daily') = 'object'
    and jsonb_typeof(data->'scratch') = 'string'
    and octet_length(data::text) <= 2097152
  )
);
alter table private.account_workspaces enable row level security;
revoke all on private.account_workspaces from public, anon, authenticated;
grant select, insert, update on private.account_workspaces to authenticated;
create policy workspace_owner_read on private.account_workspaces for select to authenticated using ((select auth.uid()) = user_id);
create policy workspace_owner_insert on private.account_workspaces for insert to authenticated with check ((select auth.uid()) = user_id);
create policy workspace_owner_update on private.account_workspaces for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.read_account_workspace() returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  select jsonb_build_object('revision', revision, 'data', data, 'updatedAt', updated_at)
    into result from private.account_workspaces where user_id = auth.uid();
  return coalesce(result, jsonb_build_object('revision', 0, 'data', null, 'updatedAt', null));
end;
$$;

create function public.write_account_workspace(payload jsonb, expected_revision bigint, write_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare current_row private.account_workspaces; result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if expected_revision is null or expected_revision < 0 or write_id is null then
    raise invalid_parameter_value using message = 'Invalid revision or write ID';
  end if;
  if expected_revision = 0 then
    insert into private.account_workspaces(user_id, revision, data, last_write_id)
      values (auth.uid(), 1, payload, write_id) on conflict (user_id) do nothing
      returning jsonb_build_object('status', 'ok', 'revision', revision, 'updatedAt', updated_at) into result;
    if result is not null then return result; end if;
  end if;
  select * into current_row from private.account_workspaces where user_id = auth.uid() for update;
  if not found then return jsonb_build_object('status', 'conflict', 'revision', 0, 'data', null); end if;
  if current_row.last_write_id = write_id and current_row.data = payload then
    return jsonb_build_object('status', 'ok', 'revision', current_row.revision, 'updatedAt', current_row.updated_at);
  end if;
  if current_row.revision <> expected_revision then
    return jsonb_build_object('status', 'conflict', 'revision', current_row.revision, 'data', current_row.data, 'updatedAt', current_row.updated_at);
  end if;
  update private.account_workspaces set data = payload, revision = revision + 1, last_write_id = write_id, updated_at = now()
    where user_id = auth.uid()
    returning jsonb_build_object('status', 'ok', 'revision', revision, 'updatedAt', updated_at) into result;
  return result;
end;
$$;

revoke all on function public.read_account_workspace() from public, anon;
revoke all on function public.write_account_workspace(jsonb, bigint, uuid) from public, anon;
grant execute on function public.read_account_workspace() to authenticated;
grant execute on function public.write_account_workspace(jsonb, bigint, uuid) to authenticated;
