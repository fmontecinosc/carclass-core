-- core_v86 · Tasador: un aviso «Rapid Spaceback» es el mismo modelo que la ficha «Rapid» + versión «Spaceback 1.2».
-- Antes nom.calcular_base exigía modelo idéntico y descartaba como «Modelo distinto» justo los avisos más parecidos
-- (NOM-TAS-2026-11-26-0006). Ahora el modelo del aviso también calza si es el inicio de «modelo + versión» de la ficha
-- (así «Corolla Cross» sigue sin calzar con «Corolla XLI»).
do $$
declare d text; viejo text := $v$elsif nom.norm(a.modelo) is not null and nom.norm(a.modelo) <> nom.norm(t.modelo) then v_motivo := 'Modelo distinto';$v$;
  nuevo text := $v$elsif nom.norm(a.modelo) is not null and nom.norm(a.modelo) <> nom.norm(t.modelo)
          and position(nom.norm(a.modelo) in nom.norm(t.modelo || ' ' || coalesce(t.version, ''))) <> 1 then v_motivo := 'Modelo distinto';$v$;
begin
  d := pg_get_functiondef('nom.calcular_base(uuid)'::regprocedure);
  if position(viejo in d) = 0 then raise exception 'No encontré la regla de modelo en nom.calcular_base'; end if;
  execute replace(d, viejo, nuevo);
end $$;
