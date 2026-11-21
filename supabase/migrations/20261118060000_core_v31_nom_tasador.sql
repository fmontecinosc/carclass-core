-- v31 · NOM · Tasador comercial trazable (Fase 1 del prompt maestro NOM, 18-nov-2026)
--
-- Reemplaza en la práctica a public.nom_tasaciones (tasación "IA" sin comparables verificables), que queda
-- intacta como histórico. Todo vive en el esquema nom, sin acceso directo desde el cliente: la app y la API
-- solo entran por funciones public.app_nom_* (rol) y core.api_nom_* (clave de API), y el cliente final solo
-- por public.tasacion_publica(token), que arma el informe desde una lista blanca de campos.
--
-- Separación cliente / NOM:
--   nom.tasaciones          → datos del vehículo, resultado de mercado y textos del informe (visibles al cliente
--                             solo a través de nom.payload_cliente).
--   nom.tasacion_interna    → precio pretendido, toma, costos, comisión, rotación, modalidad recomendada,
--                             notas de negociación. Nunca entra al payload cliente. Solo dueño / finanzas.
--
-- Reglas duras (ver prompt maestro §6, §7 y §14):
--   · una versión distinta o indeterminada no es comparable; tampoco otra transmisión, tracción o combustible;
--   · siniestro, remate, liquidación, bono 0 km y avisos caídos se etiquetan y quedan fuera del cálculo;
--   · un aviso no verificado no es comparable principal;
--   · menos de 3 comparables válidos = pre-estimación; aprobarla exige excepción expresa con comentario;
--   · aprobada o enviada = congelada; cualquier cambio exige una nueva versión;
--   · no se envía nada sin aprobación; cada envío queda registrado con aprobador, versión y destinatario.
-- Los parámetros de ajuste son PROPUESTAS configurables en core.parametros['nom.tasador'] (pendientes de Felipe).

create schema if not exists nom;
revoke all on schema nom from public, anon, authenticated;
grant usage on schema nom to service_role;

-- ───────────────────────── parámetros ─────────────────────────
insert into core.parametros (clave, valor, notas) values ('nom.tasador', jsonb_build_object(
  'ajuste_anio_pct', 6,            -- % por año de diferencia (precio del aviso se lleva al año del auto tasado)
  'ajuste_10mil_km_pct', 1.5,      -- % por cada 10.000 km de diferencia
  'tope_ajuste_pct', 18,           -- tope absoluto del ajuste por aviso
  'max_dif_anios', 2,              -- más de 2 años de diferencia: no comparable
  'km_rango_preferido', 30000,
  'peso_financiamiento', 0.5,      -- un precio ligado a financiamiento pesa la mitad
  'premio_publicacion_pct', 2.5,   -- precio de publicación sobre el valor comercial
  'cierre_desc_min_pct', 3,        -- rango de cierre estimado = publicación − 3% … − 6%
  'cierre_desc_max_pct', 6,
  'min_comparables', 3,
  'vigencia_dias', 15,
  'ciudad_informe', 'Santiago',
  'estado', 'propuesta: valores iniciales pendientes de aprobación de Felipe'),
  'Tasador NOM (v31). Valores propuestos, no validados. Cambiarlos no altera tasaciones aprobadas: cada una guarda sus parámetros.')
on conflict (clave) do nothing;

-- ───────────────────────── tablas ─────────────────────────
create sequence if not exists nom.folio_seq;

create table nom.tasaciones (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null,                       -- misma tasación a través de sus versiones
  version_n int not null default 1,
  folio text not null unique,
  token text unique,                            -- link público del informe (solo aprobadas/enviadas)
  estado text not null default 'borrador' check (estado in ('borrador','calculada','aprobada','enviada','reemplazada','anulada')),
  tipo text not null default 'pre_estimacion' check (tipo in ('tasacion','pre_estimacion')),
  -- vínculos (interfaces hacia WhatsApp, CRM, vehículos, inspección)
  oportunidad_id uuid references crm.oportunidades(id) on delete set null,
  empresa_id uuid references crm.empresas(id) on delete set null,     -- propietario (persona) en Core
  vehiculo_id uuid references ops.vehiculos(id) on delete set null,
  conversacion_id uuid,                                                -- wa.conversaciones (Fase 2)
  inspeccion_folio text,                                               -- public.nom_inspecciones.folio (Fase 3)
  origen text not null default 'panel' check (origen in ('panel','whatsapp','mcp','web','derivacion')),
  -- ficha del vehículo
  marca text not null, modelo text not null, version text, version_confirmada boolean not null default false,
  anio int not null check (anio between 1950 and 2100), motor text, transmision text, traccion text, carroceria text,
  combustible text, km int check (km >= 0), color text, patente text, vin text,
  duenos text, llaves text, equipamiento text, observaciones text,
  mostrar_patente boolean not null default true,
  fuentes jsonb not null default '{}'::jsonb,   -- campo → declarado_por_cliente | extraido_de_documento | validado_por_ejecutivo | verificado_en_fuente | observado_en_inspeccion
  -- resultado (calculado y/o ajustado con motivo)
  rango_oferta_min bigint, rango_oferta_max bigint, valor_comercial bigint, precio_publicacion bigint,
  cierre_min bigint, cierre_max bigint, confianza text check (confianza in ('alto','medio','bajo')),
  comercialidad int check (comercialidad between 1 and 5), comercialidad_txt text,
  estadisticas jsonb, advertencias jsonb not null default '[]'::jsonb, parametros jsonb,
  ajustes_manuales jsonb not null default '{}'::jsonb,
  -- textos del informe
  resumen_comercial text, criterios text, analisis_comparables text, alcance text,
  consulta_en timestamptz, fuentes_consulta text, cobertura text,
  calculada_en timestamptz, vigencia_hasta date,
  creado_por text not null default core.autor(), creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (grupo_id, version_n)
);
create index on nom.tasaciones (oportunidad_id);
create index on nom.tasaciones (empresa_id);
create index on nom.tasaciones (estado);

create table nom.tasacion_interna (
  tasacion_id uuid primary key references nom.tasaciones(id) on delete cascade,
  precio_pretendido_cliente bigint, urgencia text, precio_toma bigint, costo_acondicionamiento bigint,
  costos_comercializacion bigint, comision_pct numeric, comision_monto bigint, riesgo text,
  rotacion_dias_est int, modalidad_recomendada text check (modalidad_recomendada in
    ('consignacion_virtual','consignacion_custodia','compra_directa','no_recomendable')),
  notas_negociacion text, actualizado_por text default core.autor(), actualizado_en timestamptz not null default now()
);

create table nom.mercado_busquedas (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid not null references nom.tasaciones(id) on delete cascade,
  portal text not null, consulta text, url_busqueda text, filtros jsonb,
  ejecutada_en timestamptz not null default now(), resultados_n int, ejecutor text not null default core.autor(), notas text
);

