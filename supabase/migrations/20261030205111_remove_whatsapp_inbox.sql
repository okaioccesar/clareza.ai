-- Integration cancelled. Fail rather than delete any messages received since inspection.
do $$
begin
  if to_regclass('public.whatsapp_inbox') is not null then
    lock table public.whatsapp_inbox in access exclusive mode;
    if exists (select 1 from public.whatsapp_inbox) then
      raise exception 'WhatsApp inbox is not empty; preserve messages before removal';
    end if;
    drop table public.whatsapp_inbox;
  end if;
end $$;
