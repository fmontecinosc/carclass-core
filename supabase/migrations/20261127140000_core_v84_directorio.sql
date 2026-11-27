-- core_v84 · Módulo Directorio (27-nov-2026, Felipe).
-- Tablero central del Directorio de agentes: bitácora, pendientes, alertas y marcador semanal por unidad.
-- Lo leen y escriben los agentes de Claude (conector Supabase) y la app Core (módulo «Directorio», solo dueño).
-- Idempotente: el esquema se creó el 27-nov por MCP; este archivo lo versiona y agrega las funciones app_dir_*.

create schema if not exists dir;

create table if not exists dir.bitacora (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  fecha date not null default (now() at time zone 'America/Santiago')::date,
  agente text not null check (agente in ('director','comercial','marketing','operaciones','finanzas','estrategia','asesor_wa','felipe')),
  unidad text not null check (unidad in ('holding','blackgps','somosb2b','carclass','nom','carwash')),
  tipo text not null check (tipo in ('avance','retroceso','prueba','decision','bloqueo','nota')),
  titulo text not null,
  detalle text,
  fuente text,
  ref text
);
create index if not exists bitacora_fecha_idx on dir.bitacora (fecha desc);

create table if not exists dir.marcador (
  id uuid primary key default gen_random_uuid(),
  semana date not null,
  unidad text not null check (unidad in ('holding','blackgps','somosb2b','carclass','nom','carwash')),
  kpi text not null,
  tipo text not null default 'resultado' check (tipo in ('actividad','resultado')),
  meta numeric, real numeric, medida text, fuente text, nota text,
  orden int default 0,
  actualizado_en timestamptz not null default now(),
  unique (semana, unidad, kpi)
);

create table if not exists dir.alertas (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  unidad text not null check (unidad in ('holding','blackgps','somosb2b','carclass','nom','carwash')),
  agente text,
  prioridad text not null default 'media' check (prioridad in ('alta','media','baja')),
  titulo text not null,
  detalle text,
  estado text not null default 'abierta' check (estado in ('abierta','resuelta','descartada')),
  resuelta_en timestamptz
);

create table if not exists dir.pendientes (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unidad text not null check (unidad in ('holding','blackgps','somosb2b','carclass','nom','carwash')),
  area text check (area in ('direccion','comercial','marketing','operaciones','finanzas','estrategia','asesor_wa','postventa')),
  titulo text not null,
  detalle text,
  dueno text not null default 'felipe',
  fecha_compromiso date,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','bloqueado','hecho','descartado')),
  prioridad int default 2 check (prioridad between 1 and 4),
  origen text
);

create or replace function dir.tocar() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;
drop trigger if exists t_pend on dir.pendientes;
create trigger t_pend before update on dir.pendientes for each row execute function dir.tocar();
drop trigger if exists t_marc on dir.marcador;
create trigger t_marc before update on dir.marcador for each row execute function dir.tocar();

alter table dir.bitacora enable row level security;
alter table dir.marcador enable row level security;
alter table dir.alertas enable row level security;
alter table dir.pendientes enable row level security;

-- Salud diaria del asesor de WhatsApp (14 días)
create or replace view dir.v_asesor_wa as
select d::date as dia,
  (select count(*) from wa.conversaciones c where (c.creado_en at time zone 'America/Santiago')::date = d::date and c.estado in ('lead','sin_unidad')) as leads_nuevos,
  (select count(*) from wa.conversaciones c where (c.creado_en at time zone 'America/Santiago')::date = d::date and c.referral is not null) as desde_anuncio,
  (select count(*) from wa.agente_log l where (l.creado_en at time zone 'America/Santiago')::date = d::date and l.error is null) as respuestas_ok,
  (select count(*) from wa.agente_log l where (l.creado_en at time zone 'America/Santiago')::date = d::date and l.error is not null) as errores,
  (select round(coalesce(sum(l.costo_usd),0)::numeric,2) from wa.agente_log l where (l.creado_en at time zone 'America/Santiago')::date = d::date) as costo_usd,
  (select left(max(l.error),160) from wa.agente_log l where (l.creado_en at time zone 'America/Santiago')::date = d::date and l.error is not null) as ultimo_error
from generate_series((now() at time zone 'America/Santiago')::date - 13, (now() at time zone 'America/Santiago')::date, interval '1 day') d;

-- Embudo por unidad (30 días)
create or replace view dir.v_embudo as
select unidad, etapa, estado, count(*) n, coalesce(sum(monto_estimado),0) monto
from crm.oportunidades where creado_en > now() - interval '30 days'
group by 1,2,3;

