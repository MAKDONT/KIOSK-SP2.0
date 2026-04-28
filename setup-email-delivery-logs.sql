-- Email delivery tracking tables for SendGrid webhook receive-time logging
-- Run this in Supabase SQL editor before enabling webhook ingestion.

create table if not exists public.email_delivery_logs (
  id bigserial primary key,
  tracking_id text not null unique,
  message_id text,
  recipient_email text,
  subject text,
  send_started_at timestamptz,
  send_completed_at timestamptz,
  send_duration_ms integer,
  send_status_code text,
  processed_at timestamptz,
  delivered_at timestamptz,
  deferred_at timestamptz,
  bounced_at timestamptz,
  dropped_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  receive_duration_ms integer,
  last_event text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_email_delivery_logs_message_id
  on public.email_delivery_logs (message_id);

create index if not exists idx_email_delivery_logs_recipient_email
  on public.email_delivery_logs (recipient_email);

create index if not exists idx_email_delivery_logs_delivered_at
  on public.email_delivery_logs (delivered_at);

create table if not exists public.email_delivery_events (
  id bigserial primary key,
  tracking_id text,
  message_id text,
  recipient_email text,
  event_type text not null,
  event_timestamp timestamptz,
  sendgrid_event_id text,
  reason text,
  status text,
  response text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_delivery_events_tracking_id
  on public.email_delivery_events (tracking_id);

create index if not exists idx_email_delivery_events_message_id
  on public.email_delivery_events (message_id);

create index if not exists idx_email_delivery_events_type_time
  on public.email_delivery_events (event_type, event_timestamp);

create index if not exists idx_email_delivery_events_sendgrid_event_id
  on public.email_delivery_events (sendgrid_event_id);
