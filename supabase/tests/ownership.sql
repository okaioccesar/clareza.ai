-- Rollback-only integration test: no users, sessions or records remain afterwards.
begin;
select set_config('clareza.test_a', gen_random_uuid()::text, true), set_config('clareza.test_b', gen_random_uuid()::text, true);
select set_config('clareza.write_id', gen_random_uuid()::text, true);
insert into auth.users(id, email, aud, role) values
  (current_setting('clareza.test_a')::uuid, 'clareza-rls-a@test.invalid', 'authenticated', 'authenticated'),
  (current_setting('clareza.test_b')::uuid, 'clareza-rls-b@test.invalid', 'authenticated', 'authenticated');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('clareza.test_a'), 'role', 'authenticated')::text, true);
do $$
declare payload jsonb := '{"version":3,"tasks":[],"projects":[],"pages":[],"areas":[],"daily":{},"scratch":"owner A"}'; result jsonb;
begin
  result := public.write_account_workspace(payload, 0, current_setting('clareza.write_id')::uuid);
  if result->>'revision' <> '1' then raise exception 'Initial revision failed'; end if;
  result := public.write_account_workspace(payload, 0, current_setting('clareza.write_id')::uuid);
  if result->>'revision' <> '1' or result->>'status' <> 'ok' then raise exception 'Idempotency failed'; end if;
  result := public.write_account_workspace(payload, 0, gen_random_uuid());
  if result->>'status' <> 'conflict' then raise exception 'Stale write was accepted'; end if;
  result := public.write_account_workspace(payload || '{"scratch":"updated"}', 1, gen_random_uuid());
  if result->>'revision' <> '2' then raise exception 'Revision update failed'; end if;
  if public.read_account_workspace()->'data'->>'scratch' <> 'updated' then raise exception 'Read failed'; end if;
end;
$$;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('clareza.test_b'), 'role', 'authenticated')::text, true);
do $$
declare affected integer;
begin
  if public.read_account_workspace()->>'revision' <> '0' then raise exception 'Cross-account read'; end if;
  update private.account_workspaces set data = data || '{"scratch":"attacked"}' where user_id = current_setting('clareza.test_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-account update'; end if;
  begin
    insert into private.account_workspaces(user_id,revision,data,last_write_id)
    values(current_setting('clareza.test_a')::uuid,1,'{"version":3,"tasks":[],"projects":[],"pages":[],"areas":[],"daily":{},"scratch":""}',gen_random_uuid());
    raise exception 'Cross-account insert was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role anon;
do $$
begin
  begin perform public.read_account_workspace();raise exception 'Anonymous read was accepted';exception when insufficient_privilege then null;end;
end;
$$;
reset role;
select 'Ownership, anonymous denial, atomic revisions and idempotency passed' as result;
rollback;