create table nom.mercado_avisos (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid not null references nom.tasaciones(id) on delete cascade,
  busqueda_id uuid references nom.mercado_busquedas(id) on delete set null,
  portal text not null, url text not null check (url ~* '^https?://'), titulo text,
  marca text, modelo text, version_txt text,
  version_match text not null default 'indeterminada' check (version_match in ('misma','equivalente','distinta','indeterminada')),
  anio int, km int, precio bigint, transmision text, traccion text, combustible text, carroceria text,
  region text, comuna text, vendedor_tipo text check (vendedor_tipo in ('particular','automotora','rent_a_car','concesionario','otro')), vendedor_nombre text,
  condicion text not null default 'contado' check (condicion in ('contado','financiamiento','bono_0km','liquidacion','remate','siniestro','otro')),
  verificacion text not null default 'no_verificado' check (verificacion in ('verificado_activo','no_verificado','caido')),
  verificado_en timestamptz, evidencia text,   -- extracto de la página al momento de la consulta
  -- decisión del tasador
  incluido boolean not null default true, motivo_tasador text,
  seleccionado_informe boolean not null default false, orden_informe int, diferencias text,
  -- resultado del cálculo (lo escribe nom.calcular)
  valido boolean, motivo_exclusion text, ajuste_pct numeric, precio_ajustado bigint, peso numeric,
  creado_por text not null default core.autor(), creado_en timestamptz not null default now(),
  unique (tasacion_id, url)
);
create index on nom.mercado_avisos (tasacion_id);

create table nom.tasacion_ajustes (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid not null references nom.tasaciones(id) on delete cascade,
  campo text not null, de text, a text, motivo text not null check (length(trim(motivo)) >= 5),
  autor text not null default core.autor(), en timestamptz not null default now()
);

create table nom.tasacion_aprobaciones (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid not null references nom.tasaciones(id) on delete cascade,
  version_n int not null, decision text not null check (decision in ('aprobada','rechazada')),
  excepcion_comparables boolean not null default false, comentario text,
  payload_hash text, aprobador text not null default core.autor(), en timestamptz not null default now()
);

create table nom.tasacion_envios (
  id uuid primary key default gen_random_uuid(),
  tasacion_id uuid not null references nom.tasaciones(id) on delete cascade,
  version_n int not null, canal text not null check (canal in ('whatsapp_manual','whatsapp_api','email','link','impreso')),
  destinatario text, aprobacion_id uuid not null references nom.tasacion_aprobaciones(id),
  enviado_por text not null default core.autor(), en timestamptz not null default now(), detalle text
);

alter table nom.tasaciones enable row level security;
alter table nom.tasacion_interna enable row level security;
alter table nom.mercado_busquedas enable row level security;
alter table nom.mercado_avisos enable row level security;
alter table nom.tasacion_ajustes enable row level security;
alter table nom.tasacion_aprobaciones enable row level security;
alter table nom.tasacion_envios enable row level security;
-- sin políticas: anon y authenticated no leen nada directo; solo funciones security definer.

create trigger auditar after insert or update or delete on nom.tasaciones for each row execute function core.auditar();
create trigger auditar after insert or update or delete on nom.mercado_avisos for each row execute function core.auditar();
create trigger auditar after insert or update or delete on nom.tasacion_aprobaciones for each row execute function core.auditar();
create trigger auditar after insert or update or delete on nom.tasacion_envios for each row execute function core.auditar();

create or replace function nom.touch() returns trigger language plpgsql set search_path = '' as $$
begin new.actualizado_en := now(); return new; end $$;
create trigger touch before update on nom.tasaciones for each row execute function nom.touch();

-- Congelamiento: una tasación aprobada/enviada no cambia sus cifras, ficha ni comparables.
create or replace function nom.proteger_congelada() returns trigger language plpgsql set search_path = '' as $$
declare v_estado text; v_id uuid;
begin
  if tg_table_name = 'tasaciones' then
    if old.estado in ('aprobada','enviada','reemplazada','anulada') and
       (to_jsonb(new) - array['estado','token','actualizado_en','oportunidad_id','vehiculo_id','conversacion_id','inspeccion_folio'])
       is distinct from (to_jsonb(old) - array['estado','token','actualizado_en','oportunidad_id','vehiculo_id','conversacion_id','inspeccion_folio']) then
      raise exception 'La tasación % está %; crea una nueva versión para cambiarla', old.folio, old.estado;
    end if;
    return new;
  end if;
  v_id := case when tg_op = 'DELETE' then old.tasacion_id else new.tasacion_id end;
  select estado into v_estado from nom.tasaciones where id = v_id;
  if v_estado in ('aprobada','enviada','reemplazada','anulada') then
    raise exception 'La tasación está %; sus comparables no se pueden modificar', v_estado;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger congelada before update on nom.tasaciones for each row execute function nom.proteger_congelada();
create trigger congelada before insert or update or delete on nom.mercado_avisos for each row execute function nom.proteger_congelada();
create trigger congelada before insert or update or delete on nom.mercado_busquedas for each row execute function nom.proteger_congelada();

-- ───────────────────────── utilidades ─────────────────────────
create or replace function nom.norm(t text) returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(lower(translate(coalesce(t,''), 'ÁÉÍÓÚáéíóúÑñ', 'AEIOUaeiouNn')), '[^a-z0-9]', '', 'g'), '')
$$;

-- transmisión: automatica (AT, CVT, DSG, aut…) | manual
create or replace function nom.norm_trans(t text) returns text language sql immutable set search_path = '' as $$
  select case when nom.norm(t) is null then null
              when nom.norm(t) ~ '(manual|^mt|mec)' then 'manual'
              when nom.norm(t) ~ '(auto|^at|cvt|dsg|dct|tiptronic|aut)' then 'automatica' else nom.norm(t) end
$$;
create or replace function nom.norm_trac(t text) returns text language sql immutable set search_path = '' as $$
  select case when nom.norm(t) is null then null
              when nom.norm(t) ~ '(4x4|awd|4wd|4motion|quattro|xdrive|4matic|integral)' then '4x4'
              when nom.norm(t) ~ '(4x2|2wd|fwd|rwd|delantera|trasera)' then '4x2' else nom.norm(t) end
$$;
create or replace function nom.norm_comb(t text) returns text language sql immutable set search_path = '' as $$
  select case when nom.norm(t) is null then null
              when nom.norm(t) ~ '(hibrid|hybrid|hev|phev)' then 'hibrido'
              when nom.norm(t) ~ '(electr|ev$)' then 'electrico'
              when nom.norm(t) ~ '(diesel|petroleo|tdi|crdi)' then 'diesel'
              when nom.norm(t) ~ '(bencin|gasolin|nafta)' then 'bencina' else nom.norm(t) end
$$;

create or replace function nom.puede_tasar() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from core.usuarios u where u.user_id = auth.uid() and u.activo
                  and (u.rol = 'dueno' or 'nom' = any(coalesce(u.unidades, '{}'))))
$$;
create or replace function nom.puede_aprobar() returns boolean language sql stable security definer set search_path = '' as $$
  select core.es_dueno()   -- por ahora solo Felipe aprueba (decisión pendiente: rol TASADOR)
$$;

create or replace function nom.nuevo_folio() returns text language sql volatile set search_path = '' as $$
  select 'NOM-TAS-' || to_char(now() at time zone 'America/Santiago', 'YYYY-MM-DD') || '-' || lpad(nextval('nom.folio_seq')::text, 4, '0')
$$;

create or replace function nom.mediana_ponderada(p_vals numeric[], p_pesos numeric[]) returns numeric
language plpgsql immutable set search_path = '' as $$
declare r record; total numeric := 0; acum numeric := 0;
begin
  select sum(w) into total from unnest(p_pesos) w;
  if total is null or total <= 0 then return null; end if;
  for r in select v, w from unnest(p_vals, p_pesos) as x(v, w) order by v loop
    acum := acum + r.w;
    if acum >= total / 2 then return r.v; end if;
  end loop;
  return null;
end $$;

