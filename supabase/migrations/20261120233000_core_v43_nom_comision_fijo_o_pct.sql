-- core_v43 · Comisión NOM definitiva (Felipe 20-nov-2026, tras revisar el mercado). Reemplaza core_v42.
--   Precio de venta menor a $20.000.000 → 5% del precio (mínimo $500.000).
--   Desde $20.000.000 → el mayor entre $1.000.000 y el 3,5% del precio. Todo con IVA incluido.
--   Sin saltos: el 5% de $20 MM es $1 MM y el 3,5% supera el millón desde ~$28,6 MM.
--   Ej.: $8 MM → $500.000 · $15 MM → $750.000 · $20 MM → $1.000.000 · $25 MM → $1.000.000 · $30 MM → $1.050.000 · $40 MM → $1.400.000.
create or replace function nom.comision(p_precio bigint)
 returns bigint language sql stable set search_path to '' as $function$
  with c as (select valor v from core.parametros where clave = 'nom.comision')
  select case
    when p_precio < coalesce((v->>'umbral_clp')::bigint, 20000000)
      then greatest(coalesce((v->>'minimo_clp')::bigint, 500000),
                    round(p_precio * coalesce((v->>'pct_hasta_umbral')::numeric, 5) / 100)::bigint)
    else greatest(coalesce((v->>'fijo_desde_umbral_clp')::bigint, 1000000),
                  round(p_precio * coalesce((v->>'pct_sobre_umbral')::numeric, 3.5) / 100)::bigint)
  end
  from c
$function$;

update core.parametros set valor = valor || jsonb_build_object(
  'regla', 'Felipe 20-nov-2026: 5% bajo 20 MM; desde 20 MM, el mayor entre 1 MM y 3,5%',
  'calculo', 'precio < $20 MM: 5% del precio (mínimo $500.000); precio >= $20 MM: el mayor entre $1.000.000 y el 3,5% del precio; IVA incluido',
  'pct_sobre_umbral', 3.5,
  'fijo_desde_umbral_clp', 1000000,
  'ejemplos', jsonb_build_object('8000000', 500000, '15000000', 750000, '20000000', 1000000, '25000000', 1000000, '30000000', 1050000, '40000000', 1400000),
  'mercado', 'Referencia 20-nov-2026: VP Motors 5% + IVA; MrCar 4,5% + IVA (mín. 360 mil + IVA); Mi Auto Garantizado 5% + IVA; Tradecars 4%. Top Motors, Auto 360 y Juan Ignacio Walker no publican su comisión.'
) where clave = 'nom.comision';
