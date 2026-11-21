-- core_v76 · Conversaciones: solo leads a la vista; proveedores, equipo y clientes como «contactos» (Felipe 22-nov)
-- 1) Tipos de contacto: personal, cliente, proveedor, equipo, negocio (otro contacto de trabajo).
-- 2) wa.sync_contactos_clientes(): teléfonos de contactos y fichas de clientes BlackGPS (contrato GPS o ventas) quedan
--    como «cliente» en wa.contactos_personales; sus chats sin anuncio pasan a «contacto». Corre cada noche con pg_cron.
-- 3) app_conversacion_contacto(id, tipo): marcar a mano un chat como no lead. Recuerda el teléfono para los chats futuros,
--    saca el chat de la cola del asesor y descarta la oportunidad abierta que se creó por error (motivo «otro»).
-- 4) app_conversaciones entrega tipo_contacto y es_lead para que la app separe Leads de Contactos.
-- 5) wa.conversaciones.flujo admite compra_directa (core_v54 lo agregó a oportunidades, no a conversaciones).

alter table wa.contactos_personales drop constraint if exists contactos_personales_tipo_check;
alter table wa.contactos_personales add constraint contactos_personales_tipo_check
  check (tipo is null or tipo in ('personal', 'cliente', 'proveedor', 'equipo', 'negocio'));
alter table wa.contactos_personales drop constraint if exists contactos_personales_origen_check;
alter table wa.contactos_personales add constraint contactos_personales_origen_check
  check (origen in ('manual', 'agenda', 'historial', 'core_clientes'));

alter table wa.conversaciones drop constraint if exists conversaciones_flujo_check;
alter table wa.conversaciones add constraint conversaciones_flujo_check
  check (flujo is null or flujo in ('consignante', 'comprador', 'compra_directa'));

revoke all on function wa.sync_contactos_clientes() from public, anon, authenticated;
-- La ingesta (core.api_wa_ingesta) manda a «contacto» los tipos cliente y negocio; se amplía con un trigger para no
-- tocar esa función (es de la sesión carclass-whatsapp): un chat nuevo de proveedor o equipo también nace como contacto.
create or replace function wa.tg_conversacion_tipo_contacto() returns trigger
language plpgsql security definer set search_path to '' as $$
declare v_tipo text;
begin
  if new.telefono_norm is null or new.referral is not null then return new; end if;
  select tipo into v_tipo from wa.contactos_personales where telefono_norm = new.telefono_norm;
  if v_tipo in ('cliente', 'proveedor', 'equipo', 'negocio') and new.estado = 'sin_unidad' then
    new.estado := 'contacto';
    new.tipo_contacto := v_tipo;
  end if;
  return new;
end $$;
drop trigger if exists conversacion_tipo_contacto on wa.conversaciones;
create trigger conversacion_tipo_contacto before insert on wa.conversaciones
  for each row execute function wa.tg_conversacion_tipo_contacto();

create or replace function wa.sync_contactos_clientes() returns integer
language plpgsql security definer set search_path to '' as $$
declare n integer;
begin
  with clientes as (
    select e.id from crm.empresas e
    where exists (select 1 from ops.contratos_gps g where g.empresa_id = e.id)
       or exists (select 1 from fin.ventas v where v.empresa_id = e.id and v.unidad = 'blackgps')
  ), tels as (
    select k.telefono_norm tel, k.nombre from crm.contactos k join clientes c on c.id = k.empresa_id where k.telefono_norm is not null
    union
    select e.telefono_norm, e.nombre from crm.empresas e join clientes c on c.id = e.id where e.telefono_norm is not null
  )
  insert into wa.contactos_personales (telefono_norm, nombre, origen, tipo)
  select distinct on (tel) tel, nombre, 'core_clientes', 'cliente' from tels
  on conflict (telefono_norm) do update set tipo = 'cliente'
    where wa.contactos_personales.tipo is null;  -- nunca pisa una clasificación manual
  get diagnostics n = row_count;
  -- Chats abiertos de esos teléfonos que no vinieron de un anuncio y aún no avanzan como lead
  update wa.conversaciones c set estado = 'contacto', tipo_contacto = 'cliente', actualizado_en = now()
  from wa.contactos_personales cp
  where cp.telefono_norm = c.telefono_norm and cp.tipo = 'cliente'
    and c.estado = 'sin_unidad' and c.referral is null;
  return n;
