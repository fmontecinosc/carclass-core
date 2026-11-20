-- core_v42 · Comisión NOM (Felipe 20-nov-2026): reemplaza el cálculo marginal de core_v36.
--   Precio de venta menor a $20.000.000 → 5% del precio. Desde $20.000.000 → 3% del precio total. Mínimo $500.000, IVA incluido.
--   Ej.: $15 MM → $750.000 · $19,9 MM → $995.000 · $20 MM → $600.000 · $21 MM → $630.000 · $30 MM → $900.000.
create or replace function nom.comision(p_precio bigint)
 returns bigint language sql stable set search_path to '' as $function$
  with c as (select valor v from core.parametros where clave = 'nom.comision')
  select greatest(
    coalesce((v->>'minimo_clp')::bigint, 500000),
    round(p_precio * case when p_precio < coalesce((v->>'umbral_clp')::bigint, 20000000)
                          then coalesce((v->>'pct_hasta_umbral')::numeric, 5)
                          else coalesce((v->>'pct_sobre_umbral')::numeric, 3) end / 100)::bigint)
  from c
$function$;

update core.parametros set valor = valor || jsonb_build_object(
  'regla', 'Felipe 20-nov-2026: tramo sobre el precio total',
  'calculo', 'precio < $20 MM: 5% del precio; precio >= $20 MM: 3% del precio total; mínimo $500.000, IVA incluido',
  'ejemplos', jsonb_build_object('8000000', 500000, '15000000', 750000, '19900000', 995000, '20000000', 600000, '21000000', 630000, '30000000', 900000),
  'como_decirlo_fee', 'El día de la visita se paga $50.000 por el servicio de inicio: inspección completa, fotos profesionales y publicación en los portales. Ese monto se descuenta de la comisión cuando vendemos tu auto.'
) where clave = 'nom.comision';
