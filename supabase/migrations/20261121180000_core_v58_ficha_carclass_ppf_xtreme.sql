-- core_v58 · Ficha «Flujo comercial Carclass»: PPF XPEL Xtreme por defecto (decisión de Felipe en el chat del tasador,
-- core_v55_catalogo_manuales_v24), Shield y Protection Pack por modelo.
update ops.sops set contenido = replace(contenido,
  '  - PPF por defecto: XPEL Gloss (7 años de garantía). Alternativa: XPEL Ultimate (10 años). No mezclar dos líneas en la misma propuesta.',
  '  - PPF por defecto: XPEL Xtreme (brillante). Ultimate Plus 8 como línea superior; Stealth solo a pedido. No mezclar dos líneas en la misma propuesta. Shield y Protection Pack se cotizan por modelo (kit frontal Xtreme de la planilla Hiendcar + cerámico 4 años [+ láminas 4 micras] − 5%); los montos del catálogo son referencia «desde».'),
  actualizado_en = now()
where tipo = 'proceso' and titulo = 'Flujo comercial Carclass';