-- ───────────────────────── motor de cálculo ─────────────────────────
create or replace function nom.calcular(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  t nom.tasaciones; par jsonb; a record; adv jsonb := '[]'::jsonb;
  v_motivo text; v_adj numeric; v_peso numeric; da int; dk int;
  n_val int; n_misma int; n_univ int; q1 numeric; q3 numeric; iqr numeric; med numeric; vals numeric[]; pesos numeric[];
  raw_q1 numeric; raw_q3 numeric; raw_min numeric; raw_max numeric;
  v_valor bigint; v_pub bigint; v_cmin bigint; v_cmax bigint; v_conf text; v_tipo text; disp numeric; v_aj jsonb;
begin
  select * into t from nom.tasaciones where id = p_id for update;
  if t.id is null then raise exception 'Tasación no encontrada'; end if;
  if t.estado not in ('borrador','calculada') then raise exception 'La tasación % está %; crea una nueva versión', t.folio, t.estado; end if;
  par := coalesce((select valor from core.parametros where clave = 'nom.tasador'), '{}'::jsonb);
  select count(*) into n_univ from nom.mercado_avisos where tasacion_id = p_id;

  -- 1) validez, ajuste y peso de cada aviso
  for a in select * from nom.mercado_avisos where tasacion_id = p_id loop
    v_motivo := null;
    if not a.incluido then v_motivo := coalesce('Excluido por tasador: ' || a.motivo_tasador, 'Excluido por tasador');
    elsif a.precio is null or a.precio <= 0 then v_motivo := 'Sin precio publicado';
    elsif a.verificacion = 'caido' then v_motivo := 'Aviso caído o no disponible';
    elsif a.verificacion <> 'verificado_activo' then v_motivo := 'No verificado: no se usa como comparable principal';
    elsif a.condicion in ('siniestro','remate','liquidacion','bono_0km','otro') then v_motivo := 'Caso especial (' || a.condicion || '): no representa un vehículo usado limpio';
    elsif a.version_match = 'distinta' then v_motivo := 'Versión distinta';
    elsif a.version_match = 'indeterminada' then v_motivo := 'Versión no identificable en el aviso';
    elsif nom.norm_trans(a.transmision) is not null and nom.norm_trans(t.transmision) is not null and nom.norm_trans(a.transmision) <> nom.norm_trans(t.transmision) then v_motivo := 'Transmisión distinta';
    elsif nom.norm_trac(a.traccion) is not null and nom.norm_trac(t.traccion) is not null and nom.norm_trac(a.traccion) <> nom.norm_trac(t.traccion) then v_motivo := 'Tracción distinta';
    elsif nom.norm_comb(a.combustible) is not null and nom.norm_comb(t.combustible) is not null and nom.norm_comb(a.combustible) <> nom.norm_comb(t.combustible) then v_motivo := 'Combustible distinto';
    elsif a.anio is null or abs(a.anio - t.anio) > coalesce((par->>'max_dif_anios')::int, 2) then v_motivo := 'Año fuera de rango comparable';
    elsif nom.norm(a.modelo) is not null and nom.norm(a.modelo) <> nom.norm(t.modelo) then v_motivo := 'Modelo distinto';
    end if;

    if v_motivo is null then
      da := t.anio - a.anio;                                         -- auto tasado más nuevo → sube el aviso
      dk := coalesce(t.km, a.km, 0) - coalesce(a.km, t.km, 0);       -- auto tasado con más km → baja el aviso
      v_adj := da * coalesce((par->>'ajuste_anio_pct')::numeric, 6) - (dk / 10000.0) * coalesce((par->>'ajuste_10mil_km_pct')::numeric, 1.5);
      v_adj := greatest(-coalesce((par->>'tope_ajuste_pct')::numeric, 18), least(coalesce((par->>'tope_ajuste_pct')::numeric, 18), v_adj));
      v_peso := 1 / (1 + abs(da) * 0.6 + abs(dk) / 40000.0)
                * case when a.version_match = 'misma' then 1 else 0.8 end
                * case when a.condicion = 'financiamiento' then coalesce((par->>'peso_financiamiento')::numeric, 0.5) else 1 end;
      update nom.mercado_avisos set valido = true, motivo_exclusion = null, ajuste_pct = round(v_adj, 2),
             precio_ajustado = round(a.precio * (1 + v_adj / 100)), peso = round(v_peso, 4) where id = a.id;
    else
      update nom.mercado_avisos set valido = false, motivo_exclusion = v_motivo, ajuste_pct = null, precio_ajustado = null, peso = null,
             seleccionado_informe = false where id = a.id;
    end if;
  end loop;

  -- 2) atípicos (con 4 o más válidos)
  select count(*), percentile_cont(0.25) within group (order by precio_ajustado), percentile_cont(0.75) within group (order by precio_ajustado)
    into n_val, q1, q3 from nom.mercado_avisos where tasacion_id = p_id and valido;
  if n_val >= 4 then
    iqr := q3 - q1;
    update nom.mercado_avisos set valido = false, motivo_exclusion = 'Precio atípico respecto de la muestra', seleccionado_informe = false
     where tasacion_id = p_id and valido and (precio_ajustado < q1 - 1.5 * iqr or precio_ajustado > q3 + 1.5 * iqr);
  end if;

  select count(*), count(*) filter (where version_match = 'misma'), array_agg(precio_ajustado::numeric), array_agg(peso),
         percentile_cont(0.5) within group (order by precio_ajustado),
         percentile_cont(0.25) within group (order by precio), percentile_cont(0.75) within group (order by precio), min(precio), max(precio),
         percentile_cont(0.25) within group (order by precio_ajustado), percentile_cont(0.75) within group (order by precio_ajustado)
    into n_val, n_misma, vals, pesos, med, raw_q1, raw_q3, raw_min, raw_max, q1, q3
    from nom.mercado_avisos where tasacion_id = p_id and valido;

  -- 3) resultado
  if n_val = 0 then
    v_valor := null; v_pub := null; v_cmin := null; v_cmax := null; v_conf := 'bajo';
    adv := adv || to_jsonb('Sin comparables válidos: no es posible estimar un valor de mercado.'::text);
  else
    v_valor := round(nom.mediana_ponderada(vals, pesos) / 10000) * 10000;
    v_pub := floor(v_valor * (1 + coalesce((par->>'premio_publicacion_pct')::numeric, 2.5) / 100) / 100000) * 100000 - 10000;
    if v_pub < v_valor * 0.98 then v_pub := ceil(v_valor / 100000.0) * 100000 - 10000; end if;
    v_cmin := round(v_pub * (1 - coalesce((par->>'cierre_desc_max_pct')::numeric, 6) / 100) / 50000) * 50000;
    v_cmax := round(v_pub * (1 - coalesce((par->>'cierre_desc_min_pct')::numeric, 3) / 100) / 50000) * 50000;
    disp := case when med > 0 then (q3 - q1) / med end;
    v_conf := case when n_val >= 5 and n_misma >= 3 and coalesce(disp, 1) <= 0.12 then 'alto'
                   when n_val >= coalesce((par->>'min_comparables')::int, 3) then 'medio' else 'bajo' end;
    if v_pub < raw_min * 0.95 then adv := adv || to_jsonb('El precio de publicación queda bajo todos los avisos comparables: revisar que no se vea sospechosamente barato.'::text); end if;
    if coalesce(disp, 0) > 0.2 then adv := adv || to_jsonb('Alta dispersión de precios en la muestra (' || round(disp * 100) || '% del valor central).'); end if;
  end if;
  if n_val < coalesce((par->>'min_comparables')::int, 3) then
    adv := adv || to_jsonb(('Solo ' || n_val || ' comparable(s) válido(s): queda como pre-estimación sujeta a estudio; aprobarla exige excepción expresa.')::text);
  end if;
  if not t.version_confirmada then adv := adv || to_jsonb('Versión exacta sin confirmar: la tasación queda como pre-estimación hasta validarla.'::text); end if;
  if exists (select 1 from nom.mercado_avisos where tasacion_id = p_id and valido and coalesce(region,'') !~* 'metropolitana|santiago') then
    adv := adv || to_jsonb('Hay comparables fuera de la Región Metropolitana; revisar la justificación geográfica.'::text);
  end if;
  if exists (select 1 from nom.mercado_avisos where tasacion_id = p_id and valido and condicion = 'financiamiento') then
    adv := adv || to_jsonb('Hay precios ligados a financiamiento: ponderan la mitad y se señalan en el informe.'::text);
  end if;
  if t.km is null then adv := adv || to_jsonb('Kilometraje no informado: el ajuste por uso no se aplicó.'::text); end if;

  v_tipo := case when n_val >= coalesce((par->>'min_comparables')::int, 3) and t.version_confirmada then 'tasacion' else 'pre_estimacion' end;

  -- 4) ajustes manuales vigentes (auditados en nom.tasacion_ajustes) se aplican sobre el cálculo
  v_aj := t.ajustes_manuales;
  update nom.tasaciones set
    rango_oferta_min = coalesce((v_aj->>'rango_oferta_min')::bigint, case when n_val >= 4 then round(raw_q1 / 10000) * 10000 else raw_min end),
    rango_oferta_max = coalesce((v_aj->>'rango_oferta_max')::bigint, case when n_val >= 4 then round(raw_q3 / 10000) * 10000 else raw_max end),
    valor_comercial = coalesce((v_aj->>'valor_comercial')::bigint, v_valor),
    precio_publicacion = coalesce((v_aj->>'precio_publicacion')::bigint, v_pub),
    cierre_min = coalesce((v_aj->>'cierre_min')::bigint, v_cmin),
    cierre_max = coalesce((v_aj->>'cierre_max')::bigint, v_cmax),
    confianza = v_conf, tipo = v_tipo, advertencias = adv, parametros = par,
    estadisticas = jsonb_build_object('universo', n_univ, 'validos', n_val, 'misma_version', n_misma,
      'mediana_ajustada', round(med), 'q1_ajustado', round(q1), 'q3_ajustado', round(q3), 'dispersion_pct', round(coalesce(disp, 0) * 100, 1),
      'precio_min', raw_min, 'precio_max', raw_max, 'valor_calculado', v_valor, 'publicacion_calculada', v_pub,
      'cierre_calculado', jsonb_build_array(v_cmin, v_cmax)),
    consulta_en = coalesce((select max(ejecutada_en) from nom.mercado_busquedas where tasacion_id = p_id), consulta_en),
    fuentes_consulta = coalesce((select string_agg(distinct portal, ', ') from nom.mercado_avisos where tasacion_id = p_id and valido), fuentes_consulta),
    calculada_en = now(), estado = 'calculada',
    vigencia_hasta = (now() at time zone 'America/Santiago')::date + coalesce((par->>'vigencia_dias')::int, 15)
  where id = p_id;

  -- 5) selección por defecto para el informe: hasta 5 válidos de mayor peso (si el tasador no eligió)
  if not exists (select 1 from nom.mercado_avisos where tasacion_id = p_id and valido and seleccionado_informe) then
    update nom.mercado_avisos m set seleccionado_informe = true, orden_informe = s.rn
      from (select id, row_number() over (order by peso desc, abs(coalesce(km,0) - coalesce(t.km,0))) rn
              from nom.mercado_avisos where tasacion_id = p_id and valido) s
     where m.id = s.id and s.rn <= 5;
  end if;

  return nom.vista_interna(p_id);
