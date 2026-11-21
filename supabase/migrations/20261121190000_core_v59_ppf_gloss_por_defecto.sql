-- core_v59 · Felipe 21-nov-2026: el PPF por defecto sigue siendo XPEL Gloss (no «Xtreme»).
-- La planilla de Hiendcar ya lo llama «gloss»; corrige el nombre en el catálogo y en la ficha «Flujo comercial Carclass»
-- (core_v55_catalogo_manuales_v24 y core_v58 lo habían cambiado a Xtreme). Precios sin cambios.
update crm.catalogo set descripcion = replace(replace(descripcion, 'XPEL Xtreme (brillante) por defecto', 'XPEL Gloss por defecto'), 'XPEL Xtreme', 'XPEL Gloss')
 where unidad = 'carclass' and descripcion ilike '%xtreme%';
update crm.catalogo set descripcion = replace(descripcion, 'kit frontal Xtreme', 'kit frontal Gloss') where unidad = 'carclass' and descripcion ilike '%kit frontal Xtreme%';
update ops.sops set contenido = replace(replace(contenido,
  'PPF por defecto: XPEL Xtreme (brillante). Ultimate Plus 8 como línea superior; Stealth solo a pedido.',
  'PPF por defecto: XPEL Gloss. Línea superior: XPEL Ultimate (Ultimate Plus 8); Stealth (mate) solo a pedido.'),
  'kit frontal Xtreme de la planilla', 'kit frontal Gloss de la planilla'), actualizado_en = now()
 where tipo = 'proceso' and titulo = 'Flujo comercial Carclass';
update core.parametros set valor = jsonb_set(valor, '{material_default}', '"gloss"') where clave = 'carclass.ppf' and coalesce(valor->>'material_default','') <> 'gloss';
