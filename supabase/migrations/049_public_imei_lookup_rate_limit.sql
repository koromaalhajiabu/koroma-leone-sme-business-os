-- Public IMEI identification rate limit. Stores only a one-way IP hash, never the raw address or IMEI.
begin;
create table if not exists public.device_imei_lookup_rate_limits(
  ip_hash text primary key,
  last_requested_at timestamptz not null default now()
);
alter table public.device_imei_lookup_rate_limits enable row level security;
revoke all on public.device_imei_lookup_rate_limits from anon,authenticated,public;

create or replace function public.claim_public_imei_lookup(p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_last timestamptz;
begin
 if p_ip_hash is null or length(p_ip_hash)<32 or length(p_ip_hash)>128 then return false; end if;
 insert into public.device_imei_lookup_rate_limits(ip_hash,last_requested_at)
 values(p_ip_hash,now())
 on conflict(ip_hash) do update
 set last_requested_at=excluded.last_requested_at
 where public.device_imei_lookup_rate_limits.last_requested_at < now()-interval '30 seconds'
 returning last_requested_at into v_last;
 return v_last is not null;
end;
$$;
revoke all on function public.claim_public_imei_lookup(text) from public,anon,authenticated;
grant execute on function public.claim_public_imei_lookup(text) to service_role;
commit;
