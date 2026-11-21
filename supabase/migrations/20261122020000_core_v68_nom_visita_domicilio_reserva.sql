-- core_v68 · Prueba de inspección y sesión de fotos a domicilio para consignantes NOM (Felipe 21-nov, parámetros en core_v67):
-- la reserva guarda lugar y dirección, aplica el fee según la zona y respeta el cupo semanal y el fin de la prueba.

create or replace function nom.visita_domicilio_cfg() returns jsonb
language sql stable set search_path = '' as $$
  select coalesce((select valor from core.parametros where clave = 'nom.visita_domicilio'), '{}'::jsonb)
$$;

-- ¿La dirección o comuna está en las zonas de la prueba (Chicureo, Lo Barnechea, Chicauma)?
create or replace function nom.en_zona_domicilio(p_texto text) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(p_texto, '') <> '' and exists (
    select 1 from jsonb_array_elements_text(nom.visita_domicilio_cfg()->'zonas') z
    where translate(lower(p_texto), 'áéíóúü', 'aeiouu') like '%' || translate(lower(z), 'áéíóúü', 'aeiouu') || '%')
$$;

-- Fee del servicio de inicio según lugar: oficina = fee normal; domicilio en zona = fee_zona; fuera de zona = fee_fuera_zona
create or replace function nom.fee_visita(p_lugar text, p_ubicacion text) returns bigint
language plpgsql stable set search_path = '' as $$
declare c jsonb := nom.visita_domicilio_cfg(); v_base bigint := coalesce(nom.auto('fee_monto')::bigint, 50000);
begin
  if coalesce(p_lugar, 'oficina') <> 'domicilio' then return v_base; end if;
  if nom.en_zona_domicilio(p_ubicacion) then return coalesce((c->>'fee_zona_clp')::bigint, v_base); end if;
  return coalesce((c->>'fee_fuera_zona_clp')::bigint, 75000);
end $$;

-- Cupos a domicilio que quedan en la semana (lunes a domingo, hora de Chile) de p_inicio; null si la prueba no aplica ese día
create or replace function nom.cupo_domicilio(p_inicio timestamptz) returns integer
language plpgsql stable set search_path = '' as $$
declare c jsonb := nom.visita_domicilio_cfg(); v_dia date := (p_inicio at time zone 'America/Santiago')::date; v_usados int;
begin
  if not coalesce((c->>'activo')::boolean, false) then return null; end if;
  if c->>'prueba_hasta' is not null and v_dia > (c->>'prueba_hasta')::date then return null; end if;
  select count(*) into v_usados from nom.visitas
   where lugar = 'domicilio' and estado in ('pendiente_pago','reservada','confirmada','realizada')
     and date_trunc('week', inicio at time zone 'America/Santiago') = date_trunc('week', p_inicio at time zone 'America/Santiago');
  return greatest(coalesce((c->>'cupo_semanal')::int, 2) - v_usados, 0);
end $$;

