-- core_v64 · fichas de procesos alineadas con core_v61 (pulidos Carwash.hf) y core_v62 (reporte al consignante cada 7 días)
update ops.sops set contenido = replace(replace(contenido,
  'Cotiza los 4 lavados con el catálogo de abajo; pulido, cerámico, empresas y vans pasan a Felipe.',
  'Cotiza los 4 lavados, el Pulido Básico y el Sellado Cerámico Lite con el catálogo de abajo; empresas y vans pasan a Felipe.'),
  'Sin precio publicado (se cotiza por WhatsApp; lo hace Felipe): pulido y sellado cerámico; empresas',
  'Pulidos (valor aproximado con IVA, se confirma con el auto a la vista): Pulido Básico ≈ $150.000 (lavado completo, descontaminación y pulido abrillantado); Sellado Cerámico Lite ≈ $250.000 (corrección intermedia + sellado cerámico, solo exterior, sin interior).

Sin precio publicado (se cotiza por WhatsApp; lo hace Felipe): empresas'), actualizado_en = now()
where tipo = 'proceso' and titulo = 'Flujo comercial Carwash.hf';
update ops.sops set contenido = replace(contenido, '- Reporte semanal al consignante: lo genera', '- Reporte al consignante cada 7 días: lo genera'), actualizado_en = now()
where tipo = 'proceso' and titulo = 'Flujo NOM consignantes';
