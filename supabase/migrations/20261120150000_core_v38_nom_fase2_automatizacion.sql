-- core_v38 · NOM Fase 2: automatización del flujo consignante por WhatsApp (Felipe, 20-nov-2026)
--   lead → asesor toma datos → tasación + investigación de mercado en segundo plano → aviso «lista para aprobar»
--   → Felipe aprueba (1.ª aprobación) → el informe sale solo por WhatsApp → visita en Chicureo (bloques 10:00 / 15:00)
--   → fee $50.000 por transferencia (2.ª aprobación: Felipe valida el pago) → recordatorio el día anterior.
-- Momento del cobro configurable: nom.automatizacion.fee_momento = 'en_visita' (por defecto) | 'al_agendar'.
-- Nada se envía a clientes mientras el modo del asesor para NOM no sea «activo» (wa.config agente_modo_nom).

insert into core.parametros (clave, valor) values ('nom.automatizacion', jsonb_build_object(
  'fee_momento', 'en_visita',
  'fee_monto', 50000,
  'retener_cupo_horas', 24,
  'anticipacion_horas', 18,
  'dias_a_ofrecer', 12,
  'recordatorio_hora', '18:00',
  'calendario', 'fmontecinos@carclass.cl',
  'informe_url', 'https://app.carclass.cl/#/t/',
  'investigacion_modelo', 'claude-sonnet-5-5',
  'investigacion_max_busquedas', 8,
  'investigacion_max_lecturas', 12,
  'anio_minimo', 2015,
  'nota', 'Felipe 20-nov-2026: transferencia bancaria (sin link de pago por ahora); calendario de carclass.cl'))
on conflict (clave) do update set valor = core.parametros.valor || excluded.valor;

-- ------------------------------------------------------------------------------------------
-- Tablas
-- ------------------------------------------------------------------------------------------
create table if not exists nom.investigaciones (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid not null references nom.tasaciones(id) on delete cascade,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_curso','lista','error','cancelada')),
  intentos int not null default 0,
  bloqueado_hasta timestamptz,
  resultado jsonb,
  error text,
  costo_usd numeric,
  creado_en timestamptz not null default now(),
  terminado_en timestamptz
);
create unique index if not exists nom_investigaciones_abierta on nom.investigaciones (tasacion_id) where estado in ('pendiente','en_curso');

create table if not exists nom.visitas (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid references nom.tasaciones(id),
  oportunidad_id uuid references crm.oportunidades(id),
  empresa_id uuid references crm.empresas(id),
  conversacion_id uuid references wa.conversaciones(id),
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text not null default 'reservada' check (estado in ('pendiente_pago','reservada','confirmada','realizada','no_asistio','cancelada')),
  fee_monto bigint not null default 50000,
  fee_momento text not null default 'en_visita' check (fee_momento in ('en_visita','al_agendar')),
  fee_estado text not null default 'pendiente' check (fee_estado in ('pendiente','comprobante_recibido','pagado','exento','rechazado')),
  fee_comprobante_mensaje uuid,
  fee_validado_por text,
  fee_validado_en timestamptz,
  retener_hasta timestamptz,
  nombre text, email text, telefono text, vehiculo text,
  gcal_event_id text,
  gcal_estado text not null default 'pendiente' check (gcal_estado in ('pendiente','creado','sin_conexion','error','cancelado','no_aplica')),
  gcal_error text,
  recordatorio_en timestamptz,
  motivo_cancelacion text,
  notas text,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create unique index if not exists nom_visitas_cupo on nom.visitas (inicio) where estado in ('pendiente_pago','reservada','confirmada');
create index if not exists nom_visitas_conv on nom.visitas (conversacion_id);

-- Mensajes que salen sin que el cliente haya escrito (informe aprobado, confirmaciones, recordatorios)
create table if not exists nom.salientes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references wa.conversaciones(id),
  tipo text not null check (tipo in ('tasacion_aprobada','visita_confirmada','recordatorio','cupo_liberado')),
  referencia uuid not null,
  mensajes jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','enviado','sin_ventana','retenido','error','cancelado')),
  intentos int not null default 0,
  error text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  unique (tipo, referencia)
);