create or replace function core.api_nom_wa_reservar_visita(p_conv uuid, p jsonb, p_autor text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c wa.conversaciones; t nom.tasaciones; v_ini timestamptz; v_fin timestamptz; v_mom text := coalesce(nom.auto('fee_momento'), 'en_visita');
        v_fee bigint; v_ret timestamptz; vi nom.visitas;
        v_lugar text := coalesce(nullif(p->>'lugar', ''), 'oficina');
        v_dir text := nullif(trim(concat_ws(', ', nullif(trim(p->>'direccion'), ''), nullif(trim(p->>'comuna'), ''))), '');
        v_cupo int; v_cfg jsonb := nom.visita_domicilio_cfg();
begin
  perform set_config('core.autor', coalesce(p_autor, 'Agente IA'), true);
  if v_lugar not in ('oficina', 'domicilio') then raise exception 'Lugar inválido: oficina o domicilio'; end if;
  c := nom.conv(p_conv);
  t := nom.tasacion_de_conv(p_conv);
  if t.id is null or t.estado not in ('aprobada','enviada') then raise exception 'Primero debe estar aprobada la tasación'; end if;
  v_ini := ((p->>'inicio')::timestamp) at time zone 'America/Santiago';
  select q.inicio, q.fin into v_ini, v_fin from nom.cupos(now()) q where q.inicio = v_ini;
  if v_fin is null then raise exception 'Ese horario ya no está disponible: vuelve a pedir horarios'; end if;
  if v_lugar = 'domicilio' then
    if v_dir is null then raise exception 'Para la visita a domicilio pide la dirección (calle, número y comuna)'; end if;
    v_cupo := nom.cupo_domicilio(v_ini);
    if v_cupo is null then raise exception 'La visita a domicilio no está disponible para esa fecha: ofrece nuestra oficina en Puertas de Chicureo'; end if;
    -- La visita que se reagenda no cuenta contra el cupo
    if v_cupo <= 0 and not exists (select 1 from nom.visitas where conversacion_id = p_conv and lugar = 'domicilio'
           and estado in ('pendiente_pago','reservada','confirmada')
           and date_trunc('week', inicio at time zone 'America/Santiago') = date_trunc('week', v_ini at time zone 'America/Santiago')) then
      raise exception 'No quedan cupos a domicilio esa semana: ofrece nuestra oficina en Puertas de Chicureo o la semana siguiente';
    end if;
  end if;
  v_fee := nom.fee_visita(v_lugar, v_dir);
  update nom.visitas set estado = 'cancelada', motivo_cancelacion = 'reagendada', actualizado_en = now()
  where conversacion_id = p_conv and estado in ('pendiente_pago','reservada','confirmada');
  if v_mom = 'al_agendar' then v_ret := now() + make_interval(hours => coalesce(nom.auto('retener_cupo_horas')::int, 24)); end if;
  insert into nom.visitas (tasacion_id, oportunidad_id, empresa_id, conversacion_id, inicio, fin, estado, fee_monto, fee_momento, retener_hasta,
                           nombre, email, telefono, vehiculo, creado_por, lugar, direccion)
  values (t.id, c.oportunidad_id, c.empresa_id, c.id, v_ini, v_fin, case when v_mom = 'al_agendar' then 'pendiente_pago' else 'reservada' end,
          v_fee, v_mom, v_ret, coalesce(nullif(p->>'nombre',''), c.nombre), nullif(p->>'email',''), c.telefono,
          concat_ws(' ', t.marca, t.modelo, t.anio, t.patente), core.autor(), v_lugar, case when v_lugar = 'domicilio' then v_dir end)
  returning * into vi;
  if c.oportunidad_id is not null then
    perform core.api_mover_etapa(jsonb_build_object('oportunidad_id', c.oportunidad_id, 'etapa', 'revision_agendada',
      'proxima_accion', case when v_lugar = 'domicilio' then 'Inspección y fotos a domicilio · ' || v_dir else 'Inspección y fotos en Chicureo' end,
      'proxima_fecha', (v_ini at time zone 'America/Santiago')::date), core.autor());
  end if;
  perform core.push(case when v_lugar = 'domicilio' then 'Visita NOM a domicilio' else 'Visita NOM agendada' end,
    coalesce(vi.nombre, 'Cliente') || ' · ' || nom.fecha_txt(v_ini) || ' · ' || coalesce(vi.vehiculo, '') || case when v_lugar = 'domicilio' then ' · ' || v_dir else '' end,
    '#/tasaciones', 'nom_visita:' || vi.id);
  return jsonb_build_object('visita_id', vi.id, 'cuando', nom.fecha_txt(v_ini), 'estado', vi.estado, 'lugar', v_lugar,
    'direccion', case when v_lugar = 'domicilio' then v_dir end,
    'fee', jsonb_build_object('monto', v_fee, 'momento', v_mom, 'retener_hasta', v_ret,
       'como_decirlo', case when v_mom = 'al_agendar'
         then 'La hora queda tomada por ' || coalesce(nom.auto('retener_cupo_horas'), '24') || ' horas; se confirma al recibir la transferencia de ' || nom.miles(v_fee) || ' (servicio de inicio: inspección, fotos y publicación; se descuenta de la comisión cuando vendemos).'
         else 'El servicio de inicio de ' || nom.miles(v_fee) || ' (inspección, fotos y publicación) se paga el día de la visita por transferencia y se descuenta de la comisión cuando vendemos.' end),
    'transferencia', (select valor - 'usos' from core.parametros where clave = 'nom.transferencia'),
    'oficina', case when v_lugar = 'oficina' then (select jsonb_build_object('direccion', valor->>'direccion', 'sector', valor->>'sector', 'comuna', valor->>'comuna') from core.parametros where clave = 'nom.oficina') end,
    'preparacion', (select valor->'preparacion_cliente' from core.parametros where clave = 'nom.oficina'),
    'requisitos_domicilio', case when v_lugar = 'domicilio' then v_cfg->'requisitos' end);
end $$;