end $$;

create or replace function public.app_conversacion_contacto(p_id uuid, p_tipo text) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c wa.conversaciones; v_desc int := 0;
begin
  perform core.exigir_usuario();
  if not core.es_dueno() then raise exception 'Solo el dueño clasifica contactos'; end if;
  if p_tipo not in ('cliente', 'proveedor', 'equipo', 'negocio') then raise exception 'Tipo inválido'; end if;
  select * into c from wa.conversaciones where id = p_id and estado in ('lead', 'sin_unidad', 'contacto');
  if c.id is null then raise exception 'Conversación no encontrada'; end if;

  update wa.conversaciones set estado = 'contacto', tipo_contacto = p_tipo, agente_activo = false, actualizado_en = now() where id = c.id;
  delete from wa.cola_agente where conversacion_id = c.id;
  update wa.borradores set estado = 'vencido', resuelto_en = now(), resuelto_por = 'contacto' where conversacion_id = c.id and estado = 'pendiente';
  update wa.seguimientos set estado = 'cancelado' where conversacion_id = c.id and estado = 'pendiente';
  if c.telefono_norm is not null then
    insert into wa.contactos_personales (telefono_norm, nombre, origen, tipo) values (c.telefono_norm, c.nombre, 'manual', p_tipo)
      on conflict (telefono_norm) do update set tipo = excluded.tipo;
  end if;
  -- La oportunidad que el chat abrió por error se descarta (no cuenta como perdida en el embudo)
  if c.oportunidad_id is not null then
    update crm.oportunidades set estado = 'descartada', motivo_codigo = 'otro',
           motivo_perdida = 'No es lead: ' || p_tipo || ' (Conversaciones)', cerrado_en = now()
     where id = c.oportunidad_id and estado = 'abierta';
    get diagnostics v_desc = row_count;
  end if;
  return jsonb_build_object('ok', true, 'tipo', p_tipo, 'oportunidad_descartada', v_desc > 0);
end $$;
revoke all on function public.app_conversacion_contacto(uuid, text) from public, anon;
grant execute on function public.app_conversacion_contacto(uuid, text) to authenticated;

-- Vuelve a lead un chat marcado como contacto por error
create or replace function public.app_conversacion_es_lead(p_id uuid) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c wa.conversaciones;
begin
  perform core.exigir_usuario();
  if not core.es_dueno() then raise exception 'Solo el dueño clasifica contactos'; end if;
  select * into c from wa.conversaciones where id = p_id and estado = 'contacto';
  if c.id is null then raise exception 'Conversación no encontrada'; end if;
  update wa.conversaciones set estado = case when unidad is null then 'sin_unidad' else 'lead' end, tipo_contacto = null, actualizado_en = now() where id = c.id;
  if c.telefono_norm is not null then delete from wa.contactos_personales where telefono_norm = c.telefono_norm and tipo is distinct from 'personal'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.app_conversacion_es_lead(uuid) from public, anon;
grant execute on function public.app_conversacion_es_lead(uuid) to authenticated;

create or replace function public.app_conversaciones()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
             greatest(c.ultima_entrada, c.ultima_salida, c.creado_en) orden,
             (select t.titulo from ops.tareas t where t.titulo like '[WhatsApp]%' and t.estado in ('pendiente', 'en_curso')
                and ((c.oportunidad_id is not null and t.oportunidad_id = c.oportunidad_id) or t.titulo like '%' || coalesce(c.telefono_norm, c.nombre, '-') || '%')
              order by t.creado_en desc limit 1) traspaso,
             case when c.estado = 'contacto' then coalesce(c.tipo_contacto, 'negocio') end tipo_contacto,
             c.estado <> 'contacto' es_lead
      from wa.conversaciones c
      left join crm.empresas e on e.id = c.empresa_id
      left join crm.oportunidades o on o.id = c.oportunidad_id
      left join lateral (select texto, tipo, direccion from wa.mensajes where conversacion_id = c.id order by creado_en desc limit 1) m on true
      where c.estado in ('lead', 'sin_unidad', 'contacto')
        and (core.es_dueno() or (c.unidad is not null and core.puede(c.unidad)))
    ) x), '[]'::jsonb);
end $function$;

select wa.sync_contactos_clientes();
select cron.schedule('wa_sync_contactos_clientes', '17 7 * * *', $$select wa.sync_contactos_clientes()$$);
