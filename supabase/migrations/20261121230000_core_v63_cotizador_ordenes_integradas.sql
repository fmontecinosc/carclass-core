-- core_v63 · Cotizador Carclass integrado con Core (Felipe 21-nov):
-- la cotización que arma el asesor (o la app) se abre en el cotizador y sigue a Orden de Ingreso y Acta de Entrega;
-- la orden queda ligada a la oportunidad, que avanza sola: ingreso → «en_taller», entrega → «entregado»; al registrar la
-- venta con la oportunidad abierta, el cotizador usa app_ganar_con_venta (ganada + venta ligada + postventa automática).
alter table public.car_ordenes
  add column if not exists oportunidad_id uuid references crm.oportunidades(id) on delete set null,
  add column if not exists cotizacion_id uuid references crm.cotizaciones(id) on delete set null;
create index if not exists car_ordenes_oportunidad_idx on public.car_ordenes (oportunidad_id);

create or replace function public.app_cotizacion_buscar(p_q text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text := nullif(trim(coalesce(p_q,'')), ''); v_d text := regexp_replace(coalesce(p_q,''),'\D','','g'); v jsonb;
begin
  perform core.exigir_usuario();
  select coalesce(jsonb_agg(x order by x->>'creado_en' desc), '[]') into v from (
    select jsonb_build_object('id', q.id, 'numero', q.numero, 'fecha', q.fecha, 'estado', q.estado, 'total', q.total,
             'cliente', e.nombre, 'auto', q.items->>'auto', 'oportunidad_id', q.oportunidad_id, 'creado_en', q.creado_en,
             'orden', (select o.numero from public.car_ordenes o where o.cotizacion_id = q.id order by o.actualizado_en desc limit 1)) x
    from crm.cotizaciones q left join crm.empresas e on e.id = q.empresa_id
    where q.unidad = 'carclass'
      and (v_q is null or q.numero ilike '%'||v_q||'%' or e.nombre ilike '%'||v_q||'%' or coalesce(q.items->>'auto','') ilike '%'||v_q||'%'
           or (length(v_d) >= 6 and coalesce(e.telefono,'') like '%'||right(v_d,9)||'%'))
    order by q.creado_en desc limit 10) s;
  return v;
end $$;
revoke all on function public.app_cotizacion_buscar(text) from public, anon;
grant execute on function public.app_cotizacion_buscar(text) to authenticated;

create or replace function public.app_orden_avance(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o crm.oportunidades; v_et text := p->>'etapa'; v_num text := nullif(p->>'numero',''); v_cot uuid := nullif(p->>'cotizacion_id','')::uuid;
        v_fecha date := coalesce(nullif(p->>'fecha_entrega','')::date, current_date + 3); v_nueva text;
begin
  perform core.exigir_usuario(); perform set_config('core.autor', core.autor(), true);
  if v_et is null or v_et not in ('ingreso','entrega') then raise exception 'Etapa no válida (ingreso o entrega)'; end if;
  select * into o from crm.oportunidades where id = (p->>'oportunidad_id')::uuid;
  if o.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if o.unidad <> 'carclass' then raise exception 'Solo para oportunidades Carclass'; end if;
  v_nueva := case v_et when 'ingreso' then 'en_taller' else 'entregado' end;
  if o.estado = 'abierta' then
    perform core.api_mover_etapa(jsonb_build_object('oportunidad_id', o.id, 'etapa', v_nueva,
      'proxima_accion', case v_et when 'ingreso' then format('Entregar el auto%s', coalesce(' (orden '||v_num||')',''))
                                  else 'Registrar la venta y el cobro' end,
      'proxima_fecha', case v_et when 'ingreso' then greatest(v_fecha, current_date) else current_date end), core.autor());
  end if;
  if v_cot is not null then
    update crm.cotizaciones set estado = 'aceptada' where id = v_cot and estado in ('borrador','enviada','vista');
  end if;
  insert into crm.actividades (oportunidad_id, empresa_id, tipo, nota)
  values (o.id, o.empresa_id, 'sistema', format('%s%s emitida en el cotizador', case v_et when 'ingreso' then 'Orden de ingreso' else 'Acta de entrega' end, coalesce(' '||v_num,'')));
  if v_num is not null then
    update public.car_ordenes set oportunidad_id = o.id, cotizacion_id = coalesce(v_cot, cotizacion_id) where numero = v_num;
  end if;
  return jsonb_build_object('ok', true, 'oportunidad_id', o.id, 'etapa', case when o.estado = 'abierta' then v_nueva else o.etapa end, 'estado', o.estado);
end $$;
revoke all on function public.app_orden_avance(jsonb) from public, anon;
grant execute on function public.app_orden_avance(jsonb) to authenticated;

create or replace function public.app_oportunidad_estado(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  return (select jsonb_build_object('id', o.id, 'estado', o.estado, 'etapa', o.etapa, 'unidad', o.unidad) from crm.oportunidades o where o.id = p_id);
end $$;
revoke all on function public.app_oportunidad_estado(uuid) from public, anon;
grant execute on function public.app_oportunidad_estado(uuid) to authenticated;
