-- core_v42 · Ventas BlackGPS no ligadas al MRR (equipos y cámaras, instalaciones, desinstalaciones, servicios)
-- por mes, para la tarjeta y el dashboard de BlackGPS. Solo quien ve finanzas (core.ve_finanzas()).
create or replace function public.app_bgps_ventas_unicas(p_meses int default 6)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare r jsonb;
begin
  perform core.exigir_usuario();
  if not core.ve_finanzas() then return null; end if;
  with v as (
    select date_trunc('month', fecha)::date mes, fecha, documento, monto, descripcion,
      case when modalidad = 'hardware' then 'equipos'
           when modalidad = 'instalacion' then 'instalaciones'
           when modalidad = 'servicio' and descripcion ilike '%desinstal%' then 'desinstalaciones'
           when modalidad = 'servicio' then 'servicios'
           else 'otros' end as tipo
    from fin.ventas
    where unidad = 'blackgps' and modalidad not in ('licencia', 'mensualidad')
      and fecha >= (date_trunc('month', current_date) - make_interval(months => greatest(p_meses, 1) - 1))::date
  )
  select jsonb_build_object(
    'meses', coalesce((select jsonb_agg(m order by m->>'mes') from (
        select jsonb_build_object('mes', mes, 'total', sum(t), 'n', sum(c), 'por_tipo', jsonb_object_agg(tipo, t)) m
        from (select mes, tipo, sum(monto) t, count(*) c from v group by mes, tipo) x
        group by mes) y), '[]'),
    'mes_actual', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'documento', documento, 'tipo', tipo, 'monto', monto, 'detalle', left(descripcion, 120)) order by fecha desc)
        from v where mes = date_trunc('month', current_date)::date), '[]'),
    'licencias_mes', (select coalesce(sum(monto), 0) from fin.ventas
        where unidad = 'blackgps' and modalidad in ('licencia', 'mensualidad') and date_trunc('month', fecha) = date_trunc('month', current_date))
  ) into r;
  return r;
end $$;
revoke all on function public.app_bgps_ventas_unicas(int) from public, anon;
grant execute on function public.app_bgps_ventas_unicas(int) to authenticated;
