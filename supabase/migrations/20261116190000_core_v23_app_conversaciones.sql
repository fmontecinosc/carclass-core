-- v23 · Conversaciones de WhatsApp en la app (Fase 5, lado Core)
-- Lee wa.conversaciones / wa.mensajes / wa.borradores (creados por la sesión de carclass-whatsapp).
-- Nunca muestra conversaciones personales. «Tomar» pausa al asesor en esa conversación; «Devolver» lo reactiva.

create or replace function public.app_conversaciones()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  return coalesce((
    select jsonb_agg(x order by x.orden desc nulls last) from (
      select c.id, coalesce(nullif(c.nombre, ''), e.nombre, c.telefono) nombre, c.telefono, c.estado, c.unidad, c.flujo,
             c.empresa_id, c.oportunidad_id, o.etapa, c.ultima_entrada, c.ultima_salida, c.ventana_hasta,
             coalesce(c.agente_activo is false or c.agente_pausado_hasta > now(), false) humano,
             c.agente_pausado_hasta,
             coalesce((select valor from wa.config where clave = 'agente_modo_' || c.unidad),
                      (select valor from wa.config where clave = 'agente_modo'), 'observar') modo,
             (c.ultima_entrada is not null and (c.ultima_salida is null or c.ultima_entrada > c.ultima_salida)) sin_responder,
             m.texto ultimo_mensaje, m.tipo ultimo_tipo, m.direccion ultima_direccion,
             (select count(*) from wa.borradores b where b.conversacion_id = c.id and b.estado = 'pendiente') borradores,
             greatest(c.ultima_entrada, c.ultima_salida, c.creado_en) orden
      from wa.conversaciones c
      left join crm.empresas e on e.id = c.empresa_id
      left join crm.oportunidades o on o.id = c.oportunidad_id
      left join lateral (select texto, tipo, direccion from wa.mensajes where conversacion_id = c.id order by creado_en desc limit 1) m on true
      where c.estado in ('lead', 'sin_unidad', 'contacto')
    ) x), '[]'::jsonb);
end $$;

create or replace function public.app_conversacion(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c wa.conversaciones;
begin
  perform core.exigir_usuario();
  select * into c from wa.conversaciones where id = p_id and estado in ('lead', 'sin_unidad', 'contacto');
  if c.id is null then return null; end if;
  return jsonb_build_object(
    'conversacion', (select x from jsonb_array_elements(public.app_conversaciones()) x where (x->>'id')::uuid = p_id),
    'mensajes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'direccion', direccion, 'tipo', tipo, 'texto', texto, 'estado', estado,
                  'fecha', coalesce(enviado_en, creado_en), 'mime', media->>'mime_type') order by coalesce(enviado_en, creado_en))
                from (select * from wa.mensajes where conversacion_id = p_id order by coalesce(enviado_en, creado_en) desc limit 200) m), '[]'::jsonb),
    'borradores', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'mensajes', mensajes, 'acciones', acciones, 'creado_en', creado_en) order by creado_en)
                  from wa.borradores where conversacion_id = p_id and estado = 'pendiente'), '[]'::jsonb),
    'citas', coalesce((select jsonb_agg(to_jsonb(ci) - 'conversacion_id' order by inicio) from wa.citas ci where conversacion_id = p_id and estado in ('reservada', 'confirmada')), '[]'::jsonb));
end $$;

create or replace function public.app_conversacion_atender(p_id uuid, p_accion text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  if not exists (select 1 from wa.conversaciones where id = p_id and estado in ('lead', 'sin_unidad', 'contacto')) then
    raise exception 'Conversación no encontrada';
  end if;
  if p_accion = 'tomar' then
    update wa.conversaciones set agente_activo = false, agente_pausado_hasta = now() + interval '30 days', actualizado_en = now() where id = p_id;
    delete from wa.cola_agente where conversacion_id = p_id;
    update wa.borradores set estado = 'descartado', resuelto_en = now(), resuelto_por = core.autor() || ' tomó la conversación'
      where conversacion_id = p_id and estado = 'pendiente';
  elsif p_accion = 'devolver' then
    update wa.conversaciones set agente_activo = true, agente_pausado_hasta = null, actualizado_en = now() where id = p_id;
  else raise exception 'Acción inválida'; end if;
  return jsonb_build_object('ok', true, 'accion', p_accion);
end $$;

create or replace function public.app_borrador_descartar(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  update wa.borradores set estado = 'descartado', resuelto_en = now(), resuelto_por = core.autor() where id = p_id and estado = 'pendiente';
  if not found then raise exception 'El borrador ya no está pendiente'; end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.app_conversaciones(), public.app_conversacion(uuid), public.app_conversacion_atender(uuid, text), public.app_borrador_descartar(uuid) from public, anon;
grant execute on function public.app_conversaciones(), public.app_conversacion(uuid), public.app_conversacion_atender(uuid, text), public.app_borrador_descartar(uuid) to authenticated;
