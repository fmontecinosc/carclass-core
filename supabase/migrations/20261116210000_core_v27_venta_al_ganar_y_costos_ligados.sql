-- v27 · Registrar la venta al marcar «Ganada» y ligar costos a su venta (Felipe 16-nov)
-- Margen = venta − costos con venta_id. Solo quien ve finanzas registra la venta.

create or replace function public.app_ganar_con_venta(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o crm.oportunidades; v jsonb := p->'venta'; r jsonb; v_id uuid; v_cot uuid; v_nom text;
begin
  perform core.exigir_usuario(); perform set_config('core.autor', core.autor(), true);
  select * into o from crm.oportunidades where id = (p->>'oportunidad_id')::uuid;
  if o.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if v is not null then
    if not core.ve_finanzas() then raise exception 'Solo quien ve finanzas registra ventas'; end if;
    if coalesce((v->>'monto')::bigint, 0) <= 0 then raise exception 'Escribe el monto de la venta'; end if;
  end if;
  r := public.app_cerrar(jsonb_build_object('oportunidad_id', o.id, 'estado', 'ganada', 'nota', p->>'nota'));
  if v is not null then
    select id into v_cot from crm.cotizaciones where oportunidad_id = o.id and estado in ('aceptada', 'vista', 'enviada') order by (estado = 'aceptada') desc, fecha desc limit 1;
    select nombre into v_nom from crm.empresas where id = o.empresa_id;
    insert into fin.ventas (unidad, empresa_id, oportunidad_id, cotizacion_id, fecha, descripcion, modalidad, monto, afecto_iva, estado_cobro, fecha_cobro, cliente_txt, documento, origen, creado_por)
    values (o.unidad, o.empresa_id, o.id, v_cot, coalesce(nullif(v->>'fecha', '')::date, current_date), nullif(trim(v->>'descripcion'), ''),
            coalesce(nullif(v->>'modalidad', ''), 'servicio'), (v->>'monto')::bigint, coalesce((v->>'afecto_iva')::boolean, true),
            coalesce(nullif(v->>'estado_cobro', ''), 'pendiente'),
            case when v->>'estado_cobro' = 'cobrado' then coalesce(nullif(v->>'fecha_cobro', '')::date, current_date) end,
            v_nom, nullif(trim(v->>'documento'), ''), 'app', core.autor())
    returning id into v_id;
  end if;
  return r || jsonb_build_object('venta_id', v_id);
end $$;

-- Costos: permitir cambiar la venta asociada al editar
do $$ declare d text; begin
  d := pg_get_functiondef('public.app_fin_guardar(jsonb)'::regprocedure);
  d := replace(d, 'update fin.costos set unidad = coalesce(nullif(d->>''unidad'',''''),unidad),',
    'update fin.costos set unidad = coalesce(nullif(d->>''unidad'',''''),unidad), venta_id = case when d ? ''venta_id'' then nullif(d->>''venta_id'','''')::uuid else venta_id end,');
  if position('venta_id = case when' in d) = 0 then raise exception 'No se pudo extender app_fin_guardar'; end if;
  execute d;
end $$;

-- Ficha: ventas con id, tipo, costos ligados y margen
do $$ declare d text; begin
  d := pg_get_functiondef('public.app_empresa(uuid)'::regprocedure);
  d := replace(d, 'jsonb_build_object(''fecha'',v.fecha,''unidad'',v.unidad,''descripcion'',v.descripcion,''monto'',v.monto,''cobro'',v.estado_cobro)',
    'jsonb_build_object(''id'',v.id,''fecha'',v.fecha,''unidad'',v.unidad,''descripcion'',v.descripcion,''modalidad'',v.modalidad,''monto'',v.monto,''cobro'',v.estado_cobro,''documento'',v.documento,''oportunidad_id'',v.oportunidad_id,
       ''costos'',(select coalesce(sum(c.monto),0) from fin.costos c where c.venta_id = v.id), ''n_costos'',(select count(*) from fin.costos c where c.venta_id = v.id))');
  if position('n_costos' in d) = 0 then raise exception 'No se pudo extender app_empresa'; end if;
  execute d;
end $$;

revoke execute on function public.app_ganar_con_venta(jsonb) from public, anon;
grant execute on function public.app_ganar_con_venta(jsonb) to authenticated;