alter table nom.investigaciones enable row level security;
alter table nom.visitas enable row level security;
alter table nom.salientes enable row level security;
revoke all on nom.investigaciones, nom.visitas, nom.salientes from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- Utilidades
-- ------------------------------------------------------------------------------------------
create or replace function nom.auto(p_clave text) returns text language sql stable set search_path = '' as $$
  select valor->>p_clave from core.parametros where clave = 'nom.automatizacion' $$;

create or replace function nom.miles(n bigint) returns text language sql immutable set search_path = '' as $$
  select '$' || replace(to_char(n, 'FM999,999,999,999'), ',', '.') $$;

create or replace function nom.fecha_txt(t timestamptz) returns text language sql stable set search_path = '' as $$
  select (array['domingo','lunes','martes','miércoles','jueves','viernes','sábado'])[extract(dow from t at time zone 'America/Santiago')::int + 1]
      || ' ' || extract(day from t at time zone 'America/Santiago')::int
      || ' de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month from t at time zone 'America/Santiago')::int]
      || ' a las ' || to_char(t at time zone 'America/Santiago', 'HH24:MI') $$;

-- Cupos libres de visita NOM: lunes a viernes, bloques de nom.oficina, desde la anticipación mínima.
-- El calendario de Google se cruza después (wa-agente / nom-automata) si está conectado.
create or replace function nom.cupos(p_desde timestamptz default now(), p_dias int default null)
returns table (inicio timestamptz, fin timestamptz, texto text) language sql stable set search_path = '' as $$
  with o as (select valor v from core.parametros where clave = 'nom.oficina'),
  dias as (
    select (p_desde at time zone 'America/Santiago')::date + g as d
    from generate_series(0, coalesce(p_dias, (select coalesce(nom.auto('dias_a_ofrecer')::int, 12)))) g
  ),
  c as (
    select (d + b::time) at time zone 'America/Santiago' as inicio,
           ((d + b::time) at time zone 'America/Santiago') + make_interval(mins => coalesce((o.v->>'duracion_visita_min')::int, 120)) as fin
    from dias, o, jsonb_array_elements_text(coalesce(o.v->'bloques', '["10:00","15:00"]'::jsonb)) b
    where extract(isodow from d) between 1 and 5
  )
  select c.inicio, c.fin, nom.fecha_txt(c.inicio)
  from c
  where c.inicio >= p_desde + make_interval(hours => coalesce(nom.auto('anticipacion_horas')::int, 18))
    and not exists (
      select 1 from nom.visitas v
      where (v.estado in ('reservada','confirmada') or (v.estado = 'pendiente_pago' and coalesce(v.retener_hasta, 'infinity') > now()))
        and v.inicio < c.fin and v.fin > c.inicio)
  order by c.inicio
$$;

-- Conversación NOM con su contexto (para las funciones del asesor)
create or replace function nom.conv(p_conv uuid) returns wa.conversaciones language plpgsql stable set search_path = '' as $$
declare c wa.conversaciones;
begin
  select * into c from wa.conversaciones where id = p_conv;
  if c.id is null then raise exception 'Conversación no encontrada'; end if;
  if coalesce(c.unidad, '') <> 'nom' then raise exception 'La conversación no está asignada a NOM'; end if;
  return c;
end $$;

-- Tasación vigente de una conversación (la última no anulada ni reemplazada)
create or replace function nom.tasacion_de_conv(p_conv uuid) returns nom.tasaciones language sql stable set search_path = '' as $$
  select t.* from nom.tasaciones t
  where t.conversacion_id = p_conv and t.estado not in ('anulada','reemplazada')
  order by t.creado_en desc limit 1 $$;

-- ------------------------------------------------------------------------------------------
-- API del asesor de WhatsApp (core.api_nom_wa_*): las llama wa-agente con el autor «Agente IA»
-- ------------------------------------------------------------------------------------------

