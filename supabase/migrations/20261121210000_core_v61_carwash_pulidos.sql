-- core_v61 · Carwash.hf mantiene los pulidos (Felipe 21-nov): Pulido básico aprox. $150.000 y Sellado Cerámico Lite $250.000
-- (corrección intermedia + sellado, sin interior). Valor único aproximado; los tramos por tamaño anteriores quedan inactivos.
update crm.catalogo set activo = false
 where unidad = 'carwash' and (codigo like 'pulido_basico_t%' or codigo like 'pulido_sellado_ceramico_t%' or codigo like 'pulido_intermedio_sintetico_t%');

insert into crm.catalogo (unidad, codigo, nombre, tipo, descripcion, precio, orden, aproximado, requiere_humano, activo)
select 'carwash', 'pulido_basico', 'Pulido Básico', 'servicio',
       'Lavado completo, descontaminación de pintura y pulido abrillantado. Valor aproximado con IVA; se confirma con el auto a la vista según tamaño y estado.',
       150000, 40, true, false, true
where not exists (select 1 from crm.catalogo where unidad = 'carwash' and codigo = 'pulido_basico');

insert into crm.catalogo (unidad, codigo, nombre, tipo, descripcion, precio, orden, aproximado, requiere_humano, activo)
select 'carwash', 'sellado_ceramico_lite', 'Sellado Cerámico Lite', 'servicio',
       'Corrección intermedia de pintura + sellado cerámico, solo exterior (no incluye interior). Valor aproximado con IVA; se confirma con el auto a la vista según tamaño y estado.',
       250000, 70, true, false, true
where not exists (select 1 from crm.catalogo where unidad = 'carwash' and codigo = 'sellado_ceramico_lite');

update crm.catalogo set activo = true, precio = 150000, aproximado = true where unidad = 'carwash' and codigo = 'pulido_basico';
update crm.catalogo set activo = true, precio = 250000, aproximado = true where unidad = 'carwash' and codigo = 'sellado_ceramico_lite';