-- Todo el tablero en un JSON (lo leen los agentes: select d from dir.v_tablero)
create or replace view dir.v_tablero as
select json_build_object(
 'generado', to_char(now() at time zone 'America/Santiago','YYYY-MM-DD HH24:MI'),
 'pend',(select coalesce(json_agg(json_build_object('id',id,'unidad',unidad,'area',area,'titulo',titulo,'detalle',detalle,'dueno',dueno,'fecha',fecha_compromiso,'estado',estado,'prioridad',prioridad,'origen',origen) order by prioridad, fecha_compromiso nulls last),'[]'::json) from dir.pendientes where estado not in ('hecho','descartado')),
 'hechos',(select coalesce(json_agg(json_build_object('id',id,'unidad',unidad,'titulo',titulo,'actualizado',to_char(actualizado_en at time zone 'America/Santiago','YYYY-MM-DD')) order by actualizado_en desc),'[]'::json) from (select * from dir.pendientes where estado='hecho' order by actualizado_en desc limit 20) h),
 'alert',(select coalesce(json_agg(json_build_object('id',id,'unidad',unidad,'prioridad',prioridad,'titulo',titulo,'detalle',detalle,'fecha',to_char(creado_en at time zone 'America/Santiago','YYYY-MM-DD')) order by case prioridad when 'alta' then 1 when 'media' then 2 else 3 end, creado_en desc),'[]'::json) from dir.alertas where estado='abierta'),
 'bit',(select coalesce(json_agg(json_build_object('fecha',fecha,'agente',agente,'unidad',unidad,'tipo',tipo,'titulo',titulo,'detalle',detalle,'fuente',fuente) order by fecha desc, creado_en desc),'[]'::json) from (select * from dir.bitacora order by fecha desc, creado_en desc limit 80) b),
 'marc',(select coalesce(json_agg(json_build_object('semana',semana,'unidad',unidad,'kpi',kpi,'tipo',tipo,'meta',meta,'real',real,'medida',medida,'fuente',fuente,'nota',nota) order by unidad, orden),'[]'::json) from dir.marcador where semana=(select max(semana) from dir.marcador)),
 'wa',(select coalesce(json_agg(w order by dia desc),'[]'::json) from dir.v_asesor_wa w),
 'emb',(select coalesce(json_agg(e),'[]'::json) from dir.v_embudo e)
) as d;

-- ---------- funciones de la app (solo dueño) ----------
create or replace function public.app_directorio()
returns json language plpgsql security definer set search_path = '' stable as $$
declare r json;
begin
  if not core.es_dueno() then raise exception 'El Directorio es solo para el dueño'; end if;
  select d into r from dir.v_tablero;
  return r;
end $$;

create or replace function public.app_dir_pendiente(p_id uuid, p_estado text)
returns void language plpgsql security definer set search_path = '' as $$
declare t text; u text;
begin
  if not core.es_dueno() then raise exception 'El Directorio es solo para el dueño'; end if;
  if p_estado not in ('pendiente','en_curso','bloqueado','hecho','descartado') then raise exception 'Estado no válido'; end if;
  update dir.pendientes set estado = p_estado where id = p_id returning titulo, unidad into t, u;
  if t is null then raise exception 'El pendiente no existe'; end if;
  insert into dir.bitacora (agente, unidad, tipo, titulo, fuente)
  values ('felipe', u, case when p_estado = 'hecho' then 'avance' when p_estado = 'bloqueado' then 'bloqueo' else 'nota' end,
          'Pendiente ' || replace(p_estado, '_', ' ') || ': ' || t, 'App Core · Directorio');
end $$;

create or replace function public.app_dir_alerta(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not core.es_dueno() then raise exception 'El Directorio es solo para el dueño'; end if;
  update dir.alertas set estado = 'resuelta', resuelta_en = now() where id = p_id and estado = 'abierta';
end $$;

create or replace function public.app_dir_nota(p_unidad text, p_tipo text, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
declare tx text := left(btrim(coalesce(p_texto, '')), 2000);
begin
  if not core.es_dueno() then raise exception 'El Directorio es solo para el dueño'; end if;
  if tx = '' then raise exception 'Escribe la nota'; end if;
  insert into dir.bitacora (agente, unidad, tipo, titulo, detalle, fuente)
  values ('felipe', p_unidad, p_tipo, left(split_part(tx, E'\n', 1), 140), tx, 'App Core · nota al Director');
end $$;

create or replace function public.app_dir_pendiente_nuevo(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not core.es_dueno() then raise exception 'El Directorio es solo para el dueño'; end if;
  if coalesce(btrim(p->>'titulo'), '') = '' then raise exception 'Escribe el pendiente'; end if;
  insert into dir.pendientes (unidad, area, titulo, detalle, dueno, fecha_compromiso, prioridad, origen)
  values (p->>'unidad', nullif(p->>'area', ''), btrim(p->>'titulo'), nullif(btrim(p->>'detalle'), ''), coalesce(nullif(p->>'dueno', ''), 'felipe'),
          nullif(p->>'fecha', '')::date, coalesce((p->>'prioridad')::int, 2), 'App Core')
  returning id into v;
  return v;
end $$;

revoke all on function public.app_directorio() from public, anon;
revoke all on function public.app_dir_pendiente(uuid, text) from public, anon;
revoke all on function public.app_dir_alerta(uuid) from public, anon;
revoke all on function public.app_dir_nota(text, text, text) from public, anon;
revoke all on function public.app_dir_pendiente_nuevo(jsonb) from public, anon;
grant execute on function public.app_directorio() to authenticated;
grant execute on function public.app_dir_pendiente(uuid, text) to authenticated;
grant execute on function public.app_dir_alerta(uuid) to authenticated;
grant execute on function public.app_dir_nota(text, text, text) to authenticated;
grant execute on function public.app_dir_pendiente_nuevo(jsonb) to authenticated;
