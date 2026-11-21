-- core_v53 · Felipe 21-nov-2026
-- 1) Retiro y entrega a domicilio: sin costo en CUALQUIER servicio con total desde $600.000 (sector Chicureo, Lo Barnechea y alrededores);
--    bajo ese total, ≈ $30.000. Reemplaza la regla «solo con PPF» de core_v44.
-- 2) Recepción: nunca «nuestro taller»; el auto se recibe en el centro de instalación del partner (Alto Portezuelo) o en nuestra oficina en Puertas de Chicureo.

update core.parametros set valor = valor
  || jsonb_build_object(
    'nota', 'Felipe 21-nov-2026: sin costo en cualquier servicio desde $600.000; bajo eso, aprox. $30.000',
    'aplica_a', 'cualquier servicio con total cotizado desde $600.000',
    'costo_bajo_monto', 30000,
    'zonas', jsonb_build_array('Chicureo', 'Lo Barnechea', 'alrededores de Chicureo'),
    'comunas_sin_costo', jsonb_build_array('Chicureo', 'Lo Barnechea'),
    'regla_agente', 'Retiro y entrega a domicilio solo en el sector cercano a Chicureo (Chicureo, Lo Barnechea y alrededores). Si el total cotizado es de $600.000 o más, cualquier servicio, di que el retiro y la entrega van sin costo extra. Si el total es menor, ofrécelo con un costo aproximado de $30.000. Nunca menciones el monto mínimo. Otra zona: di que lo evaluamos según la distancia y que le confirmas, y llama a traspasar_humano con motivo «retiro a confirmar».'),
  actualizado_en = now()
where clave = 'carclass.retiro';

update core.parametros set valor = jsonb_set(jsonb_set(valor,
    '{lugares}', (select jsonb_agg(case
        when l->>'codigo' = 'taller' then l || jsonb_build_object('nombre', 'Centro de instalación (partner)',
          'como_decirlo', 'en el centro de instalación del complejo industrial Alto Portezuelo, en Quilicura, con seguridad y monitoreo 24/7')
        when l->>'codigo' = 'chicureo' then l || jsonb_build_object('nombre', 'Nuestra oficina en Puertas de Chicureo',
          'como_decirlo', 'en nuestra oficina en Puertas de Chicureo, Av. Puerta Oriente 361, oficina 409B')
        else l end) from jsonb_array_elements(valor->'lugares') l)),
    '{regla_cliente}', to_jsonb('Con clientes de Carclass nunca menciones NOM ni Nor-Oriente Motors. Nunca digas «nuestro taller»: es «el centro de instalación del complejo industrial Alto Portezuelo» (del partner). También recibimos en «nuestra oficina en Puertas de Chicureo».'::text)),
  actualizado_en = now()
where clave = 'carclass.recepcion';

update crm.catalogo set descripcion = 'Sector cercano a Chicureo (Chicureo, Lo Barnechea y alrededores). Sin costo cuando el total cotizado es de $600.000 o más, cualquier servicio; bajo ese total, aprox. $30.000. Otras zonas se evalúan según la distancia.'
where codigo = 'retiro';

update wa.config set valor = replace(replace(valor,
    'La oficina de Chicureo es «nuestra oficina de Av. Puerta Oriente 361, oficina 409B, Chicureo».',
    'La oficina es «nuestra oficina en Puertas de Chicureo, Av. Puerta Oriente 361, oficina 409B»; ahí también recibimos autos.'),
    'El taller es «nuestro taller del complejo industrial Alto Portezuelo, en Quilicura»',
    'Nunca digas «nuestro taller»: el lugar de instalación es «el centro de instalación del complejo industrial Alto Portezuelo, en Quilicura, con seguridad y monitoreo 24/7»'),
  actualizado_en = now()
where clave = 'agente_prompt';

update ops.sops set contenido = replace(replace(contenido,
    '- Recepción de autos: oficina de Chicureo (Av. Puerta Oriente 361, oficina 409B) o taller del partner en el complejo Alto Portezuelo (El Juncal 240, Quilicura), de 9:00 a 18:00, con previa coordinación. Con clientes de Carclass nunca se menciona NOM.',
    '- Recepción de autos: nuestra oficina en Puertas de Chicureo (Av. Puerta Oriente 361, oficina 409B) o el centro de instalación del partner en el complejo Alto Portezuelo (El Juncal 240, Quilicura), de 9:00 a 18:00, con previa coordinación. Con clientes nunca se dice «nuestro taller» ni se menciona NOM.'),
    '- Retiro y entrega a domicilio: sector cercano a Chicureo (Chicureo y Lo Barnechea). Regla vigente en Core (`core.parametros` carclass.retiro, 20 nov): sin costo en ventas con PPF desde $600.000; en otros servicios u otras zonas se ofrece el retiro y Felipe confirma el costo (≈ $30.000). El agente nunca menciona montos mínimos.',
    '- Retiro y entrega a domicilio: solo en el sector cercano a Chicureo (Chicureo, Lo Barnechea y alrededores). Sin costo cuando el total cotizado es de $600.000 o más, sea cual sea el servicio; bajo ese total, aprox. $30.000. El agente nunca menciona el monto mínimo.'),
  actualizado_en = now()
where tipo = 'proceso' and titulo = 'Operación Carclass';

-- Prompt del asesor: las otras dos menciones de «nuestro taller» y la «oficina central»
update wa.config set valor = replace(replace(replace(valor,
  '**Primero indica siempre el taller:** el auto se recibe en nuestro taller del complejo industrial Alto Portezuelo, en Quilicura.',
  '**Primero indica dónde se recibe:** el auto se recibe en el centro de instalación del complejo industrial Alto Portezuelo, en Quilicura, o en nuestra oficina en Puertas de Chicureo.'),
  'XPEL, en nuestro taller del complejo industrial Alto Portezuelo',
  'XPEL, en el centro de instalación del complejo industrial Alto Portezuelo'),
  'la recepción en nuestra oficina central de Av. Puerta Oriente 361, oficina 409B, Chicureo',
  'la recepción en nuestra oficina en Puertas de Chicureo (Av. Puerta Oriente 361, oficina 409B)'), actualizado_en = now()
where clave = 'agente_prompt';
