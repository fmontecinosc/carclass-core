-- v26 · Avisos push al teléfono y computador, también con la app cerrada (Web Push).
-- Claves en Supabase Vault (no en el repo): push_vapid_publica, push_vapid_privada, push_secreto.
-- La base llama a la función core-push por pg_net con la cabecera x-push-secret; core-push envía a cada suscripción.
-- Avisos (aprobados por Felipe): cliente pide hablar con una persona · lead nuevo · lead sin respuesta a los 5 min
-- · cotización vista · reunión en 1 hora.

create table if not exists core.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  activa boolean not null default true,
  fallos int not null default 0,
  creado_en timestamptz not null default now(),
  ultimo_envio timestamptz
);
alter table core.push_suscripciones enable row level security;

create table if not exists core.push_log (
  clave text primary key,
  titulo text,
  enviado_en timestamptz not null default now()
);
alter table core.push_log enable row level security;

-- Suscribir este dispositivo (lo llama la app al activar avisos)
create or replace function public.app_push_suscribir(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform core.exigir_usuario();
  if nullif(p->>'endpoint', '') is null or nullif(p#>>'{keys,p256dh}', '') is null then raise exception 'Suscripción inválida'; end if;
  insert into core.push_suscripciones (user_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p->>'endpoint', p#>>'{keys,p256dh}', p#>>'{keys,auth}', left(p->>'dispositivo', 200))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    dispositivo = excluded.dispositivo, activa = true, fallos = 0;
  return jsonb_build_object('ok', true, 'dispositivos', (select count(*) from core.push_suscripciones where user_id = auth.uid() and activa));
end $$;

create or replace function public.app_push_clave()
returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'push_vapid_publica'
$$;

-- Envía un aviso a todos los dispositivos del dueño. clave evita repetir el mismo aviso.
create or replace function core.push(p_titulo text, p_cuerpo text, p_href text default '#/bandeja', p_clave text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_secreto text;
begin
  if coalesce(current_setting('core.sin_push', true), '') = '1' then return; end if;
  if not exists (select 1 from core.push_suscripciones where activa) then return; end if;
  if p_clave is not null then
    insert into core.push_log (clave, titulo) values (p_clave, p_titulo) on conflict (clave) do nothing;
    if not found then return; end if;
  end if;
  select decrypted_secret into v_secreto from vault.decrypted_secrets where name = 'push_secreto';
  perform net.http_post(
    url := 'https://tvjpwwwnpchecolcsnxp.supabase.co/functions/v1/core-push',
    body := jsonb_build_object('title', p_titulo, 'body', p_cuerpo, 'href', p_href, 'tag', coalesce(p_clave, gen_random_uuid()::text)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secreto),
    timeout_milliseconds := 10000);
exception when others then
  raise warning 'core.push: %', sqlerrm;  -- un aviso fallido nunca bloquea el negocio
end $$;
revoke execute on function core.push(text, text, text, text) from public, anon, authenticated;

-- 1) Cliente pide hablar con una persona: el asesor crea una tarea «[WhatsApp] …» al traspasar
create or replace function core.push_tarea_traspaso() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_conv uuid;
begin
  if new.titulo like '[WhatsApp]%' then
    select id into v_conv from wa.conversaciones where new.oportunidad_id is not null and oportunidad_id = new.oportunidad_id limit 1;
    perform core.push('Cliente pide hablar contigo', regexp_replace(new.titulo, '^\[WhatsApp\]\s*', ''),
      case when v_conv is not null then '#/conversaciones/' || v_conv else '#/conversaciones' end, 'traspaso:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists push_traspaso on ops.tareas;
create trigger push_traspaso after insert on ops.tareas for each row execute function core.push_tarea_traspaso();

-- 2) Lead nuevo (no los de prospección BlackGPS ni cargas masivas)
create or replace function core.push_lead_nuevo() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nom text;
begin
  if new.estado = 'abierta' and coalesce(new.origen, '') not in ('prospeccion_blackgps', 'asisma_csv') then
    select nombre into v_nom from crm.empresas where id = new.empresa_id;
    perform core.push('Lead nuevo · ' || coalesce(v_nom, 'sin nombre'),
      initcap(case new.unidad when 'carwash' then 'Carwash.hf' when 'nom' then 'NOM' when 'blackgps' then 'BlackGPS' else new.unidad end)
        || coalesce(' · ' || new.canal, '') || coalesce(' · ' || new.campana, ''),
      '#/cliente/' || new.empresa_id, 'lead:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists push_lead on crm.oportunidades;
create trigger push_lead after insert on crm.oportunidades for each row execute function core.push_lead_nuevo();

-- 3) Cotización vista por el cliente (primera vez)
create or replace function core.push_cotizacion_vista() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nom text;
begin
  if new.vista_en is not null and old.vista_en is null then
    select nombre into v_nom from crm.empresas where id = new.empresa_id;
    perform core.push('Cotización vista · ' || coalesce(v_nom, new.numero), 'El cliente abrió la cotización ' || coalesce(new.numero, ''), '#/cot/' || new.id, 'vista:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists push_vista on crm.cotizaciones;
create trigger push_vista after update of vista_en on crm.cotizaciones for each row execute function core.push_cotizacion_vista();

-- La respuesta del asesor IA también cuenta como primera respuesta (SLA de 5 min y dashboard)
create or replace function core.primera_respuesta_asesor() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.direccion = 'saliente_api' then
    update crm.oportunidades o set primera_respuesta_en = coalesce(o.primera_respuesta_en, coalesce(new.enviado_en, now()))
      from wa.conversaciones c where c.id = new.conversacion_id and o.id = c.oportunidad_id and o.primera_respuesta_en is null;
  end if;
  return null;
end $$;
drop trigger if exists primera_respuesta_asesor on wa.mensajes;
create trigger primera_respuesta_asesor after insert on wa.mensajes for each row execute function core.primera_respuesta_asesor();

-- 4) Revisión cada minuto: lead sin respuesta a los 5 min y reunión/cita en 1 hora
create or replace function core.push_revisar() returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select o.id, o.empresa_id, o.unidad, e.nombre from crm.oportunidades o join crm.empresas e on e.id = o.empresa_id
            where o.estado = 'abierta' and o.primera_respuesta_en is null and o.unidad in ('carclass', 'nom', 'carwash')
              and o.creado_en between now() - interval '30 minutes' and now() - interval '5 minutes' loop
    perform core.push('Sin respuesta hace 5 min · ' || r.nombre, 'El objetivo es responder en 5 minutos', '#/cliente/' || r.empresa_id, 'sla:' || r.id);
  end loop;
  for r in select ci.id, ci.tipo, ci.inicio, ci.lugar, c.nombre, ci.conversacion_id from wa.citas ci join wa.conversaciones c on c.id = ci.conversacion_id
            where ci.estado in ('reservada', 'confirmada') and ci.inicio between now() + interval '50 minutes' and now() + interval '65 minutes' loop
    perform core.push('En 1 hora · ' || coalesce(r.nombre, 'cita'),
      replace(r.tipo, '_', ' ') || ' a las ' || to_char(r.inicio at time zone 'America/Santiago', 'HH24:MI') || coalesce(' · ' || r.lugar, ''),
      '#/conversaciones/' || r.conversacion_id, 'cita1h:' || r.id);
  end loop;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'core_push_revisar';
select cron.schedule('core_push_revisar', '* * * * *', 'select core.push_revisar()');

revoke execute on function public.app_push_suscribir(jsonb), public.app_push_clave() from public, anon;
grant execute on function public.app_push_suscribir(jsonb), public.app_push_clave() to authenticated;
