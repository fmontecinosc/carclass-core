-- v34 · Tasador NOM en modo conservador + datos de la oficina (Felipe, 18-nov-2026)
-- Felipe: «tratar siempre de que las tasaciones sean más a la baja que hacia arriba, para que el precio de mercado
-- esté más realista, no dificulte la venta y se venda más rápido».
-- Reglas del modo conservador (parametrizables en core.parametros['nom.tasador']):
--   1. Valor comercial = percentil ponderado 35 de los precios ajustados (no la mediana).
--   2. Publicación = valor +1 %, terminada en …90.000.
--   3. Tope: nunca publicar sobre un comparable válido igual o más nuevo y con menos km; se queda bajo él.
--   4. Cierre estimado = publicación −2 % a −5 %.
-- Un ajuste manual motivado sigue mandando sobre todo esto.

update core.parametros set valor = valor || jsonb_build_object(
  'modo_precio', 'conservador', 'percentil_valor', 0.35, 'premio_publicacion_pct', 1,
  'cierre_desc_min_pct', 2, 'cierre_desc_max_pct', 5, 'tope_mejor_comparable', true,
  'estado', 'modo conservador definido por Felipe (18-nov); ajustes año/km siguen como propuesta'),
  actualizado_en = now()
where clave = 'nom.tasador';

insert into core.parametros (clave, valor, notas) values ('nom.oficina', jsonb_build_object(
  'direccion', 'Avenida Puerto Oriente 361, oficina 409P', 'sector', 'Chicureo', 'comuna', 'Colina', 'region', 'Metropolitana',
  'dias', 'lunes a viernes', 'hora_inicio', '09:00', 'hora_fin', '18:00', 'previa_coordinacion', true,
  'duracion_visita_min', null, 'zona_horaria', 'America/Santiago'),
  'Oficina NOM para inspección, fotos y firma (Felipe 18-nov). Duración de la visita: pendiente de definir.')
on conflict (clave) do update set valor = excluded.valor, notas = excluded.notas, actualizado_en = now();

create or replace function nom.percentil_ponderado(p_vals numeric[], p_pesos numeric[], p_pct numeric) returns numeric
language plpgsql immutable set search_path = '' as $$
declare r record; total numeric; acum numeric := 0;
begin
  select sum(w) into total from unnest(p_pesos) w;
  if total is null or total <= 0 then return null; end if;
  for r in select v, w from unnest(p_vals, p_pesos) as x(v, w) order by v loop
    acum := acum + r.w;
    if acum >= total * p_pct then return r.v; end if;
  end loop;
  return null;
end $$;

create or replace function nom.calcular(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; par jsonb; aj jsonb; v_mejor record; v_adv jsonb := '[]'::jsonb;
  vals numeric[]; pesos numeric[]; v_valor bigint; v_pub bigint; v_cmin bigint; v_cmax bigint; v_tope bigint; v_nota text;
begin
  perform nom.calcular_base(p_id);
  select * into t from nom.tasaciones where id = p_id;
  par := coalesce(t.parametros, '{}'::jsonb); aj := t.ajustes_manuales;

  if par->>'modo_precio' = 'conservador' and t.valor_comercial is not null then
    select array_agg(precio_ajustado::numeric), array_agg(peso) into vals, pesos from nom.mercado_avisos where tasacion_id = p_id and valido;
    v_valor := round(nom.percentil_ponderado(vals, pesos, coalesce((par->>'percentil_valor')::numeric, 0.35)) / 10000) * 10000;
    v_pub := floor(v_valor * (1 + coalesce((par->>'premio_publicacion_pct')::numeric, 1) / 100) / 100000) * 100000 - 10000;
    if v_pub < v_valor * 0.98 then v_pub := ceil(v_valor / 100000.0) * 100000 - 10000; end if;
    v_nota := 'Modo conservador: valor en el percentil ' || round(coalesce((par->>'percentil_valor')::numeric, 0.35) * 100) || ' de los comparables ajustados';
    if coalesce((par->>'tope_mejor_comparable')::boolean, true) then
      select min(m.precio) into v_tope from nom.mercado_avisos m
       where m.tasacion_id = p_id and m.valido and m.anio >= t.anio and coalesce(m.km, 0) < coalesce(t.km, 0);
      if v_tope is not null and v_pub >= v_tope then
        v_pub := floor((v_tope - 1) / 100000.0) * 100000 - 10000;
        v_nota := v_nota || '; publicación bajo el aviso igual o más nuevo con menos km ($' || replace(to_char(v_tope, 'FM999,999,999'), ',', '.') || ')';
      end if;
    end if;
    v_cmin := round(v_pub * (1 - coalesce((par->>'cierre_desc_max_pct')::numeric, 5) / 100) / 50000) * 50000;
    v_cmax := round(v_pub * (1 - coalesce((par->>'cierre_desc_min_pct')::numeric, 2) / 100) / 50000) * 50000;
    update nom.tasaciones set
      valor_comercial = coalesce((aj->>'valor_comercial')::bigint, v_valor),
      precio_publicacion = coalesce((aj->>'precio_publicacion')::bigint, v_pub),
      cierre_min = coalesce((aj->>'cierre_min')::bigint, v_cmin),
      cierre_max = coalesce((aj->>'cierre_max')::bigint, v_cmax),
      estadisticas = estadisticas || jsonb_build_object('modo', 'conservador', 'valor_mediana_ponderada', (estadisticas->>'valor_calculado')::bigint, 'valor_calculado', v_valor, 'publicacion_calculada', v_pub,
        'cierre_calculado', jsonb_build_array(v_cmin, v_cmax), 'nota_modo', v_nota)
    where id = p_id;
    select * into t from nom.tasaciones where id = p_id;
  end if;

  -- alertas de posicionamiento sobre la publicación final
  if t.precio_publicacion is not null then
    select m.precio, m.anio, m.km into v_mejor from nom.mercado_avisos m
     where m.tasacion_id = p_id and m.valido and m.anio >= t.anio and coalesce(m.km, 0) < coalesce(t.km, 0)
       and m.precio < t.precio_publicacion order by m.precio limit 1;
    if v_mejor.precio is not null then
      v_adv := v_adv || to_jsonb(format('Hay un aviso %s con %s km publicado a $%s, bajo la publicación sugerida ($%s) y con menos kilometraje: el auto podría verse caro frente a él.',
        v_mejor.anio, replace(to_char(v_mejor.km, 'FM999,999,999'), ',', '.'), replace(to_char(v_mejor.precio, 'FM999,999,999'), ',', '.'),
        replace(to_char(t.precio_publicacion, 'FM999,999,999'), ',', '.')));
    end if;
    if t.rango_oferta_max is not null and t.precio_publicacion > t.rango_oferta_max then
      v_adv := v_adv || to_jsonb('La publicación sugerida queda sobre el rango de oferta comparable.'::text);
    end if;
    if (t.estadisticas->>'precio_min') is not null and t.precio_publicacion < (t.estadisticas->>'precio_min')::numeric * 0.95
       and not exists (select 1 from jsonb_array_elements_text(t.advertencias) x where x like 'El precio de publicación queda bajo%') then
      v_adv := v_adv || to_jsonb('El precio de publicación queda bajo todos los avisos comparables: revisar que no se vea sospechosamente barato.'::text);
    end if;
  end if;
  if jsonb_array_length(v_adv) > 0 then update nom.tasaciones set advertencias = advertencias || v_adv where id = p_id; end if;
  return nom.vista_interna(p_id);
end $$;
revoke all on function nom.calcular(uuid), nom.percentil_ponderado(numeric[], numeric[], numeric) from public, anon, authenticated;
