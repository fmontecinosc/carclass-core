-- core_v87 · Directorio por área (27-nov-2026, Felipe).
-- Resumen de Comercial, Marketing, Operaciones, Finanzas y Postventa: rutinas programadas del mes,
-- tareas abiertas, vencidas, bloqueadas y hechas en el mes. Junta dir.pendientes (agentes) y ops.tareas (Core).

create table if not exists dir.rutinas (
  id uuid primary key default gen_random_uuid(),
  area text not null check (area in ('direccion','comercial','marketing','operaciones','finanzas','postventa')),
  agente text not null,
  nombre text not null unique,
  cuando text not null,
  entrega text,
  estado text not null default 'activa' check (estado in ('activa','pausada','por_crear')),
  necesita_pc boolean not null default false,
  ultima_ejecucion timestamptz,
  ultimo_resultado text,
  orden int default 0
);
alter table dir.rutinas enable row level security;

insert into dir.rutinas (area, agente, nombre, cuando, entrega, estado, necesita_pc, orden) values
('direccion','director','Plan del día','L–V 07:52','Plan en bloques, 3 cosas y alertas','activa',false,1),
('direccion','director','Pulso de mediodía','L–V 13:00','Qué cambió, 3 alertas y qué se mueve a la tarde','por_crear',false,2),
('direccion','director','Revisión semanal','Viernes','Semáforo por unidad, metas de la semana siguiente','por_crear',false,3),
('comercial','comercial','Cola de llamadas BlackGPS','L–V 07:38','20 llamadas filtradas por potencial + objeciones','activa',true,1),
('comercial','comercial','Vigía de leads Asisma','L–S cada hora 08:07–20:07','Aviso de leads por aceptar + fichas','activa',true,2),
('comercial','comercial','Cierre comercial del día','L–V 18:23','Marcador + seguimientos de mañana','activa',true,3),
('marketing','marketing','Lote semanal de contenido Carclass','Lunes 07:44','Lote IG + doc puente de la semana','activa',false,1),
('finanzas','finanzas','Renovar base financiera en Drive','Lunes 07:17','5 planillas en Drive + resumen','activa',false,1),
('finanzas','finanzas','UF del mes para facturación','Día 1, 07:47','UF y MRR de referencia','activa',false,2),
('finanzas','finanzas','Corte de cobranza BlackGPS','Día 25 y día 1, 09:23','Tabla de cobranza + textos listos','activa',true,3),
('finanzas','finanzas','Validación del MRR del mes','Último viernes, 09:47','Facturación del mes siguiente validada','activa',true,4),
('finanzas','finanzas','Emisión del MRR en Maxxa','Primer día hábil, 08:43','Facturas emitidas (con aprobación)','activa',true,5),
('postventa','core','Seguimientos automáticos al ganar','Al cerrar una venta','Tareas de 48 h, 5 días, 30 días y 6 meses (Carclass, Carwash.hf, NOM)','activa',false,1)
on conflict (nombre) do nothing;

-- Área de una tarea de Core según su título
create or replace function dir.area_tarea(t text) returns text language sql immutable as $$
  select case
    when t ilike '[Cobranza]%' or t ilike '%factur%' then 'finanzas'
    when t ~* '^Seguimiento (48 h|5 días|30 días|6 meses)' then 'postventa'
    when t ilike '[PPF]%' or t ilike '[NOM] Preparar%' then 'operaciones'
    else 'comercial' end
$$;

create or replace view dir.v_areas as
with hoy as (select (now() at time zone 'America/Santiago')::date d),
items as (
  select coalesce(case when p.area = 'asesor_wa' then 'comercial' else p.area end, 'direccion') area, 'directorio' fuente, p.id, p.titulo, p.unidad,
         p.dueno, p.fecha_compromiso fecha, p.estado, p.prioridad, p.actualizado_en
  from dir.pendientes p
  union all
  select dir.area_tarea(t.titulo), 'core', t.id, t.titulo, t.unidad, lower(coalesce(t.responsable, 'felipe')), t.vence,
         case t.estado when 'hecha' then 'hecho' when 'descartada' then 'descartado' else t.estado end,
         case t.prioridad when 'alta' then 1 when 'media' then 2 else 3 end, t.actualizado_en
  from ops.tareas t
)
select json_agg(json_build_object(
  'area', a.area,
  'abiertas', (select count(*) from items i where i.area = a.area and i.estado not in ('hecho','descartado')),
  'vencidas', (select count(*) from items i, hoy where i.area = a.area and i.estado not in ('hecho','descartado') and i.fecha < hoy.d),
  'bloqueadas', (select count(*) from items i where i.area = a.area and i.estado = 'bloqueado'),
  'hechas_mes', (select count(*) from items i, hoy where i.area = a.area and i.estado = 'hecho' and i.actualizado_en >= date_trunc('month', hoy.d)),
  'del_mes', (select count(*) from items i, hoy where i.area = a.area and i.fecha >= date_trunc('month', hoy.d) and i.fecha < date_trunc('month', hoy.d) + interval '1 month'),
  'en_agentes', (select count(*) from items i where i.area = a.area and i.estado not in ('hecho','descartado') and i.dueno not in ('felipe')),
  'proximas', (select coalesce(json_agg(x), '[]'::json) from (
      select i.id, i.fuente, i.titulo, i.unidad, i.dueno, i.fecha, i.estado, i.prioridad from items i
      where i.area = a.area and i.estado not in ('hecho','descartado')
      order by i.prioridad, i.fecha nulls last limit 6) x),
  'hechas', (select coalesce(json_agg(x), '[]'::json) from (
      select i.titulo, i.unidad, to_char(i.actualizado_en at time zone 'America/Santiago', 'YYYY-MM-DD') fecha from items i, hoy
      where i.area = a.area and i.estado = 'hecho' and i.actualizado_en >= date_trunc('month', hoy.d)
      order by i.actualizado_en desc limit 6) x),
  'rutinas', (select coalesce(json_agg(json_build_object('nombre', r.nombre, 'cuando', r.cuando, 'entrega', r.entrega, 'estado', r.estado,
      'necesita_pc', r.necesita_pc, 'ultima', r.ultima_ejecucion, 'resultado', r.ultimo_resultado) order by r.orden), '[]'::json)
      from dir.rutinas r where r.area = a.area)
) order by a.o) as d
from (values ('comercial',1),('marketing',2),('operaciones',3),('finanzas',4),('postventa',5),('direccion',6)) a(area, o);

create or replace function public.app_dir_areas()
returns json language plpgsql security definer set search_path = '' stable as $$
declare r json;
begin
  if not core.es_dueno() then raise exception 'El Directorio es solo para el dueño'; end if;
  select d into r from dir.v_areas;
  return r;
end $$;
revoke all on function public.app_dir_areas() from public, anon;
grant execute on function public.app_dir_areas() to authenticated;