-- Pide la tasación: crea la ficha y deja la investigación de mercado en cola. Idempotente por conversación.
create or replace function core.api_nom_wa_solicitar_tasacion(p_conv uuid, p jsonb, p_autor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c wa.conversaciones; t nom.tasaciones; v uuid; v_min int := coalesce(nom.auto('anio_minimo')::int, 2015);
begin
  perform set_config('core.autor', coalesce(p_autor, 'Agente IA'), true);
  c := nom.conv(p_conv);
  t := nom.tasacion_de_conv(p_conv);
  if t.id is not null then
    return jsonb_build_object('folio', t.folio, 'ya_existia', true, 'estado', t.estado,
      'investigacion', (select estado from nom.investigaciones where tasacion_id = t.id order by creado_en desc limit 1));
  end if;
  if nullif(p->>'anio','')::int < v_min then raise exception 'Año % bajo el mínimo de NOM (%)', p->>'anio', v_min; end if;
  if nullif(p->>'km','') is null then raise exception 'Falta el kilometraje'; end if;
  v := nom.crear(jsonb_build_object(
    'origen', 'whatsapp', 'conversacion_id', c.id, 'oportunidad_id', c.oportunidad_id, 'empresa_id', c.empresa_id,
    'marca', p->>'marca', 'modelo', p->>'modelo', 'version', p->>'version', 'version_confirmada', false,
    'anio', p->>'anio', 'km', p->>'km', 'transmision', p->>'transmision', 'combustible', p->>'combustible', 'traccion', p->>'traccion',
    'color', p->>'color', 'patente', p->>'patente', 'duenos', p->>'duenos', 'observaciones', p->>'observaciones',
    'fuentes', jsonb_build_object('ficha', 'declarado_por_cliente_whatsapp')));
  if nullif(p->>'precio_esperado','') is not null then
    perform nom.guardar_interna(v, jsonb_build_object('precio_pretendido_cliente', (p->>'precio_esperado')::bigint,
      'urgencia', p->>'urgencia', 'notas_negociacion', p->>'notas'));
  end if;
  insert into nom.investigaciones (tasacion_id) values (v);
  if c.oportunidad_id is not null then
    insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
    values (c.oportunidad_id, c.empresa_id, 'whatsapp', 'tasacion_solicitada',
            'Tasación solicitada por WhatsApp: ' || concat_ws(' ', p->>'marca', p->>'modelo', p->>'version', p->>'anio') || ', ' || (p->>'km') || ' km', core.autor());
  end if;
  return jsonb_build_object('folio', (select folio from nom.tasaciones where id = v), 'ya_existia', false, 'estado', 'en_investigacion');
end $$;

-- Estado de la tasación y de la visita de la conversación (para que el asesor sepa en qué va)
create or replace function core.api_nom_wa_estado(p_conv uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; vi nom.visitas; inv text;
begin
  t := nom.tasacion_de_conv(p_conv);
  select * into vi from nom.visitas where conversacion_id = p_conv and estado in ('pendiente_pago','reservada','confirmada') order by inicio desc limit 1;
  if t.id is not null then select estado into inv from nom.investigaciones where tasacion_id = t.id order by creado_en desc limit 1; end if;
  return jsonb_build_object(
    'tasacion', case when t.id is null then null else jsonb_build_object(
      'folio', t.folio,
      'estado', case when t.estado in ('aprobada','enviada') then t.estado
                     when inv in ('pendiente','en_curso') then 'en_investigacion'
                     else 'en_revision_de_felipe' end,
      'vehiculo', concat_ws(' ', t.marca, t.modelo, t.version, t.anio),
      -- Al cliente solo se le informan cifras de una tasación aprobada
      'precio_publicacion_sugerido', case when t.estado in ('aprobada','enviada') then t.precio_publicacion end,
      'informe_url', case when t.estado in ('aprobada','enviada') then nom.auto('informe_url') || t.token end) end,
    'visita', case when vi.id is null then null else jsonb_build_object(
      'id', vi.id, 'cuando', nom.fecha_txt(vi.inicio), 'estado', vi.estado, 'fee_estado', vi.fee_estado,
      'fee_momento', vi.fee_momento, 'retener_hasta', vi.retener_hasta) end);
end $$;

-- Reserva un cupo de visita. Requiere tasación aprobada o enviada.
create or replace function core.api_nom_wa_reservar_visita(p_conv uuid, p jsonb, p_autor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c wa.conversaciones; t nom.tasaciones; v_ini timestamptz; v_fin timestamptz; v_id uuid; v_mom text := coalesce(nom.auto('fee_momento'), 'en_visita');
        v_fee bigint := coalesce(nom.auto('fee_monto')::bigint, 50000); v_ret timestamptz; vi nom.visitas;
begin
  perform set_config('core.autor', coalesce(p_autor, 'Agente IA'), true);
  c := nom.conv(p_conv);
  t := nom.tasacion_de_conv(p_conv);
  if t.id is null or t.estado not in ('aprobada','enviada') then raise exception 'Primero debe estar aprobada la tasación'; end if;
  v_ini := ((p->>'inicio')::timestamp) at time zone 'America/Santiago';
  select q.inicio, q.fin into v_ini, v_fin from nom.cupos(now()) q where q.inicio = v_ini;
  if v_fin is null then raise exception 'Ese horario ya no está disponible: vuelve a pedir horarios'; end if;
  -- Una sola visita activa por conversación: reagendar = cancelar la anterior
  update nom.visitas set estado = 'cancelada', motivo_cancelacion = 'reagendada', actualizado_en = now()
  where conversacion_id = p_conv and estado in ('pendiente_pago','reservada','confirmada');
  if v_mom = 'al_agendar' then v_ret := now() + make_interval(hours => coalesce(nom.auto('retener_cupo_horas')::int, 24)); end if;
  insert into nom.visitas (tasacion_id, oportunidad_id, empresa_id, conversacion_id, inicio, fin, estado, fee_monto, fee_momento, retener_hasta,
                           nombre, email, telefono, vehiculo, creado_por)
  values (t.id, c.oportunidad_id, c.empresa_id, c.id, v_ini, v_fin, case when v_mom = 'al_agendar' then 'pendiente_pago' else 'reservada' end,
          v_fee, v_mom, v_ret, coalesce(nullif(p->>'nombre',''), c.nombre), nullif(p->>'email',''), c.telefono,
          concat_ws(' ', t.marca, t.modelo, t.anio, t.patente), core.autor())
  returning * into vi;
  if c.oportunidad_id is not null then
    perform core.api_mover_etapa(jsonb_build_object('oportunidad_id', c.oportunidad_id, 'etapa', 'revision_agendada',
      'proxima_accion', 'Inspección y fotos en Chicureo', 'proxima_fecha', (v_ini at time zone 'America/Santiago')::date), core.autor());
  end if;
  perform core.push('Visita NOM agendada', coalesce(vi.nombre, 'Cliente') || ' · ' || nom.fecha_txt(v_ini) || ' · ' || coalesce(vi.vehiculo, ''), '#/tasaciones', 'nom_visita:' || vi.id);
  return jsonb_build_object('visita_id', vi.id, 'cuando', nom.fecha_txt(v_ini), 'estado', vi.estado,
    'fee', jsonb_build_object('monto', v_fee, 'momento', v_mom, 'retener_hasta', v_ret,
       'como_decirlo', case when v_mom = 'al_agendar'
         then 'La hora queda tomada por ' || coalesce(nom.auto('retener_cupo_horas'), '24') || ' horas; se confirma al recibir la transferencia de ' || nom.miles(v_fee) || ' (no reembolsable, se descuenta de la comisión si se vende).'
         else 'El fee de ' || nom.miles(v_fee) || ' se paga el día de la visita, por transferencia, antes de empezar la inspección (no reembolsable, se descuenta de la comisión si se vende).' end),
    'transferencia', (select valor - 'usos' from core.parametros where clave = 'nom.transferencia'),
    'oficina', (select jsonb_build_object('direccion', valor->>'direccion', 'sector', valor->>'sector', 'comuna', valor->>'comuna') from core.parametros where clave = 'nom.oficina'),
    'preparacion', (select valor->'preparacion_cliente' from core.parametros where clave = 'nom.oficina'));
end $$;

-- Cancelar una visita a pedido del cliente
create or replace function core.api_nom_wa_cancelar_visita(p_conv uuid, p_motivo text, p_autor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform set_config('core.autor', coalesce(p_autor, 'Agente IA'), true);
  update nom.visitas set estado = 'cancelada', motivo_cancelacion = coalesce(p_motivo, 'cliente'), actualizado_en = now()
  where conversacion_id = p_conv and estado in ('pendiente_pago','reservada','confirmada');
  get diagnostics n = row_count;
  if n > 0 then perform core.push('Visita NOM cancelada', coalesce(p_motivo, 'El cliente canceló'), '#/tasaciones', null); end if;
  return jsonb_build_object('canceladas', n);
end $$;

-- Llegó un comprobante: queda pendiente de validación (2.ª aprobación de Felipe)
create or replace function core.api_nom_wa_comprobante(p_conv uuid, p jsonb, p_autor text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare vi nom.visitas; c wa.conversaciones;
begin
  perform set_config('core.autor', coalesce(p_autor, 'Agente IA'), true);
  c := nom.conv(p_conv);
  select * into vi from nom.visitas where conversacion_id = p_conv and estado in ('pendiente_pago','reservada','confirmada') order by inicio desc limit 1;
  if vi.id is null then raise exception 'No hay visita agendada para este cliente'; end if;
  update nom.visitas set fee_estado = 'comprobante_recibido', fee_comprobante_mensaje = nullif(p->>'mensaje_id','')::uuid,
         notas = concat_ws(' · ', notas, nullif(p->>'nota','')), actualizado_en = now()
  where id = vi.id and fee_estado in ('pendiente','rechazado');
  perform core.api_crear_tarea(jsonb_build_object(
    'titulo', '[WhatsApp] Validar fee NOM ' || nom.miles(coalesce(nullif(p->>'monto','')::bigint, vi.fee_monto)) || ' · ' || coalesce(vi.nombre, c.telefono_norm),
    'descripcion', 'Comprobante recibido por WhatsApp. Revisa la cuenta Santander de la SpA y valida el pago en Core (Tasaciones NOM → Visitas).',
    'unidad', 'nom', 'responsable', 'Felipe', 'vence', (now() at time zone 'America/Santiago')::date, 'prioridad', 'alta',
    'oportunidad_id', vi.oportunidad_id, 'empresa_id', vi.empresa_id), core.autor());
  perform core.push('Validar fee NOM', coalesce(vi.nombre, 'Cliente') || ' envió el comprobante · visita ' || nom.fecha_txt(vi.inicio), '#/tasaciones', 'nom_fee:' || vi.id);
  return jsonb_build_object('estado', 'pendiente de validación');
end $$;

revoke all on function core.api_nom_wa_solicitar_tasacion(uuid, jsonb, text), core.api_nom_wa_estado(uuid), core.api_nom_wa_reservar_visita(uuid, jsonb, text),
  core.api_nom_wa_cancelar_visita(uuid, text, text), core.api_nom_wa_comprobante(uuid, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- Disparadores: investigación lista → aviso; tasación aprobada → informe al cliente
-- ------------------------------------------------------------------------------------------
create or replace function nom.al_aprobar() returns trigger language plpgsql security definer set search_path = '' as $$
declare c wa.conversaciones; v_nombre text;
begin
  if new.estado = 'aprobada' and old.estado is distinct from 'aprobada' and new.origen = 'whatsapp' and new.conversacion_id is not null then
    select * into c from wa.conversaciones where id = new.conversacion_id;
    v_nombre := nullif(split_part(coalesce(c.ficha->>'nombre', c.nombre, ''), ' ', 1), '');
    insert into nom.salientes (conversacion_id, tipo, referencia, mensajes)
    values (new.conversacion_id, 'tasacion_aprobada', new.id, jsonb_build_array(
      'Listo' || coalesce(', ' || v_nombre, '') || '. Te comparto el informe de tasación de tu ' || concat_ws(' ', new.marca, new.modelo, new.anio) || ': '
        || nom.auto('informe_url') || new.token,
      'Con el mercado de hoy, el precio sugerido de publicación es *' || nom.miles(new.precio_publicacion) || '*. '
        || 'El siguiente paso es una visita de 2 horas en nuestra oficina de Chicureo para inspeccionar el auto y tomar las fotos de la publicación. ¿Te propongo horarios?'))
    on conflict (tipo, referencia) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists nom_al_aprobar on nom.tasaciones;
create trigger nom_al_aprobar after update of estado on nom.tasaciones for each row execute function nom.al_aprobar();

-- ------------------------------------------------------------------------------------------
-- Tic de la automatización (lo llama nom-automata cada minuto): cupos vencidos y recordatorios
-- ------------------------------------------------------------------------------------------
create or replace function nom.tick() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; n_lib int := 0; n_rec int := 0; v_hora time := coalesce(nom.auto('recordatorio_hora'), '18:00')::time;
        v_local timestamp := now() at time zone 'America/Santiago';
begin
  -- Cupos retenidos sin pago a tiempo (solo con fee al agendar)
  for r in update nom.visitas set estado = 'cancelada', motivo_cancelacion = 'sin pago a tiempo', actualizado_en = now()
           where estado = 'pendiente_pago' and retener_hasta < now() and fee_estado <> 'comprobante_recibido' returning * loop
    n_lib := n_lib + 1;
    insert into nom.salientes (conversacion_id, tipo, referencia, mensajes) values (r.conversacion_id, 'cupo_liberado', r.id, jsonb_build_array(
      'Hola' || coalesce(', ' || split_part(r.nombre, ' ', 1), '') || '. No alcanzamos a recibir la transferencia, así que liberé la hora del ' || nom.fecha_txt(r.inicio)
      || '. Si quieres, te propongo otros horarios.')) on conflict do nothing;
  end loop;
  -- Recordatorio el día anterior, desde la hora configurada
  if v_local::time >= v_hora then
    for r in select * from nom.visitas
             where estado in ('reservada','confirmada') and recordatorio_en is null
               and creado_en < now() - interval '6 hours'
               and (inicio at time zone 'America/Santiago')::date = v_local::date + 1 loop
      insert into nom.salientes (conversacion_id, tipo, referencia, mensajes) values (r.conversacion_id, 'recordatorio', r.id, jsonb_build_array(
        'Hola' || coalesce(', ' || split_part(r.nombre, ' ', 1), '') || '. Te recuerdo nuestra visita de mañana, ' || nom.fecha_txt(r.inicio) || ', en '
          || (select valor->>'direccion' from core.parametros where clave = 'nom.oficina') || ', Chicureo. Dura unas 2 horas.',
        'Para aprovechar la visita: ' || (select string_agg(lower(left(x, 1)) || substr(x, 2), '; ') from jsonb_array_elements_text(
          (select valor->'preparacion_cliente' from core.parametros where clave = 'nom.oficina')) x) || '.'
          || case when r.fee_momento = 'en_visita' and r.fee_estado <> 'pagado' then ' El fee de ' || nom.miles(r.fee_monto) || ' se paga al llegar, por transferencia.' else '' end,
        '¿Me confirmas que nos vemos mañana?')) on conflict do nothing;
      update nom.visitas set recordatorio_en = now() where id = r.id;
      n_rec := n_rec + 1;
    end loop;
  end if;
  return jsonb_build_object('cupos_liberados', n_lib, 'recordatorios', n_rec);
end $$;

-- ------------------------------------------------------------------------------------------
-- App (solo dueño): visitas y validación del fee
-- ------------------------------------------------------------------------------------------
create or replace function public.app_nom_visitas(p_desde date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not core.es_dueno() then raise exception 'Solo el dueño ve las visitas NOM'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'inicio', v.inicio, 'cuando', nom.fecha_txt(v.inicio), 'estado', v.estado, 'fee_monto', v.fee_monto, 'fee_momento', v.fee_momento,
      'fee_estado', v.fee_estado, 'retener_hasta', v.retener_hasta, 'nombre', v.nombre, 'telefono', v.telefono, 'email', v.email, 'vehiculo', v.vehiculo,
      'gcal_estado', v.gcal_estado, 'tasacion_id', v.tasacion_id, 'folio', t.folio, 'conversacion_id', v.conversacion_id, 'empresa_id', v.empresa_id,
      'motivo_cancelacion', v.motivo_cancelacion) order by v.inicio)
    from nom.visitas v left join nom.tasaciones t on t.id = v.tasacion_id
    where v.inicio >= coalesce(p_desde, (now() at time zone 'America/Santiago')::date - 7)), '[]'::jsonb);
end $$;

create or replace function public.app_nom_visita_accion(p_id uuid, p_accion text, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare vi nom.visitas;
begin
  if not core.es_dueno() then raise exception 'Solo el dueño gestiona las visitas NOM'; end if;
  select * into vi from nom.visitas where id = p_id for update;
  if vi.id is null then raise exception 'Visita no encontrada'; end if;
  if p_accion = 'fee_pagado' then
    update nom.visitas set fee_estado = 'pagado', fee_validado_por = core.autor(), fee_validado_en = now(),
      estado = case when estado in ('pendiente_pago','reservada') then 'confirmada' else estado end, retener_hasta = null, actualizado_en = now()
    where id = p_id;
    if vi.estado = 'pendiente_pago' and vi.conversacion_id is not null then
      insert into nom.salientes (conversacion_id, tipo, referencia, mensajes) values (vi.conversacion_id, 'visita_confirmada', vi.id, jsonb_build_array(
        'Recibimos tu transferencia, gracias. Tu visita queda confirmada para el ' || nom.fecha_txt(vi.inicio) || ' en '
        || (select valor->>'direccion' from core.parametros where clave = 'nom.oficina') || ', Chicureo. ✅'))
      on conflict do nothing;
    end if;
    update ops.tareas set estado = 'hecha' where estado in ('pendiente','en_curso') and oportunidad_id = vi.oportunidad_id and titulo like '[WhatsApp] Validar fee NOM%';
  elsif p_accion = 'fee_rechazado' then
    update nom.visitas set fee_estado = 'rechazado', notas = concat_ws(' · ', notas, p_nota), actualizado_en = now() where id = p_id;
  elsif p_accion = 'fee_exento' then
    update nom.visitas set fee_estado = 'exento', fee_validado_por = core.autor(), fee_validado_en = now(), notas = concat_ws(' · ', notas, p_nota),
      estado = case when estado = 'pendiente_pago' then 'confirmada' else estado end, retener_hasta = null, actualizado_en = now() where id = p_id;
  elsif p_accion = 'confirmar' then
    update nom.visitas set estado = 'confirmada', retener_hasta = null, actualizado_en = now() where id = p_id and estado in ('pendiente_pago','reservada');
  elsif p_accion = 'realizada' then
    update nom.visitas set estado = 'realizada', actualizado_en = now() where id = p_id;
    if vi.oportunidad_id is not null then
      perform core.api_mover_etapa(jsonb_build_object('oportunidad_id', vi.oportunidad_id, 'etapa', 'revisado',
        'proxima_accion', 'Propuesta y contrato de consignación', 'proxima_fecha', ((now() at time zone 'America/Santiago')::date + 1)), core.autor());
    end if;
  elsif p_accion = 'no_asistio' then
    update nom.visitas set estado = 'no_asistio', actualizado_en = now() where id = p_id;
  elsif p_accion = 'cancelar' then
    update nom.visitas set estado = 'cancelada', motivo_cancelacion = coalesce(p_nota, 'Felipe'), actualizado_en = now() where id = p_id;
  else raise exception 'Acción inválida: %', p_accion;
  end if;
  return (select to_jsonb(v) from nom.visitas v where v.id = p_id);
end $$;

grant execute on function public.app_nom_visitas(date), public.app_nom_visita_accion(uuid, text, text) to authenticated;
revoke all on function nom.tick(), nom.cupos(timestamptz, int) from public, anon, authenticated;

-- ------------------------------------------------------------------------------------------
-- Cron: nom-automata cada minuto (investigación, envíos, calendario, recordatorios)
-- ------------------------------------------------------------------------------------------
select cron.unschedule('nom-automata') where exists (select 1 from cron.job where jobname = 'nom-automata');
select cron.schedule('nom-automata', '* * * * *', $cron$
  select net.http_post(
    url := 'https://tvjpwwwnpchecolcsnxp.supabase.co/functions/v1/nom-automata',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-agente-secret', (select valor from wa.config where clave = 'agente_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 2000)
$cron$);
