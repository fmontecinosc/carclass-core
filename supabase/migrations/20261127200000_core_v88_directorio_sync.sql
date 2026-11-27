-- core_v88 · Sincronización automática Core → Directorio (27-nov-2026, Felipe).
-- Lo que pasa en Core se anota solo en dir.bitacora, el marcador semanal se calcula desde Core
-- y el asesor de WhatsApp abre o cierra su propia alerta. No depende de que un agente se acuerde.

-- Pendientes que vienen de un chat: evitar duplicados del sincronizador
alter table dir.pendientes add column if not exists ref text;
create unique index if not exists pendientes_ref_uq on dir.pendientes (ref) where ref is not null;
create unique index if not exists bitacora_ref_uq on dir.bitacora (ref) where ref is not null;

-- 1) Oportunidades: hitos de etapa y cierre
create or replace function dir.sync_oportunidad() returns trigger language plpgsql security definer set search_path = '' as $$
declare tit text; v_tipo text; v_ref text;
begin
  if new.unidad not in ('blackgps','somosb2b','carclass','nom','carwash') then return new; end if;
  if new.estado is distinct from old.estado and new.estado in ('ganada','perdida') then
    v_tipo := case new.estado when 'ganada' then 'avance' else 'retroceso' end;
    tit := case new.estado when 'ganada' then 'Ganada: ' else 'Perdida: ' end || coalesce(new.titulo, 'oportunidad')
           || case when new.estado = 'perdida' and new.motivo_codigo is not null then ' (' || new.motivo_codigo || ')' else '' end;
    v_ref := 'op:' || new.id || ':' || new.estado;
  elsif new.etapa is distinct from old.etapa and (new.etapa in ('cotizado','en_asisma','onboarding','revision_agendada','en_taller','entregado','tasado','oferta_enviada','comprado')
        or (new.etapa like 'reunion%' and new.etapa <> 'reunion_por_agendar')) then
    v_tipo := 'avance';
    tit := case when new.etapa like 'reunion%' then 'Reunión: ' else initcap(replace(new.etapa, '_', ' ')) || ': ' end || coalesce(new.titulo, 'oportunidad');
    v_ref := case when new.etapa like 'reunion%' then 'reunion:' else 'op:' end || new.id || ':' || new.etapa;
  else
    return new;
  end if;
  insert into dir.bitacora (agente, unidad, tipo, titulo, detalle, fuente, ref)
  values ('comercial', new.unidad, v_tipo, left(tit, 200), new.proxima_accion, 'Core · automático', v_ref)
  on conflict (ref) where ref is not null do nothing;
  return new;
exception when others then return new;
end $$;
drop trigger if exists t_dir_oportunidad on crm.oportunidades;
create trigger t_dir_oportunidad after update of etapa, estado on crm.oportunidades for each row execute function dir.sync_oportunidad();

-- 2) Ventas nuevas (no las cargas históricas ni las mensualidades BlackGPS)
create or replace function dir.sync_venta() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.fecha < (now() at time zone 'America/Santiago')::date - 7 then return new; end if;
  if new.unidad = 'blackgps' and coalesce(new.modalidad, '') in ('mensualidad', 'licencia', 'mrr') then return new; end if;
  insert into dir.bitacora (agente, unidad, tipo, titulo, detalle, fuente, ref)
  values ('finanzas', case when new.unidad in ('blackgps','somosb2b','carclass','nom','carwash') then new.unidad else 'holding' end, 'avance',
          left('Venta registrada: $' || to_char(new.monto, 'FM999G999G999') || coalesce(' · ' || nullif(new.descripcion, ''), ''), 200),
          new.cliente_txt, 'Core · automático', 'venta:' || new.id)
  on conflict (ref) where ref is not null do nothing;
  return new;
exception when others then return new;
end $$;
drop trigger if exists t_dir_venta on fin.ventas;
create trigger t_dir_venta after insert on fin.ventas for each row execute function dir.sync_venta();

