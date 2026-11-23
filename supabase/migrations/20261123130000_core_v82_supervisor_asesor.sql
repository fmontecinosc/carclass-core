-- core_v82 · Chat de Felipe con el asesor (Conversaciones → Instrucciones). Lo atiende wa-agente/supervisor.ts
-- (POST /functions/v1/wa-agente/supervisor con el JWT del dueño). Las reglas generales viven en
-- wa.config['agente_reglas_felipe'] (JSON [{texto, desde}]) y prompt.ts las suma al prompt del asesor.
create table if not exists wa.supervisor_mensajes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rol text not null check (rol in ('felipe', 'asesor')),
  texto text not null,
  acciones jsonb,
  creado_en timestamptz not null default now()
);
create index if not exists supervisor_mensajes_user_idx on wa.supervisor_mensajes (user_id, creado_en desc);
alter table wa.supervisor_mensajes enable row level security;
revoke all on wa.supervisor_mensajes from anon, authenticated;

create or replace function public.app_supervisor_historial(p_limite int default 60) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform core.exigir_usuario();
  if not core.es_dueno() then raise exception 'Solo el dueño'; end if;
  return jsonb_build_object(
    'mensajes', coalesce((select jsonb_agg(jsonb_build_object('rol', rol, 'texto', texto, 'acciones', acciones, 'creado_en', creado_en) order by creado_en)
       from (select * from wa.supervisor_mensajes where user_id = auth.uid() order by creado_en desc limit greatest(1, least(p_limite, 200))) t), '[]'::jsonb),
    'reglas', coalesce((select valor::jsonb from wa.config where clave = 'agente_reglas_felipe'), '[]'::jsonb));
end $$;
revoke all on function public.app_supervisor_historial(int) from public, anon;
grant execute on function public.app_supervisor_historial(int) to authenticated;
