-- Run as the SQL editor owner. All test records are rolled back.
begin;
do $$
begin
  if has_table_privilege('anon','public.whatsapp_inbox','SELECT')
    or has_table_privilege('authenticated','public.whatsapp_inbox','SELECT')
    or has_table_privilege('anon','public.whatsapp_inbox','INSERT')
    or has_table_privilege('authenticated','public.whatsapp_inbox','INSERT') then
    raise exception 'Inbox must not be accessible from the browser';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.whatsapp_inbox'::regclass) then
    raise exception 'RLS must be enabled';
  end if;
  insert into public.whatsapp_inbox(phone_number_id,message_id,sender,message_type,body)
  values ('00000001','test-clarity-rollback','0000000001','text','Original');
  insert into public.whatsapp_inbox(phone_number_id,message_id,sender,message_type,body)
  values ('00000001','test-clarity-rollback','0000000001','text','Duplicate')
  on conflict (phone_number_id,message_id) do nothing;
  if (select count(*) from public.whatsapp_inbox where phone_number_id='00000001' and message_id='test-clarity-rollback') <> 1
    or (select body from public.whatsapp_inbox where phone_number_id='00000001' and message_id='test-clarity-rollback') <> 'Original' then
    raise exception 'Duplicate must preserve original message';
  end if;
end $$;
rollback;