-- 3) Tareas de Core cerradas
create or replace function dir.sync_tarea() returns trigger language plpgsql security definer set search_path = '' as $$
declare a text := dir.area_tarea(new.titulo);
begin
  if new.estado = 'hecha' and old.estado is distinct from 'hecha' then
    insert into dir.bitacora (agente, unidad, tipo, titulo, fuente, ref)
    values (case a when 'finanzas' then 'finanzas' when 'operaciones' then 'operaciones' else 'comercial' end,
            case when new.unidad in ('blackgps','somosb2b','carclass','nom','carwash') then new.unidad else 'holding' end,
            'avance', left('Tarea hecha: ' || new.titulo, 200), 'Core · automático', 'tarea:' || new.id)
    on conflict (ref) where ref is not null do nothing;
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists t_dir_tarea on ops.tareas;
create trigger t_dir_tarea after update of estado on ops.tareas for each row execute function dir.sync_tarea();

-- 4) Marcador semanal calculado desde Core + alerta automática del asesor
create or replace function dir.sync_periodico() returns void language plpgsql security definer set search_path = '' as $$
declare
  hoy date := (now() at time zone 'America/Santiago')::date;
  sem date := date_trunc('week', hoy)::date;
  t0 timestamptz := (sem::timestamp at time zone 'America/Santiago');
  ok_2h int; er_2h int; ok_1h int;
begin
  update dir.marcador m set real = v.real, fuente = 'Core · automático', actualizado_en = now()
  from (
    select 'carclass' u, 'Ventas cerradas' k, (select coalesce(sum(monto), 0) from fin.ventas where unidad = 'carclass' and fecha >= sem) real
    union all select 'carclass', 'Cotizaciones enviadas', (select count(*) from crm.cotizaciones where unidad = 'carclass' and enviada_en >= t0)
    union all select 'nom', 'Consignaciones nuevas', (select count(*) from crm.oportunidades where unidad = 'nom' and flujo = 'consignante' and estado = 'ganada' and cerrado_en >= t0)
    union all select 'nom', 'Consignantes contactados', (select count(distinct a.oportunidad_id) from crm.actividades a join crm.oportunidades o on o.id = a.oportunidad_id
                                                         where o.unidad = 'nom' and o.flujo = 'consignante' and a.fecha >= t0 and a.tipo <> 'sistema')
    union all select 'blackgps', 'Llamadas de prospección', (select count(*) from crm.actividades a join crm.oportunidades o on o.id = a.oportunidad_id
                                                             where o.unidad = 'blackgps' and a.tipo = 'llamada' and a.fecha >= t0)
    union all select 'blackgps', 'Reuniones agendadas', (select count(*) from dir.bitacora where unidad = 'blackgps' and ref like 'reunion:%' and creado_en >= t0)
  ) v
  where m.semana = sem and m.unidad = v.u and m.kpi = v.k;

  select count(*) filter (where error is null), count(*) filter (where error is not null) into ok_2h, er_2h from wa.agente_log where creado_en > now() - interval '2 hours';
  select count(*) into ok_1h from wa.agente_log where creado_en > now() - interval '1 hour' and error is null;
  if er_2h >= 2 and ok_2h = 0 then
    if not exists (select 1 from dir.alertas where estado = 'abierta' and titulo = 'Asesor de WhatsApp sin enviar (detección automática)') then
      insert into dir.alertas (unidad, agente, prioridad, titulo, detalle)
      values ('carclass', 'asesor_wa', 'alta', 'Asesor de WhatsApp sin enviar (detección automática)',
              left('Últimas 2 horas: ' || er_2h || ' errores y ninguna respuesta enviada. Último error: ' ||
                   coalesce((select error from wa.agente_log where error is not null order by creado_en desc limit 1), '—'), 400));
    end if;
  elsif ok_1h > 0 then
    update dir.alertas set estado = 'resuelta', resuelta_en = now()
    where estado = 'abierta' and prioridad = 'alta'
      and (titulo = 'Asesor de WhatsApp sin enviar (detección automática)' or titulo like 'El asesor de WhatsApp no puede enviar%');
  end if;
end $$;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'dir_sync_periodico') then perform cron.unschedule('dir_sync_periodico'); end if;
  perform cron.schedule('dir_sync_periodico', '*/15 * * * *', 'select dir.sync_periodico()');
end $$;