end $$;

-- ───────────────────────── payload CLIENTE (lista blanca) ─────────────────────────
-- Única puerta de datos hacia el informe del cliente. No lee nom.tasacion_interna ni campos de cálculo internos.
create or replace function nom.payload_cliente(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'folio', t.folio, 'version', t.version_n, 'tipo', t.tipo, 'estado', t.estado,
    'emitido_en', coalesce(t.calculada_en, t.creado_en), 'ciudad', coalesce(t.parametros->>'ciudad_informe', 'Santiago'),
    'vigencia_hasta', t.vigencia_hasta,
    'vehiculo', jsonb_build_object('marca', t.marca, 'modelo', t.modelo, 'version', t.version, 'anio', t.anio, 'motor', t.motor,
      'transmision', t.transmision, 'traccion', t.traccion, 'carroceria', t.carroceria, 'combustible', t.combustible, 'km', t.km,
      'color', t.color, 'patente', case when t.mostrar_patente then t.patente end, 'duenos', t.duenos, 'llaves', t.llaves,
      'equipamiento', t.equipamiento),
    'valores', jsonb_build_object('rango_oferta', jsonb_build_array(t.rango_oferta_min, t.rango_oferta_max),
      'valor_comercial', t.valor_comercial, 'precio_publicacion', t.precio_publicacion,
      'cierre', jsonb_build_array(t.cierre_min, t.cierre_max), 'confianza', t.confianza,
      'comercialidad', t.comercialidad, 'comercialidad_txt', t.comercialidad_txt),
    'textos', jsonb_build_object('resumen', t.resumen_comercial, 'criterios', t.criterios, 'analisis', t.analisis_comparables, 'alcance', t.alcance),
    'consulta', jsonb_build_object('en', t.consulta_en, 'fuentes', t.fuentes_consulta, 'cobertura', t.cobertura),
    'comparables', coalesce((select jsonb_agg(jsonb_build_object(
        'n', m.orden_informe, 'titulo', m.titulo, 'version', m.version_txt, 'anio', m.anio, 'km', m.km,
        'ubicacion', concat_ws(' · ', nullif(m.vendedor_nombre, ''), nullif(m.comuna, ''), case when m.region !~* 'metropolitana|santiago' then m.region end),
        'precio', m.precio, 'portal', m.portal, 'url', m.url, 'diferencias', m.diferencias,
        'financiamiento', m.condicion = 'financiamiento', 'verificado_en', m.verificado_en) order by m.orden_informe, m.peso desc)
      from nom.mercado_avisos m where m.tasacion_id = t.id and m.valido and m.seleccionado_informe), '[]'::jsonb))
  from nom.tasaciones t where t.id = p_id
$$;

