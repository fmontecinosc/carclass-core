-- core_v55 · catálogo del cotizador de Core según procesos v2.4 (tabla aprobada por Felipe el 21-nov-2026)
-- Carclass: láminas 8 micras recomendada, nivel de corrección en cada cerámico, Detailing Pre-Venta nuevo.
-- Carwash.hf: tamaños con el nombre de la web; pulidos fuera de la web desactivados; pulido + cerámico sin precio para el cliente.
-- WPF parabrisas y reparación de llantas se mantienen (Felipe).

update crm.catalogo set nombre = 'Láminas de seguridad XPEL 4 micras', descripcion = 'Laterales + luneta, $225.000 a $250.000 según modelo. Tienen tonalidad: si piden «polarizado», es esta lámina con el tono legal.' where codigo = 'laminas';
update crm.catalogo set nombre = 'Láminas de seguridad XPEL 8 micras (recomendada)', descripcion = 'Laterales + luneta, $300.000 a $325.000 según modelo; parabrisas como adicional. Es la que se recomienda.' where codigo = 'laminas_8';
update crm.catalogo set descripcion = 'XPEL Fusion Plus. Incluye descontaminación y corrección de pintura intermedia (hasta 80% de los detalles) y detailing interior.' where codigo = 'ceramico_1';
update crm.catalogo set descripcion = 'XPEL Fusion Plus. Incluye descontaminación y corrección de pintura más profunda (hasta 90% de los detalles) y detailing interior.' where codigo = 'ceramico_4';
update crm.catalogo set descripcion = 'XPEL Fusion Plus. Incluye descontaminación, corrección de pintura detallada en 3 etapas (máxima corrección y brillo) y detailing interior.' where codigo = 'ceramico_8';

insert into crm.catalogo (unidad, codigo, nombre, precio, activo, aproximado, requiere_humano, orden, descripcion)
select 'carclass', 'detailing_preventa', 'Detailing Pre-Venta', 225000, true, true, false, 97,
  'Para vender el auto: lavado, descontaminación, pulido abrillantado de un paso, pulido de focos, limpieza interior con tapicería y paneles de puerta, y aromatización. 4 a 6 horas según estado y tamaño. Se ofrece a todo consignante NOM. carclass.cl/servicios/#detailing-pre-venta'
where not exists (select 1 from crm.catalogo where codigo = 'detailing_preventa');

-- Carwash.hf: nombre de los tamaños como en carclass.cl/carwash-hf
update crm.catalogo set nombre = replace(replace(replace(nombre,
    '· Pequeño y mediano', '· Auto o SUV compacto'),
    '· Pickup XL y SUV 3 corridas', '· Pickup XL o SUV 7 asientos'),
    '· SUV y pickup mediana', '· SUV o pickup mediana')
where unidad = 'carwash';
update crm.catalogo set nombre = replace(nombre, 'Limpieza Interior + Tapicería', 'Interior + tapiz') where unidad = 'carwash' and codigo like 'interior_tapiceria_%';
update crm.catalogo set requiere_humano = false where unidad = 'carwash' and codigo like 'interior_tapiceria_%';
update crm.catalogo set activo = false where unidad = 'carwash' and (codigo like 'pulido_basico_%' or codigo like 'pulido_intermedio_sintetico_%');
update crm.catalogo set requiere_humano = true, descripcion = 'Sin precio publicado: lo cotiza Felipe por WhatsApp con el auto a la vista. Corrige micro rayones y aplica sellado cerámico. El valor es solo referencia interna.' where unidad = 'carwash' and codigo like 'pulido_sellado_ceramico_%';

update core.parametros set valor = jsonb_set(valor, '{tramos}', '[
  {"codigo": "t1", "nombre": "Auto o SUV compacto", "ejemplos": "citycar, hatchback, sedán, SUV compacto"},
  {"codigo": "t2", "nombre": "SUV o pickup mediana", "ejemplos": "SUV mediano, Hilux, L200, Ranger, D-Max, Frontier"},
  {"codigo": "t3", "nombre": "Pickup XL o SUV 7 asientos", "ejemplos": "F-150, Ram, Tundra, Tahoe, Maxus D90, Jetour X70 7 asientos"}]'::jsonb), actualizado_en = now()
where clave = 'carwash.negocio';
