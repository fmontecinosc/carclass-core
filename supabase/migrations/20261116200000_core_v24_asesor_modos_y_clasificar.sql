-- v24 · Modo del asesor por línea, clasificación de chats y marca de traspaso (Felipe 16-nov)
-- Decisión: el asesor responde solo (modo «activo») a los leads de Carclass y NOM. BlackGPS y los chats
-- personales los atiende Felipe (BlackGPS queda en «observar»). wa-agente lee estos valores con wa.modo_agente().

update wa.config set valor = 'activo', actualizado_en = now() where clave in ('agente_modo_carclass', 'agente_modo_nom');
insert into wa.config (clave, valor) values ('agente_modo_carclass', 'activo'), ('agente_modo_nom', 'activo')
  on conflict (clave) do nothing;

-- Modos visibles y editables por el dueño desde la app
create or replace function public.app_asesor_modos()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  return jsonb_build_object(
    'modos', (select jsonb_object_agg(u, wa.modo_agente(u)) from unnest(array['carclass', 'nom', 'blackgps']) u),
    'puede_editar', core.es_dueno(),
    'programado', exists (select 1 from cron.job where active and command ilike '%wa-agente%'));
end $$;

create or replace function public.app_asesor_modo(p_unidad text, p_modo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  if not core.es_dueno() then raise exception 'Solo el dueño cambia el modo del asesor'; end if;
  if p_unidad not in ('carclass', 'nom', 'blackgps') then raise exception 'Línea inválida'; end if;
  if p_modo not in ('observar', 'borrador', 'activo', 'apagado') then raise exception 'Modo inválido'; end if;
  insert into wa.config (clave, valor) values ('agente_modo_' || p_unidad, p_modo)
    on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
  insert into core.eventos (tabla, accion, autor, cambio)
    values ('wa.config', 'update', core.autor(), jsonb_build_object('clave', 'agente_modo_' || p_unidad, 'valor', p_modo));
  return jsonb_build_object('ok', true, 'unidad', p_unidad, 'modo', p_modo);
end $$;

-- Clasificar un chat: a una línea (crea el lead) o como personal (borra su contenido y deja de mostrarse)
create or replace function public.app_conversacion_clasificar(p_id uuid, p_destino text, p_flujo text default null)
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
    update wa.conversaciones set unidad = p_destino, flujo = case when p_destino = 'nom' then p_flujo end, actualizado_en = now() where id = c.id;
    return jsonb_build_object('ok', true, 'oportunidad_id', c.oportunidad_id, 'nueva', false);
  end if;
  r := wa.asignar_unidad(c.id, p_destino, case when p_destino = 'nom' then p_flujo end, core.autor());
  return r;
end $$;

-- Lista de conversaciones con marca de traspaso (el asesor pidió a Felipe que atienda)
do $$ declare d text; begin
  d := pg_get_functiondef('public.app_conversaciones()'::regprocedure);
  d := replace(d, 'greatest(c.ultima_entrada, c.ultima_salida, c.creado_en) orden',
    'greatest(c.ultima_entrada, c.ultima_salida, c.creado_en) orden,
             (select t.titulo from ops.tareas t where t.titulo like ''[WhatsApp]%'' and t.estado in (''pendiente'', ''en_curso'')
                and ((c.oportunidad_id is not null and t.oportunidad_id = c.oportunidad_id) or t.titulo like ''%'' || coalesce(c.telefono_norm, c.nombre, ''-'') || ''%'')
              order by t.creado_en desc limit 1) traspaso');
  execute d;
end $$;

revoke execute on function public.app_asesor_modos(), public.app_asesor_modo(text, text), public.app_conversacion_clasificar(uuid, text, text) from public, anon;
grant execute on function public.app_asesor_modos(), public.app_asesor_modo(text, text), public.app_conversacion_clasificar(uuid, text, text) to authenticated;