-- Vista interna completa (panel y agentes NOM). La parte "interna" solo si quien consulta ve finanzas o es la API.
create or replace function nom.vista_interna(p_id uuid, p_con_interna boolean default false) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(t) || jsonb_build_object(
    'propietario', (select jsonb_build_object('id', e.id, 'nombre', e.nombre, 'telefono', e.telefono, 'comuna', e.comuna) from crm.empresas e where e.id = t.empresa_id),
    'busquedas', coalesce((select jsonb_agg(to_jsonb(b) order by b.ejecutada_en) from nom.mercado_busquedas b where b.tasacion_id = t.id), '[]'),
    'avisos', coalesce((select jsonb_agg(to_jsonb(m) order by m.valido desc nulls last, m.seleccionado_informe desc, m.peso desc nulls last, m.precio) from nom.mercado_avisos m where m.tasacion_id = t.id), '[]'),
    'ajustes', coalesce((select jsonb_agg(to_jsonb(x) order by x.en) from nom.tasacion_ajustes x where x.tasacion_id = t.id), '[]'),
    'aprobaciones', coalesce((select jsonb_agg(to_jsonb(x) order by x.en) from nom.tasacion_aprobaciones x where x.tasacion_id = t.id), '[]'),
    'envios', coalesce((select jsonb_agg(to_jsonb(x) order by x.en) from nom.tasacion_envios x where x.tasacion_id = t.id), '[]'),
    'versiones', (select jsonb_agg(jsonb_build_object('id', v.id, 'version_n', v.version_n, 'estado', v.estado, 'folio', v.folio) order by v.version_n) from nom.tasaciones v where v.grupo_id = t.grupo_id),
    'interna', case when p_con_interna then (select to_jsonb(i) from nom.tasacion_interna i where i.tasacion_id = t.id) end)
  from nom.tasaciones t where t.id = p_id
$$;

