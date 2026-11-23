-- core_v83 · Avisos leídos compartidos entre dispositivos (antes vivían en localStorage de cada navegador).
-- La app marca con app_avisos_marcar(ids) y al cargar une app_avisos_leidos() con lo local. Se guardan 60 días.
create table if not exists core.avisos_leidos (
  user_id uuid not null,
  aviso_id text not null,
  leido_en timestamptz not null default now(),
  primary key (user_id, aviso_id)
);
alter table core.avisos_leidos enable row level security;
revoke all on core.avisos_leidos from anon, authenticated;

create or replace function public.app_avisos_leidos() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform core.exigir_usuario();
  return coalesce((select jsonb_agg(aviso_id) from core.avisos_leidos where user_id = auth.uid() and leido_en > now() - interval '60 days'), '[]'::jsonb);
end $$;

create or replace function public.app_avisos_marcar(p_ids text[]) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  perform core.exigir_usuario();
  insert into core.avisos_leidos (user_id, aviso_id)
  select auth.uid(), x from unnest(coalesce(p_ids, '{}')) x where length(x) between 1 and 300
  on conflict do nothing;
  get diagnostics n = row_count;
  delete from core.avisos_leidos where user_id = auth.uid() and leido_en < now() - interval '60 days';
  return jsonb_build_object('ok', true, 'nuevos', n);
end $$;

revoke all on function public.app_avisos_leidos() from public, anon;
revoke all on function public.app_avisos_marcar(text[]) from public, anon;
grant execute on function public.app_avisos_leidos() to authenticated;
grant execute on function public.app_avisos_marcar(text[]) to authenticated;
