-- core_v84 · Aviso «Lead nuevo» con nombre e interés (Felipe 23-nov: «Lead nuevo · .» no sirve).
-- Los leads de WhatsApp ya no se avisan al crearse (solo traen el nombre de perfil, a veces «.»): core.push_revisar,
-- que corre cada minuto, los avisa cuando el asesor ya respondió (y llenó la ficha) o a los 2 minutos, lo que pase primero.
-- Título: «Lead nuevo · Carclass · Nicole». Cuerpo: «Sellado cerámico · MG ZX 2027 · anuncio «Tu pintura, protegida por años»».

create or replace function core.texto_lead(p_op uuid) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare o record; c record; v_nom text; v_int text; v_auto text; v_h text; v_uni text;
  con_letras constant text := '[A-Za-zÁÉÍÓÚÑáéíóúñ]{2,}';
begin
  select op.*, e.nombre empresa_nombre, e.telefono_norm emp_tel into o
    from crm.oportunidades op left join crm.empresas e on e.id = op.empresa_id where op.id = p_op;
  if o.id is null then return null; end if;
  select * into c from wa.conversaciones where oportunidad_id = p_op order by creado_en desc limit 1;

  -- Nombre: ficha > perfil de WhatsApp > ficha de Core (si tienen letras y no son «Lead 569…»), si no «Sin nombre ·1234»
  v_nom := coalesce(
    nullif(trim(c.ficha->>'nombre'), ''),
    case when c.nombre ~ con_letras then trim(c.nombre) end,
    case when o.empresa_nombre ~ con_letras and o.empresa_nombre !~* '^lead ' then trim(o.empresa_nombre) end,
    'Sin nombre · ' || right(coalesce(c.telefono_norm, o.emp_tel, ''), 4));

  v_uni := case o.unidad when 'carwash' then 'Carwash.hf' when 'nom' then 'NOM' when 'blackgps' then 'BlackGPS' when 'carclass' then 'Carclass' else initcap(coalesce(o.unidad, 'Sin línea')) end;
  v_h := coalesce(c.referral->>'headline', o.campana);

  v_int := case
    when o.unidad = 'nom' then case o.flujo when 'consignante' then 'Quiere consignar su auto' when 'comprador' then 'Busca comprar un auto'
                                            when 'compra_directa' then 'Quiere vender ya (compra directa)' else 'Consulta NOM' end
    when nullif(c.ficha->>'servicio_interes', '') is not null then c.ficha->>'servicio_interes'
    when v_h ~* 'ppf|film|piedr|piquete' then 'PPF'
    when v_h ~* 'cer[aá]mic|sellad|pintura|brillo' then 'Sellado cerámico'
    when v_h ~* 'l[aá]min|vidrio|polarizad' then 'Láminas de seguridad'
    when o.unidad = 'blackgps' then 'GPS para flota'
    else null end;
  v_int := upper(left(v_int, 1)) || substr(v_int, 2);

  v_auto := nullif(trim(concat_ws(' ', c.ficha->>'marca', c.ficha->>'modelo', c.ficha->>'anio')), '');

  return jsonb_build_object(
    'titulo', 'Lead nuevo · ' || v_uni || ' · ' || v_nom,
    'cuerpo', coalesce(nullif(concat_ws(' · ', v_int, v_auto, case when v_h is not null then 'anuncio «' || v_h || '»' end, case when c.id is null and o.canal is not null then o.canal end), ''), 'Revisa la conversación'),
    'href', case when c.id is not null then '#/conversaciones/' || c.id else '#/cliente/' || o.empresa_id end);
end $$;
revoke all on function core.texto_lead(uuid) from public, anon, authenticated;

-- Al crearse: solo los leads que no vienen de WhatsApp (formularios, manuales) se avisan de inmediato
create or replace function core.push_lead_nuevo() returns trigger
language plpgsql security definer set search_path to '' as $$
declare t jsonb;
begin
  if new.estado = 'abierta' and coalesce(new.origen, '') not in ('prospeccion_blackgps', 'asisma_csv', 'asisma')
     and coalesce(new.canal, '') <> 'whatsapp' then
    t := core.texto_lead(new.id);
    perform core.push(t->>'titulo', t->>'cuerpo', t->>'href', 'lead:' || new.id);
  end if;
  return null;
end $$;

create or replace function core.push_revisar() returns void
language plpgsql security definer set search_path to '' as $$
declare r record; t jsonb;
begin
  -- Lead nuevo de WhatsApp: cuando el asesor ya respondió o a los 2 minutos (con nombre e interés)
  for r in select o.id from crm.oportunidades o
            where o.estado = 'abierta' and o.canal = 'whatsapp' and o.creado_en > now() - interval '30 minutes'
              and (o.primera_respuesta_en is not null or o.creado_en < now() - interval '2 minutes')
              and not exists (select 1 from core.push_log l where l.clave = 'lead:' || o.id) loop
    t := core.texto_lead(r.id);
    perform core.push(t->>'titulo', t->>'cuerpo', t->>'href', 'lead:' || r.id);
  end loop;
  for r in select o.id, o.empresa_id, o.unidad, e.nombre from crm.oportunidades o join crm.empresas e on e.id = o.empresa_id
            where o.estado = 'abierta' and o.primera_respuesta_en is null and o.unidad in ('carclass', 'nom', 'carwash')
              and o.creado_en between now() - interval '30 minutes' and now() - interval '5 minutes' loop
    t := core.texto_lead(r.id);
    perform core.push('Sin respuesta hace 5 min · ' || substr(t->>'titulo', length('Lead nuevo · ') + 1), 'El objetivo es responder en 5 minutos', t->>'href', 'sla:' || r.id);
  end loop;
  for r in select ci.id, ci.tipo, ci.inicio, ci.lugar, c.nombre, ci.conversacion_id from wa.citas ci join wa.conversaciones c on c.id = ci.conversacion_id
            where ci.estado in ('reservada', 'confirmada') and ci.inicio between now() + interval '50 minutes' and now() + interval '65 minutes' loop
    perform core.push('En 1 hora · ' || coalesce(r.nombre, 'cita'),
      replace(r.tipo, '_', ' ') || ' a las ' || to_char(r.inicio at time zone 'America/Santiago', 'HH24:MI') || coalesce(' · ' || r.lugar, ''),
      '#/conversaciones/' || r.conversacion_id, 'cita1h:' || r.id);
  end loop;
end $$;
