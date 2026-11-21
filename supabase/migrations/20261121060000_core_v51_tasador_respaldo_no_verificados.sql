-- core_v51 · Tasador NOM: pre-estimación con avisos no verificados cuando no hay 3 verificados.
-- Caso real (CX-5, 20-nov): el investigador vio 10+ comparables en búsquedas y listados, pero los portales no dejan
-- abrir los avisos y quedaron 0 verificados → la tasación salía sin precio. Ahora, si hay menos verificados que
-- min_comparables, el cálculo usa también los «no_verificado» (y versión «indeterminada») con menos peso
-- (nom.tasador.peso_no_verificado, 0,6 por defecto), la deja como pre-estimación de confianza baja y lo advierte.
-- Aprobarla sigue exigiendo excepción expresa de Felipe. Con 3 o más verificados el cálculo no cambia.
-- Se modifica la definición vigente de nom.calcular_base con reemplazos verificados (falla si algo no calza).
do $mig$
declare d text := pg_get_functiondef('nom.calcular_base(uuid)'::regprocedure); n text;
begin
  n := replace(d, 'v_conf text; v_tipo text; disp numeric; v_aj jsonb;', 'v_conf text; v_tipo text; disp numeric; v_aj jsonb; n_verif int; v_respaldo boolean;');
  if n = d then raise exception 'v51: no calzó la declaración'; end if; d := n;

  n := replace(d, 'select count(*) into n_univ from nom.mercado_avisos where tasacion_id = p_id;',
    'select count(*) into n_univ from nom.mercado_avisos where tasacion_id = p_id;
  select count(*) into n_verif from nom.mercado_avisos where tasacion_id = p_id and incluido and verificacion = ''verificado_activo'' and coalesce(precio, 0) > 0;
  v_respaldo := n_verif < coalesce((par->>''min_comparables'')::int, 3);');
  if n = d then raise exception 'v51: no calzó el conteo'; end if; d := n;

  n := replace(d, 'elsif a.verificacion <> ''verificado_activo'' then v_motivo',
                  'elsif a.verificacion <> ''verificado_activo'' and not v_respaldo then v_motivo');
  if n = d then raise exception 'v51: no calzó la regla de verificación'; end if; d := n;

  n := replace(d, 'elsif a.version_match = ''indeterminada'' then v_motivo',
                  'elsif a.version_match = ''indeterminada'' and not v_respaldo then v_motivo');
  if n = d then raise exception 'v51: no calzó la regla de versión'; end if; d := n;

  n := replace(d, '* case when a.condicion = ''financiamiento'' then coalesce((par->>''peso_financiamiento'')::numeric, 0.5) else 1 end;',
    '* case when a.condicion = ''financiamiento'' then coalesce((par->>''peso_financiamiento'')::numeric, 0.5) else 1 end
                * case when a.verificacion <> ''verificado_activo'' then coalesce((par->>''peso_no_verificado'')::numeric, 0.6) else 1 end
                * case when a.version_match = ''indeterminada'' then 0.85 else 1 end;');
  if n = d then raise exception 'v51: no calzó el peso'; end if; d := n;

  n := replace(d, 'v_tipo := case when n_val >= coalesce((par->>''min_comparables'')::int, 3) and t.version_confirmada then ''tasacion'' else ''pre_estimacion'' end;',
    'v_tipo := case when not v_respaldo and n_val >= coalesce((par->>''min_comparables'')::int, 3) and t.version_confirmada then ''tasacion'' else ''pre_estimacion'' end;
  if v_respaldo and n_val > 0 then
    v_conf := ''bajo'';
    adv := adv || to_jsonb(format(''Pre-estimación con avisos no verificados: hay %s verificado(s) de %s mínimos, así que se usaron con menor peso los avisos vistos en búsquedas y listados. Abre y confirma al menos 3 antes de aprobar, o apruébala como excepción.'',
      n_verif, coalesce((par->>''min_comparables'')::int, 3)));
  end if;');
  if n = d then raise exception 'v51: no calzó el tipo'; end if; d := n;

  execute d;
end $mig$;
