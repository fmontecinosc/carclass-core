-- core_v85 · Dashboard de dirección (27-nov-2026, Felipe aprobó el mockup).
-- Bloque superior del Dashboard Grupo: venta anual y mensual por unidad, proyección, resultado del mes,
-- decisiones del día, carga de trabajo por agente y salud del asesor de WhatsApp. Solo quien ve finanzas.
create or replace function public.app_dir_dashboard()
returns json language plpgsql security definer set search_path = '' stable as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
  m0 date := date_trunc('month', hoy)::date;
  a0 date := date_trunc('year', hoy)::date;
  r json;
begin
  if not core.ve_finanzas() then raise exception 'Solo para quien ve finanzas'; end if;
  select json_build_object(
    'hoy', hoy,
    'mensual', (select coalesce(json_agg(x order by x.mes, x.unidad), '[]'::json) from (
        select to_char(date_trunc('month', fecha), 'YYYY-MM') mes, unidad, sum(monto)::bigint ventas
        from fin.ventas where fecha >= a0 and fecha <= hoy group by 1, 2) x),
    'mes', (select coalesce(json_agg(x order by x.unidad), '[]'::json) from (
        select u.unidad,
          coalesce((select sum(monto) from fin.ventas v where v.unidad = u.unidad and v.fecha >= m0 and v.fecha <= hoy), 0)::bigint ventas,
          coalesce((select sum(monto) from fin.costos c where c.unidad = u.unidad and c.tipo = 'directo' and c.fecha >= m0 and c.fecha <= hoy), 0)::bigint costos,
          coalesce((select sum(monto) from fin.costos c where c.unidad = u.unidad and c.tipo <> 'directo' and c.fecha >= m0 and c.fecha <= hoy), 0)::bigint gastos
        from (values ('blackgps'), ('carclass'), ('nom'), ('carwash')) u(unidad)) x),
    'gastos_grupo_mes', coalesce((select sum(monto) from fin.costos c where c.tipo <> 'directo' and c.fecha >= m0 and c.fecha <= hoy), 0)::bigint,
    'decisiones', (select coalesce(json_agg(x), '[]'::json) from (
        select id, unidad, titulo, detalle, fecha_compromiso fecha, prioridad, estado from dir.pendientes
        where dueno = 'felipe' and estado not in ('hecho', 'descartado')
        order by prioridad, fecha_compromiso nulls last, creado_en limit 5) x),
    'carga', (select coalesce(json_agg(x order by x.n desc), '[]'::json) from (
        select dueno, count(*) n from dir.pendientes where estado not in ('hecho', 'descartado') group by 1) x),
    'alertas_altas', (select count(*) from dir.alertas where estado = 'abierta' and prioridad = 'alta'),
    'pend_abiertos', (select count(*) from dir.pendientes where estado not in ('hecho', 'descartado')),
    'vencidos', (select count(*) from dir.pendientes where estado not in ('hecho', 'descartado') and fecha_compromiso < hoy),
    'wa', (select coalesce(json_agg(w order by dia), '[]'::json) from dir.v_asesor_wa w),
    'ultima_venta', (select json_object_agg(unidad, f) from (select unidad, max(fecha) f from fin.ventas group by 1) x)
  ) into r;
  return r;
end $$;
revoke all on function public.app_dir_dashboard() from public, anon;
grant execute on function public.app_dir_dashboard() to authenticated;
