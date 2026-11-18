-- v36 · NOM: comisión por tramos y bloques de visita (Felipe 18-nov-2026)
-- Comisión: 5% hasta $20 MM + 3% del exceso sobre $20 MM; mínimo $500.000; con IVA. La comisión nunca baja al subir el precio.
-- Visita en Chicureo: 2 horas, un bloque de mañana (10:00) y uno de tarde (15:00), lunes a viernes.

update core.parametros set valor = valor - 'tramo_pendiente' || jsonb_build_object(
  'calculo', 'marginal: 5% de los primeros $20 MM + 3% del exceso; mínimo $500.000',
  'ejemplos', jsonb_build_object('8000000', 500000, '15000000', 750000, '20000000', 1000000, '21000000', 1030000, '30000000', 1300000)),
  actualizado_en = now()
where clave = 'nom.comision';

update core.parametros set valor = valor || jsonb_build_object('duracion_visita_min', 120, 'bloques', jsonb_build_array('10:00', '15:00')),
  notas = 'Oficina NOM para inspección, fotos y firma (Felipe 18-nov). Visita de 2 h: 10:00 y 15:00, lunes a viernes.', actualizado_en = now()
where clave = 'nom.oficina';

create or replace function nom.comision(p_precio bigint) returns bigint language sql stable set search_path = '' as $$
  with c as (select valor v from core.parametros where clave = 'nom.comision')
  select greatest(
    coalesce((v->>'minimo_clp')::bigint, 500000),
    round(least(p_precio, coalesce((v->>'umbral_clp')::bigint, 20000000)) * coalesce((v->>'pct_hasta_umbral')::numeric, 5) / 100
        + greatest(p_precio - coalesce((v->>'umbral_clp')::bigint, 20000000), 0) * coalesce((v->>'pct_sobre_umbral')::numeric, 3) / 100)::bigint)
  from c
$$;
revoke all on function nom.comision(bigint) from public, anon, authenticated;

update ops.sops set contenido = replace(contenido, 'Comisión: 5% bajo $20 MM, 3% sobre $20 MM, mínimo $500.000 (con IVA).',
  'Comisión: 5% hasta $20 MM + 3% del exceso sobre $20 MM, mínimo $500.000 (con IVA).')
where titulo = 'Flujo NOM consignantes';
update ops.sops set contenido = replace(contenido, 'previa coordinación): inspección, fotos y firma.', 'previa coordinación; visita de 2 h a las 10:00 o 15:00): inspección, fotos y firma.')
where titulo = 'Flujo NOM consignantes';
