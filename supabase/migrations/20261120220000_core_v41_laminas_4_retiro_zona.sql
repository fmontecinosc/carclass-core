-- core_v41 · Felipe 20-nov-2026
--  · Láminas: se recomienda primero la de 4 micras; la de 8 es la alternativa. Instalación a domicilio posible si el lugar
--    está techado, idealmente cerrado o con poco polvo, y tiene enchufe.
--  · Retiro: en Chicureo y Lo Barnechea no tiene costo extra (se puede decir). Otras zonas: según distancia, a confirmar.
update crm.catalogo set nombre = 'Láminas de seguridad 4 micras (recomendada)' where codigo = 'laminas' and unidad = 'carclass';
update crm.catalogo set nombre = 'Láminas de seguridad 8 micras' where codigo = 'laminas_8' and unidad = 'carclass';

insert into core.parametros (clave, valor) values ('carclass.laminas_domicilio', '{
  "disponible": true,
  "requisitos": ["lugar techado", "idealmente cerrado o con poco polvo", "enchufe a la corriente cerca"],
  "coordina": "Felipe con el instalador (traspaso)"
}'::jsonb)
on conflict (clave) do update set valor = excluded.valor;

update core.parametros set valor = valor || jsonb_build_object(
  'como_decirlo', 'Si te acomoda más, pasamos a retirar el auto a tu casa y te lo entregamos ahí mismo.',
  'regla_agente', 'En Chicureo y Lo Barnechea el retiro y la entrega a domicilio no tienen costo extra: puedes decirlo. Nunca menciones montos mínimos ni condiciones internas. Si la dirección está en otra zona, di que lo evaluamos según la distancia y que le confirmas, y llama a traspasar_humano con motivo «retiro a confirmar».',
  'nota', 'Felipe 20-nov-2026: sin costo extra en la zona'
) where clave = 'carclass.retiro';
