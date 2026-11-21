-- core_v56 · Leads de la landing BlackGPS (formulario Elementor → /core-api/lead-web, canal «web»)
-- entran en «pre_revision» (procesos v2.4, ficha 4) con próxima acción «Revisar lead de la landing y contactar (demo gratuita)».
-- Los demás leads B2B siguen entrando en «por_contactar»; los B2C en «nuevo».
do $$ declare d text; n int; begin
  d := pg_get_functiondef('core.api_registrar_lead(jsonb,text)'::regprocedure);
  n := (length(d) - length(replace(d, $q$case when v_b2b then 'por_contactar' else 'nuevo' end$q$, ''))) / length($q$case when v_b2b then 'por_contactar' else 'nuevo' end$q$);
  if n <> 1 then raise exception 'esperaba 1 ocurrencia, hay %', n; end if;
  d := replace(d, $q$case when v_b2b then 'por_contactar' else 'nuevo' end$q$,
    $q$case when v_b2b and coalesce(p->>'canal','') = 'web' then 'pre_revision' when v_b2b then 'por_contactar' else 'nuevo' end$q$);
  d := replace(d, $q$case when v_b2b then 'Contactar lead entrante' else 'Responder y calificar' end$q$,
    $q$case when v_b2b and coalesce(p->>'canal','') = 'web' then 'Revisar lead de la landing y contactar (demo gratuita)' when v_b2b then 'Contactar lead entrante' else 'Responder y calificar' end$q$);
  execute d;
end $$;
