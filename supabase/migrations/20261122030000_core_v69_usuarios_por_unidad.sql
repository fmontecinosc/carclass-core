-- core_v69 · Brechas para futuros usuarios (Felipe 22-nov: «resuelve las brechas referente a los usuarios»).
-- 1) Conversaciones de WhatsApp: cada usuario ve y gestiona solo las de sus unidades; las sin unidad, los contactos
--    y el paso a «personal» (que borra los mensajes) quedan solo para el dueño.
-- 2) Fichas y oportunidades: editar exige acceso a la unidad (core.puede); una ficha se edita si el usuario tiene
--    alguna oportunidad de sus unidades en ella.
-- 3) Las 29 tablas antiguas public.* abiertas a cualquier usuario autenticado pasan a solo dueño.
-- Para el dueño nada cambia: core.puede() y core.es_dueno() le devuelven verdadero siempre.

create or replace function core.puede_conversacion(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select core.es_dueno() or exists (select 1 from wa.conversaciones c where c.id = p_id and c.unidad is not null and core.puede(c.unidad))
$$;

create or replace function core.puede_empresa(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select core.es_dueno() or exists (select 1 from crm.oportunidades o where o.empresa_id = p_id and core.puede(o.unidad))
$$;

do $$
declare d text; n text;
  procedure_reemplazos jsonb := jsonb_build_array(
    jsonb_build_array('public.app_conversaciones()',
      E'      where c.estado in (''lead'', ''sin_unidad'', ''contacto'')\n    ) x)',
      E'      where c.estado in (''lead'', ''sin_unidad'', ''contacto'')\n        and (core.es_dueno() or (c.unidad is not null and core.puede(c.unidad)))\n    ) x)'),
    jsonb_build_array('public.app_conversacion(uuid)',
      'if c.id is null then return null; end if;',
      'if c.id is null or not core.puede_conversacion(c.id) then return null; end if;'),
    jsonb_build_array('public.app_conversacion_atender(uuid,text)',
      'perform core.exigir_usuario();',
      'perform core.exigir_usuario(); if not core.puede_conversacion(p_id) then raise exception ''Sin acceso a esta conversación''; end if;'),
    jsonb_build_array('public.app_conversacion_clasificar(uuid,text,text,boolean)',
      'if c.id is null then raise exception ''Conversación no encontrada''; end if;',
      'if c.id is null or not core.puede_conversacion(c.id) then raise exception ''Conversación no encontrada''; end if;
  if p_destino = ''personal'' and not core.es_dueno() then raise exception ''Solo el dueño marca chats como personales''; end if;
  if p_destino <> ''personal'' and not core.puede(p_destino) then raise exception ''Sin acceso a esa unidad''; end if;'),
    jsonb_build_array('public.app_borrador_descartar(uuid)',
      'perform core.exigir_usuario();',
      'perform core.exigir_usuario(); if not core.puede_conversacion((select conversacion_id from wa.borradores where id = p_id)) then raise exception ''Sin acceso a esta conversación''; end if;'),
    jsonb_build_array('public.app_ficha_guardar(jsonb)',
      'if e.id is null then raise exception ''Cliente no encontrado''; end if;',
      'if e.id is null or not core.puede_empresa(e.id) then raise exception ''Cliente no encontrado''; end if;'),
    jsonb_build_array('public.app_oportunidad_guardar(jsonb)',
      'if o.id is null then raise exception ''Oportunidad no encontrada''; end if;',
      'if o.id is null or not core.puede(o.unidad) then raise exception ''Oportunidad no encontrada''; end if;')
  );
  r jsonb;
begin
  for r in select * from jsonb_array_elements(procedure_reemplazos) loop
    d := pg_get_functiondef((r->>0)::regprocedure);
    if position(r->>2 in d) > 0 then continue; end if; -- ya aplicado
    if position(r->>1 in d) = 0 then raise exception 'core_v69: no encontré el punto de cambio en %', r->>0; end if;
    n := replace(d, r->>1, r->>2);
    execute n;
  end loop;
end $$;

-- 3) Tablas antiguas public.*: de «cualquier autenticado» a solo dueño
do $$
declare pol record;
begin
  for pol in select schemaname, tablename, policyname, cmd from pg_policies
             where schemaname = 'public' and 'authenticated' = any(roles) and qual = 'true' loop
    if pol.cmd in ('SELECT', 'DELETE') then
      execute format('alter policy %I on %I.%I using (core.es_dueno())', pol.policyname, pol.schemaname, pol.tablename);
    elsif pol.cmd = 'INSERT' then
      execute format('alter policy %I on %I.%I with check (core.es_dueno())', pol.policyname, pol.schemaname, pol.tablename);
    else
      execute format('alter policy %I on %I.%I using (core.es_dueno()) with check (core.es_dueno())', pol.policyname, pol.schemaname, pol.tablename);
    end if;
  end loop;
end $$;