-- ───────────────────────── operaciones (núcleo común app + API) ─────────────────────────
create or replace function nom.crear(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_emp uuid := nullif(p->>'empresa_id','')::uuid; v_op uuid := nullif(p->>'oportunidad_id','')::uuid;
begin
  if coalesce(trim(p->>'marca'),'') = '' or coalesce(trim(p->>'modelo'),'') = '' or nullif(p->>'anio','') is null then
    raise exception 'Marca, modelo y año son obligatorios';
  end if;
  if v_emp is null and v_op is not null then select empresa_id into v_emp from crm.oportunidades where id = v_op; end if;
  insert into nom.tasaciones (id, grupo_id, folio, oportunidad_id, empresa_id, conversacion_id, origen, marca, modelo, version, version_confirmada,
    anio, motor, transmision, traccion, carroceria, combustible, km, color, patente, vin, duenos, llaves, equipamiento, observaciones,
    mostrar_patente, fuentes, comercialidad, comercialidad_txt, resumen_comercial, criterios, alcance, cobertura)
  values (v_id, v_id, nom.nuevo_folio(), v_op, v_emp, nullif(p->>'conversacion_id','')::uuid, coalesce(p->>'origen','panel'),
    trim(p->>'marca'), trim(p->>'modelo'), nullif(trim(p->>'version'),''), coalesce((p->>'version_confirmada')::boolean, false),
    (p->>'anio')::int, nullif(p->>'motor',''), nullif(p->>'transmision',''), nullif(p->>'traccion',''), nullif(p->>'carroceria',''),
    nullif(p->>'combustible',''), nullif(p->>'km','')::int, nullif(p->>'color',''), upper(nullif(replace(p->>'patente',' ',''),'')), nullif(p->>'vin',''),
    nullif(p->>'duenos',''), nullif(p->>'llaves',''), nullif(p->>'equipamiento',''), nullif(p->>'observaciones',''),
    coalesce((p->>'mostrar_patente')::boolean, true), coalesce(p->'fuentes', '{}'::jsonb),
    nullif(p->>'comercialidad','')::int, nullif(p->>'comercialidad_txt',''), nullif(p->>'resumen_comercial',''), nullif(p->>'criterios',''),
    nullif(p->>'alcance',''), coalesce(nullif(p->>'cobertura',''), 'Región Metropolitana'));
  if p ? 'interna' then perform nom.guardar_interna(v_id, p->'interna'); end if;
  return v_id;
end $$;

create or replace function nom.actualizar(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update nom.tasaciones t set
    marca = coalesce(nullif(trim(p->>'marca'),''), t.marca), modelo = coalesce(nullif(trim(p->>'modelo'),''), t.modelo),
    version = case when p ? 'version' then nullif(trim(p->>'version'),'') else t.version end,
    version_confirmada = coalesce((p->>'version_confirmada')::boolean, t.version_confirmada),
    anio = coalesce(nullif(p->>'anio','')::int, t.anio),
    motor = case when p ? 'motor' then nullif(p->>'motor','') else t.motor end,
    transmision = case when p ? 'transmision' then nullif(p->>'transmision','') else t.transmision end,
    traccion = case when p ? 'traccion' then nullif(p->>'traccion','') else t.traccion end,
    carroceria = case when p ? 'carroceria' then nullif(p->>'carroceria','') else t.carroceria end,
    combustible = case when p ? 'combustible' then nullif(p->>'combustible','') else t.combustible end,
    km = case when p ? 'km' then nullif(p->>'km','')::int else t.km end,
    color = case when p ? 'color' then nullif(p->>'color','') else t.color end,
    patente = case when p ? 'patente' then upper(nullif(replace(p->>'patente',' ',''),'')) else t.patente end,
    vin = case when p ? 'vin' then nullif(p->>'vin','') else t.vin end,
    duenos = case when p ? 'duenos' then nullif(p->>'duenos','') else t.duenos end,
    llaves = case when p ? 'llaves' then nullif(p->>'llaves','') else t.llaves end,
    equipamiento = case when p ? 'equipamiento' then nullif(p->>'equipamiento','') else t.equipamiento end,
    observaciones = case when p ? 'observaciones' then nullif(p->>'observaciones','') else t.observaciones end,
    mostrar_patente = coalesce((p->>'mostrar_patente')::boolean, t.mostrar_patente),
    fuentes = t.fuentes || coalesce(p->'fuentes', '{}'::jsonb),
    comercialidad = case when p ? 'comercialidad' then nullif(p->>'comercialidad','')::int else t.comercialidad end,
    comercialidad_txt = case when p ? 'comercialidad_txt' then nullif(p->>'comercialidad_txt','') else t.comercialidad_txt end,
    resumen_comercial = case when p ? 'resumen_comercial' then nullif(p->>'resumen_comercial','') else t.resumen_comercial end,
    criterios = case when p ? 'criterios' then nullif(p->>'criterios','') else t.criterios end,
    analisis_comparables = case when p ? 'analisis_comparables' then nullif(p->>'analisis_comparables','') else t.analisis_comparables end,
    alcance = case when p ? 'alcance' then nullif(p->>'alcance','') else t.alcance end,
    cobertura = case when p ? 'cobertura' then nullif(p->>'cobertura','') else t.cobertura end,
    oportunidad_id = case when p ? 'oportunidad_id' then nullif(p->>'oportunidad_id','')::uuid else t.oportunidad_id end,
    empresa_id = case when p ? 'empresa_id' then nullif(p->>'empresa_id','')::uuid else t.empresa_id end,
    -- cambiar la ficha deja el resultado en borrador hasta recalcular
    estado = case when t.estado = 'calculada' and (p ?| array['marca','modelo','version','version_confirmada','anio','transmision','traccion','combustible','km']) then 'borrador' else t.estado end
  where t.id = p_id;
  if not found then raise exception 'Tasación no encontrada'; end if;
  if p ? 'interna' then perform nom.guardar_interna(p_id, p->'interna'); end if;
end $$;

create or replace function nom.guardar_interna(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into nom.tasacion_interna as i (tasacion_id, precio_pretendido_cliente, urgencia, precio_toma, costo_acondicionamiento,
    costos_comercializacion, comision_pct, comision_monto, riesgo, rotacion_dias_est, modalidad_recomendada, notas_negociacion, actualizado_por)
  values (p_id, nullif(p->>'precio_pretendido_cliente','')::bigint, nullif(p->>'urgencia',''), nullif(p->>'precio_toma','')::bigint,
    nullif(p->>'costo_acondicionamiento','')::bigint, nullif(p->>'costos_comercializacion','')::bigint, nullif(p->>'comision_pct','')::numeric,
    nullif(p->>'comision_monto','')::bigint, nullif(p->>'riesgo',''), nullif(p->>'rotacion_dias_est','')::int,
    nullif(p->>'modalidad_recomendada',''), nullif(p->>'notas_negociacion',''), core.autor())
  on conflict (tasacion_id) do update set
    precio_pretendido_cliente = coalesce(excluded.precio_pretendido_cliente, i.precio_pretendido_cliente),
    urgencia = coalesce(excluded.urgencia, i.urgencia), precio_toma = coalesce(excluded.precio_toma, i.precio_toma),
    costo_acondicionamiento = coalesce(excluded.costo_acondicionamiento, i.costo_acondicionamiento),
    costos_comercializacion = coalesce(excluded.costos_comercializacion, i.costos_comercializacion),
    comision_pct = coalesce(excluded.comision_pct, i.comision_pct), comision_monto = coalesce(excluded.comision_monto, i.comision_monto),
    riesgo = coalesce(excluded.riesgo, i.riesgo), rotacion_dias_est = coalesce(excluded.rotacion_dias_est, i.rotacion_dias_est),
    modalidad_recomendada = coalesce(excluded.modalidad_recomendada, i.modalidad_recomendada),
    notas_negociacion = coalesce(excluded.notas_negociacion, i.notas_negociacion),
    actualizado_por = core.autor(), actualizado_en = now();
end $$;

-- Registra una búsqueda y sus avisos (desde el agente investigador o carga manual). Upsert por URL.
create or replace function nom.registrar_busqueda(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_b uuid; a jsonb; n int := 0;
begin
  if not exists (select 1 from nom.tasaciones where id = p_id) then raise exception 'Tasación no encontrada'; end if;
  insert into nom.mercado_busquedas (tasacion_id, portal, consulta, url_busqueda, filtros, ejecutada_en, resultados_n, notas)
  values (p_id, coalesce(nullif(p->>'portal',''), 'otro'), p->>'consulta', p->>'url_busqueda', p->'filtros',
          coalesce(nullif(p->>'ejecutada_en','')::timestamptz, now()), nullif(p->>'resultados_n','')::int, p->>'notas')
  returning id into v_b;
  for a in select * from jsonb_array_elements(coalesce(p->'avisos', '[]'::jsonb)) loop
    insert into nom.mercado_avisos as m (tasacion_id, busqueda_id, portal, url, titulo, marca, modelo, version_txt, version_match, anio, km, precio,
      transmision, traccion, combustible, carroceria, region, comuna, vendedor_tipo, vendedor_nombre, condicion, verificacion, verificado_en,
      evidencia, incluido, motivo_tasador, diferencias)
    values (p_id, v_b, coalesce(nullif(a->>'portal',''), p->>'portal', 'otro'), trim(a->>'url'), a->>'titulo', a->>'marca', a->>'modelo', a->>'version_txt',
      coalesce(nullif(a->>'version_match',''), 'indeterminada'), nullif(a->>'anio','')::int, nullif(a->>'km','')::int, nullif(a->>'precio','')::bigint,
      a->>'transmision', a->>'traccion', a->>'combustible', a->>'carroceria', a->>'region', a->>'comuna', nullif(a->>'vendedor_tipo',''), a->>'vendedor_nombre',
      coalesce(nullif(a->>'condicion',''), 'contado'), coalesce(nullif(a->>'verificacion',''), 'no_verificado'),
      case when a->>'verificacion' = 'verificado_activo' then coalesce(nullif(a->>'verificado_en','')::timestamptz, now()) end,
      left(a->>'evidencia', 4000), coalesce((a->>'incluido')::boolean, true), a->>'motivo_tasador', a->>'diferencias')
    on conflict (tasacion_id, url) do update set busqueda_id = excluded.busqueda_id, titulo = excluded.titulo, version_txt = excluded.version_txt,
      version_match = excluded.version_match, anio = excluded.anio, km = excluded.km, precio = excluded.precio, transmision = excluded.transmision,
      traccion = excluded.traccion, combustible = excluded.combustible, region = excluded.region, comuna = excluded.comuna,
      vendedor_tipo = excluded.vendedor_tipo, vendedor_nombre = excluded.vendedor_nombre, condicion = excluded.condicion,
      verificacion = excluded.verificacion, verificado_en = excluded.verificado_en, evidencia = excluded.evidencia, diferencias = coalesce(excluded.diferencias, m.diferencias);
    n := n + 1;
  end loop;
  update nom.tasaciones set estado = 'borrador' where id = p_id and estado = 'calculada';
  return jsonb_build_object('busqueda_id', v_b, 'avisos', n);
end $$;

create or replace function nom.editar_aviso(p_aviso uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update nom.mercado_avisos m set
    incluido = coalesce((p->>'incluido')::boolean, m.incluido),
    motivo_tasador = case when p ? 'motivo_tasador' then nullif(p->>'motivo_tasador','') else m.motivo_tasador end,
    version_match = coalesce(nullif(p->>'version_match',''), m.version_match),
    condicion = coalesce(nullif(p->>'condicion',''), m.condicion),
    verificacion = coalesce(nullif(p->>'verificacion',''), m.verificacion),
    verificado_en = case when p->>'verificacion' = 'verificado_activo' then now() else m.verificado_en end,
    seleccionado_informe = coalesce((p->>'seleccionado_informe')::boolean, m.seleccionado_informe),
    orden_informe = case when p ? 'orden_informe' then nullif(p->>'orden_informe','')::int else m.orden_informe end,
    diferencias = case when p ? 'diferencias' then nullif(p->>'diferencias','') else m.diferencias end
  where id = p_aviso;
  if not found then raise exception 'Aviso no encontrado'; end if;
  if (p->>'seleccionado_informe')::boolean and exists (select 1 from nom.mercado_avisos where id = p_aviso and valido is not true) then
    raise exception 'Solo un comparable válido puede ir al informe';
  end if;
  update nom.tasaciones set estado = 'borrador' where id = (select tasacion_id from nom.mercado_avisos where id = p_aviso) and estado = 'calculada'
    and (p ?| array['incluido','version_match','condicion','verificacion']);
end $$;

-- Ajuste profesional motivado y auditable de una cifra (quién, de cuánto a cuánto y por qué).
create or replace function nom.ajustar(p_id uuid, p_campo text, p_valor bigint, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; v_de text;
begin
  if p_campo not in ('valor_comercial','precio_publicacion','cierre_min','cierre_max','rango_oferta_min','rango_oferta_max') then
    raise exception 'Campo no ajustable: %', p_campo; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'El ajuste requiere un motivo'; end if;
  select * into t from nom.tasaciones where id = p_id;
  if t.estado not in ('borrador','calculada') then raise exception 'La tasación está %; crea una nueva versión', t.estado; end if;
  v_de := (to_jsonb(t)->>p_campo);
  insert into nom.tasacion_ajustes (tasacion_id, campo, de, a, motivo) values (p_id, p_campo, v_de, p_valor::text, p_motivo);
  update nom.tasaciones set ajustes_manuales = case when p_valor is null then ajustes_manuales - p_campo
                                                     else ajustes_manuales || jsonb_build_object(p_campo, p_valor) end where id = p_id;
  perform nom.calcular(p_id);
end $$;

create or replace function nom.aprobar(p_id uuid, p_decision text, p_comentario text, p_excepcion boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; v_ap uuid; n_val int;
begin
  select * into t from nom.tasaciones where id = p_id for update;
  if t.estado <> 'calculada' then raise exception 'Solo se aprueba una tasación calculada (estado actual: %)', t.estado; end if;
  if p_decision not in ('aprobada','rechazada') then raise exception 'Decisión inválida'; end if;
  if p_decision = 'aprobada' then
    select count(*) into n_val from nom.mercado_avisos where tasacion_id = p_id and valido;
    if t.tipo = 'pre_estimacion' and not coalesce(p_excepcion, false) then
      raise exception 'Pre-estimación (% comparables válidos o versión sin confirmar): aprobarla requiere marcar la excepción y comentar', n_val;
    end if;
    if coalesce(p_excepcion, false) and coalesce(length(trim(p_comentario)), 0) < 10 then
      raise exception 'La excepción requiere un comentario que la justifique'; end if;
    if t.precio_publicacion is null then raise exception 'La tasación no tiene precio de publicación'; end if;
    if not exists (select 1 from nom.mercado_avisos where tasacion_id = p_id and valido and seleccionado_informe) then
      raise exception 'Selecciona al menos un comparable para el informe'; end if;
    if coalesce(t.resumen_comercial, '') = '' then raise exception 'Falta el resumen comercial del informe'; end if;
  end if;
  insert into nom.tasacion_aprobaciones (tasacion_id, version_n, decision, excepcion_comparables, comentario, payload_hash)
  values (p_id, t.version_n, p_decision, coalesce(p_excepcion, false), p_comentario, md5(nom.payload_cliente(p_id)::text))
  returning id into v_ap;
  if p_decision = 'aprobada' then
    update nom.tasaciones set estado = 'aprobada', token = coalesce(token, encode(extensions.gen_random_bytes(18), 'hex')) where id = p_id;
  else
    update nom.tasaciones set estado = 'borrador' where id = p_id;
  end if;
  return jsonb_build_object('aprobacion_id', v_ap, 'estado', (select estado from nom.tasaciones where id = p_id), 'token', (select token from nom.tasaciones where id = p_id));
end $$;

-- Solo registra un envío de una versión aprobada. El envío real por WhatsApp API llega en la Fase 2.
create or replace function nom.registrar_envio(p_id uuid, p_canal text, p_destinatario text, p_detalle text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; v_ap uuid; v_env uuid;
begin
  select * into t from nom.tasaciones where id = p_id for update;
  if t.estado not in ('aprobada','enviada') then raise exception 'No se puede enviar: la tasación % no está aprobada', t.folio; end if;
  select id into v_ap from nom.tasacion_aprobaciones where tasacion_id = p_id and decision = 'aprobada' and version_n = t.version_n order by en desc limit 1;
  if v_ap is null then raise exception 'Sin aprobación registrada para esta versión'; end if;
  insert into nom.tasacion_envios (tasacion_id, version_n, canal, destinatario, aprobacion_id, detalle)
  values (p_id, t.version_n, p_canal, p_destinatario, v_ap, p_detalle) returning id into v_env;
  update nom.tasaciones set estado = 'enviada' where id = p_id;
  if t.oportunidad_id is not null then
    insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
    values (t.oportunidad_id, t.empresa_id, 'whatsapp', 'tasacion_enviada', 'Informe de tasación ' || t.folio || ' v' || t.version_n || ' enviado por ' || p_canal, core.autor());
  end if;
  return jsonb_build_object('envio_id', v_env, 'token', t.token);
end $$;

-- Nueva versión: copia ficha, avisos e interna; la anterior queda «reemplazada» (no se borra).
create or replace function nom.nueva_version(p_id uuid, p_motivo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; v_new uuid := gen_random_uuid(); v_n int;
begin
  select * into t from nom.tasaciones where id = p_id;
  if t.id is null then raise exception 'Tasación no encontrada'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Indica el motivo de la nueva versión'; end if;
  select max(version_n) + 1 into v_n from nom.tasaciones where grupo_id = t.grupo_id;
  insert into nom.tasaciones (id, grupo_id, version_n, folio, oportunidad_id, empresa_id, vehiculo_id, conversacion_id, inspeccion_folio, origen,
    marca, modelo, version, version_confirmada, anio, motor, transmision, traccion, carroceria, combustible, km, color, patente, vin, duenos, llaves,
    equipamiento, observaciones, mostrar_patente, fuentes, comercialidad, comercialidad_txt, resumen_comercial, criterios, analisis_comparables, alcance,
    cobertura, ajustes_manuales)
  select v_new, grupo_id, v_n, split_part(folio, '-v', 1) || '-v' || v_n, oportunidad_id, empresa_id, vehiculo_id, conversacion_id, inspeccion_folio, origen,
    marca, modelo, version, version_confirmada, anio, motor, transmision, traccion, carroceria, combustible, km, color, patente, vin, duenos, llaves,
    equipamiento, observaciones, mostrar_patente, fuentes, comercialidad, comercialidad_txt, resumen_comercial, criterios, analisis_comparables, alcance,
    cobertura, ajustes_manuales
  from nom.tasaciones where id = p_id;
  insert into nom.mercado_busquedas (tasacion_id, portal, consulta, url_busqueda, filtros, ejecutada_en, resultados_n, ejecutor, notas)
    select v_new, portal, consulta, url_busqueda, filtros, ejecutada_en, resultados_n, ejecutor, notas from nom.mercado_busquedas where tasacion_id = p_id;
  insert into nom.mercado_avisos (tasacion_id, portal, url, titulo, marca, modelo, version_txt, version_match, anio, km, precio, transmision, traccion,
    combustible, carroceria, region, comuna, vendedor_tipo, vendedor_nombre, condicion, verificacion, verificado_en, evidencia, incluido, motivo_tasador,
    seleccionado_informe, orden_informe, diferencias)
    select v_new, portal, url, titulo, marca, modelo, version_txt, version_match, anio, km, precio, transmision, traccion, combustible, carroceria,
      region, comuna, vendedor_tipo, vendedor_nombre, condicion, verificacion, verificado_en, evidencia, incluido, motivo_tasador,
      seleccionado_informe, orden_informe, diferencias from nom.mercado_avisos where tasacion_id = p_id;
  insert into nom.tasacion_interna select v_new, precio_pretendido_cliente, urgencia, precio_toma, costo_acondicionamiento, costos_comercializacion,
    comision_pct, comision_monto, riesgo, rotacion_dias_est, modalidad_recomendada, notas_negociacion, core.autor(), now()
    from nom.tasacion_interna where tasacion_id = p_id;
  insert into nom.tasacion_ajustes (tasacion_id, campo, de, a, motivo) values (v_new, 'nueva_version', t.version_n::text, v_n::text, p_motivo);
  if t.estado in ('aprobada','enviada') then update nom.tasaciones set estado = 'reemplazada' where id = p_id; end if;
  return v_new;
end $$;

create or replace function nom.listar(p_estado text default null, p_q text default null, p_limite int default 100) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x->>'creado_en' desc), '[]'::jsonb) from (
    select jsonb_build_object('id', t.id, 'folio', t.folio, 'version_n', t.version_n, 'estado', t.estado, 'tipo', t.tipo,
      'vehiculo', concat_ws(' ', t.marca, t.modelo, t.version, t.anio), 'km', t.km, 'precio_publicacion', t.precio_publicacion,
      'confianza', t.confianza, 'validos', t.estadisticas->>'validos', 'propietario', e.nombre, 'oportunidad_id', t.oportunidad_id,
      'vigencia_hasta', t.vigencia_hasta, 'vencida', t.vigencia_hasta < (now() at time zone 'America/Santiago')::date,
      'creado_en', t.creado_en, 'creado_por', t.creado_por) x
    from nom.tasaciones t left join crm.empresas e on e.id = t.empresa_id
    where (p_estado is null or t.estado = p_estado)
      and (p_estado is not null or t.estado <> 'reemplazada')
      and (p_q is null or concat_ws(' ', t.folio, t.marca, t.modelo, t.version, t.patente, e.nombre) ilike '%' || p_q || '%')
    order by t.creado_en desc limit greatest(1, least(coalesce(p_limite, 100), 500))) s
$$;

-- ───────────────────────── capa APP (usuarios autenticados, con rol) ─────────────────────────
create or replace function public.app_nom_tasaciones(p_estado text default null, p_q text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; return nom.listar(p_estado, p_q, 200); end $$;

create or replace function public.app_nom_tasacion(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nom.puede_tasar() then raise exception 'Sin permiso'; end if;
  return nom.vista_interna(p_id, core.ve_finanzas()) || jsonb_build_object('puede_aprobar', nom.puede_aprobar(), 've_interna', core.ve_finanzas(),
    'informe', nom.payload_cliente(p_id));
end $$;

create or replace function public.app_nom_tasacion_guardar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := nullif(p->>'id','')::uuid;
begin
  if not nom.puede_tasar() then raise exception 'Sin permiso'; end if;
  if p ? 'interna' and not core.ve_finanzas() then p := p - 'interna'; end if;
  if v_id is null then v_id := nom.crear(p); else perform nom.actualizar(v_id, p); end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.app_nom_tasacion_avisos(p_id uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; return nom.registrar_busqueda(p_id, p); end $$;

create or replace function public.app_nom_aviso_editar(p_aviso uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; perform nom.editar_aviso(p_aviso, p); end $$;

create or replace function public.app_nom_tasacion_calcular(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; perform nom.calcular(p_id); return public.app_nom_tasacion(p_id); end $$;

create or replace function public.app_nom_tasacion_ajustar(p_id uuid, p_campo text, p_valor bigint, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; perform nom.ajustar(p_id, p_campo, p_valor, p_motivo); return public.app_nom_tasacion(p_id); end $$;

create or replace function public.app_nom_tasacion_aprobar(p_id uuid, p_decision text, p_comentario text, p_excepcion boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not nom.puede_aprobar() then raise exception 'Solo el responsable NOM puede aprobar tasaciones'; end if;
  return nom.aprobar(p_id, p_decision, p_comentario, p_excepcion);
end $$;

create or replace function public.app_nom_tasacion_envio(p_id uuid, p_canal text, p_destinatario text, p_detalle text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; return nom.registrar_envio(p_id, p_canal, p_destinatario, p_detalle); end $$;

create or replace function public.app_nom_tasacion_version(p_id uuid, p_motivo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin if not nom.puede_tasar() then raise exception 'Sin permiso'; end if; return jsonb_build_object('id', nom.nueva_version(p_id, p_motivo)); end $$;

create or replace function public.app_nom_tasacion_anular(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not nom.puede_aprobar() then raise exception 'Sin permiso'; end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then raise exception 'Indica el motivo'; end if;
  insert into nom.tasacion_ajustes (tasacion_id, campo, de, a, motivo) select id, 'estado', estado, 'anulada', p_motivo from nom.tasaciones where id = p_id;
  update nom.tasaciones set estado = 'anulada' where id = p_id;
end $$;

-- Informe público para el cliente: solo versiones aprobadas o enviadas, solo payload de lista blanca.
create or replace function public.tasacion_publica(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_id uuid;
begin
  if p_token is null or length(p_token) < 24 then return null; end if;
  select id into v_id from nom.tasaciones where token = p_token and estado in ('aprobada','enviada');
  if v_id is null then return null; end if;
  return nom.payload_cliente(v_id);
end $$;

revoke all on all functions in schema nom from public, anon, authenticated;
revoke all on function public.app_nom_tasaciones(text, text), public.app_nom_tasacion(uuid), public.app_nom_tasacion_guardar(jsonb),
  public.app_nom_tasacion_avisos(uuid, jsonb), public.app_nom_aviso_editar(uuid, jsonb), public.app_nom_tasacion_calcular(uuid),
  public.app_nom_tasacion_ajustar(uuid, text, bigint, text), public.app_nom_tasacion_aprobar(uuid, text, text, boolean),
  public.app_nom_tasacion_envio(uuid, text, text, text), public.app_nom_tasacion_version(uuid, text), public.app_nom_tasacion_anular(uuid, text),
  public.tasacion_publica(text) from public, anon;
grant execute on function public.app_nom_tasaciones(text, text), public.app_nom_tasacion(uuid), public.app_nom_tasacion_guardar(jsonb),
  public.app_nom_tasacion_avisos(uuid, jsonb), public.app_nom_aviso_editar(uuid, jsonb), public.app_nom_tasacion_calcular(uuid),
  public.app_nom_tasacion_ajustar(uuid, text, bigint, text), public.app_nom_tasacion_aprobar(uuid, text, text, boolean),
  public.app_nom_tasacion_envio(uuid, text, text, text), public.app_nom_tasacion_version(uuid, text), public.app_nom_tasacion_anular(uuid, text)
  to authenticated;
grant execute on function public.tasacion_publica(text) to anon, authenticated;

-- ───────────────────────── capa API (core-api / MCP, autor = clave) ─────────────────────────
-- La aprobación NO está en la API: la decide una persona desde la app. La API tampoco ve la parte interna
-- salvo api_nom_tasacion(id, true), que core-api solo expone a claves con permiso «nom_interno».
create or replace function core.api_nom_tasacion_crear(p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid; begin v := nom.crear(p || jsonb_build_object('origen', coalesce(p->>'origen','mcp'))); return nom.vista_interna(v); end $$;
create or replace function core.api_nom_tasacion_actualizar(p_id uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin perform nom.actualizar(p_id, p - 'interna'); return nom.vista_interna(p_id); end $$;
create or replace function core.api_nom_registrar_mercado(p_id uuid, p jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return nom.registrar_busqueda(p_id, p); end $$;
create or replace function core.api_nom_tasacion_calcular(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
begin return nom.calcular(p_id); end $$;
create or replace function core.api_nom_tasacion(p_id uuid, p_interna boolean default false) returns jsonb language sql stable security definer set search_path = '' as $$
  select nom.vista_interna(p_id, p_interna) || jsonb_build_object('informe', nom.payload_cliente(p_id))
$$;
create or replace function core.api_nom_tasaciones(p_q text default null) returns jsonb language sql stable security definer set search_path = '' as $$
  select nom.listar(null, p_q, 30)
$$;
revoke all on function core.api_nom_tasacion_crear(jsonb), core.api_nom_tasacion_actualizar(uuid, jsonb), core.api_nom_registrar_mercado(uuid, jsonb),
  core.api_nom_tasacion_calcular(uuid), core.api_nom_tasacion(uuid, boolean), core.api_nom_tasaciones(text) from public, anon, authenticated;

comment on schema nom is 'NOM · tasador trazable (v31). Cliente solo vía public.tasacion_publica / nom.payload_cliente. Interno en nom.tasacion_interna.';
