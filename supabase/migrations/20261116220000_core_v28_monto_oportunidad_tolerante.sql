-- v28 · El monto de la oportunidad acepta formato chileno («25.000», «$25.000»): se quitan puntos, símbolos y espacios.
do $$ declare d text; begin
  d := pg_get_functiondef('public.app_oportunidad_guardar(jsonb)'::regprocedure);
  d := replace(d, 'monto_estimado = nullif(p->>''monto'', '''')::bigint',
                  'monto_estimado = nullif(regexp_replace(coalesce(p->>''monto'', ''''), ''[^0-9-]'', '''', ''g''), '''')::bigint');
  if position('regexp_replace' in d) = 0 then raise exception 'No se pudo ajustar app_oportunidad_guardar'; end if;
  execute d;
end $$;
