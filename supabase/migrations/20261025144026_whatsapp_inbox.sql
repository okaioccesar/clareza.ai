create table public.whatsapp_inbox (
  phone_number_id text not null check (phone_number_id ~ '^[0-9]{5,20}$'),
  message_id text not null check (char_length(message_id) between 1 and 512),
  sender text not null check (sender ~ '^[0-9]{7,15}$'),
  message_type text not null check (char_length(message_type) between 1 and 50),
  body text check (body is null or char_length(body) between 1 and 4096),
  status text not null default 'pending' check (status in ('pending','unsupported','processed','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  primary key (phone_number_id,message_id)
);
alter table public.whatsapp_inbox enable row level security;
revoke all on public.whatsapp_inbox from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_inbox to service_role;
create index whatsapp_inbox_pending on public.whatsapp_inbox (received_at) where status = 'pending';
comment on table public.whatsapp_inbox is 'Server-only WhatsApp pilot inbox. Not linked to user workspaces; no browser access. No automatic replies.';
