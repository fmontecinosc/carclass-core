-- v29 · Clasificar cualquier chat (también «contacto» o ya clasificado) y derivarlo al asesor en el mismo paso (Felipe 16-nov)
-- Derivar = reactivar al asesor en ese chat (sin pausa) y ponerlo en la cola para que responda lo pendiente.
-- wa-agente solo atiende conversaciones en estado sin_unidad o lead, por eso clasificar deja el chat como «lead».

drop function if exists public.app_conversacion_clasificar(uuid, text, text);

create or replace function public.app_conversacion_clasificar(p_id uuid, p_destino text, p_flujo text default null, p_derivar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c wa.conversaciones; r jsonb;
begin
  perform core.exigir_usuario();
  select * into c from wa.conversaciones where id = p_id and estado in ('lead', 'sin_unidad', 'contacto');
  if c.id is null then raise exception 'Conversación no encontrada'; end if;
  if p_destino = 'personal' then
    update wa.conversaciones set estado = 'personal', ficha = '{}'::jsonb, actualizado_en = now() where id = c.id;
    delete from wa.mensajes where conversacion_id = c.id;
    delete from wa.borradores where conversacion_id = c.id;
    delete from wa.cola_agente where conversacion_id = c.id;
    if c.telefono_norm is not null then
      insert into wa.contactos_personales (telefono_norm, nombre, origen, tipo) values (c.telefono_norm, c.nombre, 'manual', 'personal')
        on conflict (telefono_norm) do update set tipo = 'personal';
    end if;
    return jsonb_build_object('ok', true, 'personal', true);
  end if;
  if p_destino not in ('carclass', 'nom', 'blackgps', 'carwash') then raise exception 'Destino inválido'; end if;
  if p_destino = 'nom' and coalesce(p_flujo, '') not in ('consignante', 'comprador') then raise exception 'Indica si vende o compra'; end if;
  if c.oportunidad_id is not null then
    update crm.oportunidades set unidad = p_destino, flujo = case when p_destino = 'nom' then p_flujo end,
           etapa = case when etapa = any(core.etapas(p_destino, case when p_destino = 'nom' then p_flujo end)) then etapa
                        else (core.etapas(p_destino, case when p_destino = 'nom' then p_flujo end))[1] end
      where id = c.oportunidad_id and estado = 'abierta' and (unidad <> p_destino or flujo is distinct from case when p_destino = 'nom' then p_flujo end);
    update wa.conversaciones set estado = 'lead', unidad = p_destino, flujo = case when p_destino = 'nom' then p_flujo end, actualizado_en = now() where id = c.id;
    r := jsonb_build_object('ok', true, 'oportunidad_id', c.oportunidad_id, 'nueva', false);
  else
    r := wa.asignar_unidad(c.id, p_destino, case when p_destino = 'nom' then p_flujo end, core.autor());
  end if;
  if p_derivar then
    update wa.conversaciones set agente_activo = true, agente_pausado_hasta = null, actualizado_en = now() where id = c.id;
    insert into wa.cola_agente (conversacion_id, procesar_desde) values (c.id, now())
      on conflict (conversacion_id) do update set procesar_desde = now(), intentos = 0, bloqueado_hasta = null, ultimo_error = null;
  end if;
  return r || jsonb_build_object('derivado', p_derivar);
end $$;

revoke execute on function public.app_conversacion_clasificar(uuid, text, text, boolean) from public, anon;
grant execute on function public.app_conversacion_clasificar(uuid, text, text, boolean) to authenticated;
