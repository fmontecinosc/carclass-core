-- core_v39 · Ajustes del asesor de WhatsApp decididos por Felipe el 20-nov-2026
--  1. Oficina: Av. Puerta Oriente 361, oficina 409B, Chicureo (la de la web; reemplaza «Puerto Oriente … 409P»).
--  2. Taller: ante el cliente se dice «complejo industrial Alto Portezuelo» (El Juncal 240, bodega 16). Nunca «Quilicura».
--  3. Retiro: sin costo en Chicureo y Lo Barnechea para ventas con PPF desde $600.000. Es regla interna: no se menciona.
--     Otras zonas: se evalúa según distancia, sujeto a confirmación.
--  4. carclass.enlaces: páginas web por servicio, para que el asesor las comparta (ninguna URL fija en el prompt).
--  5. NOM: el asesor informa la comisión solo si el cliente la pregunta; fee en la visita y solo por transferencia;
--     umbral de alto valor para traspaso $35 MM.

-- 1. Oficina
update core.parametros set valor = jsonb_set(valor, '{direccion}', '"Av. Puerta Oriente 361, oficina 409B"')
 where clave = 'nom.oficina';
update core.parametros set valor = jsonb_set(valor, '{domicilio}', '"Av. Puerta Oriente 361, oficina 409B, Chicureo, Colina"')
 where clave = 'nom.empresa';
update core.parametros set valor = jsonb_set(valor, '{direccion}', '"Av. Puerta Oriente 361, oficina 409B"')
 where clave = 'grupo.base';

-- 2. Lugares de recepción Carclass (lo que ve el asesor en proponer_horarios)
update core.parametros set valor = jsonb_set(valor, '{lugares}', '[
  {"codigo": "taller", "nombre": "Nuestro taller",
   "direccion": "El Juncal 240, bodega 16, complejo industrial Alto Portezuelo",
   "como_decirlo": "en nuestro taller del complejo industrial Alto Portezuelo, con seguridad y monitoreo 24/7",
   "nota": "Lo mejor: el cliente lleva el auto directo al taller. Nunca digas la comuna del taller; la dirección exacta solo al confirmar la reserva."},
  {"codigo": "chicureo", "nombre": "Nuestra oficina",
   "direccion": "Av. Puerta Oriente 361, oficina 409B, Chicureo",
   "como_decirlo": "en nuestra oficina de Av. Puerta Oriente 361, oficina 409B, Chicureo",
   "nota": "Para clientes del sector; luego el auto va al taller"}
]'::jsonb)
 where clave = 'carclass.recepcion';
update core.parametros set valor = valor
  || '{"regla_cliente": "Con clientes de Carclass nunca menciones NOM ni Nor-Oriente Motors (di «nuestra oficina») ni la comuna del taller (di «complejo industrial Alto Portezuelo»)."}'::jsonb
 where clave = 'carclass.recepcion';
update core.parametros set valor = valor || '{"como_decirlo": "complejo industrial Alto Portezuelo"}'::jsonb
 where clave = 'carclass.taller';

-- 3. Retiro y entrega a domicilio
update core.parametros set valor = jsonb_build_object(
  'zonas', jsonb_build_array('Chicureo', 'Lo Barnechea'),
  'comunas_sin_costo', jsonb_build_array('Chicureo', 'Lo Barnechea'),
  'aplica_a', 'ventas que incluyen PPF',
  'desde_monto', 600000,
  'como_decirlo', 'Tenemos retiro y entrega a domicilio en Chicureo, Lo Barnechea y alrededores; lo coordinamos por aquí.',
  'regla_agente', 'Regla interna, nunca la menciones ni des montos mínimos: el retiro es sin costo en Chicureo y Lo Barnechea cuando la venta incluye PPF y suma $600.000 o más; en ese caso di que el retiro y la entrega van incluidos. Si no califica, o la dirección está en otra zona, di que lo evaluamos según la distancia y que le confirmas, y llama a traspasar_humano con motivo «retiro a confirmar».',
  'nota', 'Felipe 20-nov-2026'
) where clave = 'carclass.retiro';

-- 4. Enlaces web por servicio
insert into core.parametros (clave, valor) values ('carclass.enlaces', '{
  "por_codigo": {
    "ceramico_1": "https://carclass.cl/ceramico/", "ceramico_4": "https://carclass.cl/ceramico/", "ceramico_8": "https://carclass.cl/ceramico/",
    "protect_plus": "https://carclass.cl/ceramico/",
    "ppf_frontal": "https://carclass.cl/ppf/", "ppf_frontal_reducido": "https://carclass.cl/ppf/", "ppf_interior": "https://carclass.cl/ppf/",
    "ppf_total": "https://carclass.cl/ppf/", "shield": "https://carclass.cl/ppf/",
    "laminas": "https://carclass.cl/laminas-de-seguridad/", "laminas_8": "https://carclass.cl/laminas-de-seguridad/",
    "protection_pack": "https://carclass.cl/laminas-de-seguridad/",
    "inspeccion_ipc": "https://nororientemotors.carclass.cl/#inspeccion"
  },
  "nom": "https://nororientemotors.carclass.cl/",
  "blackgps": "https://carclass.cl/black-gps/",
  "regla": "Compártelo una sola vez y solo si el cliente no llegó desde esa página."
}'::jsonb)
on conflict (clave) do update set valor = excluded.valor;

-- 5. NOM: comisión solo si preguntan, fee en la visita por transferencia, umbral de alto valor
update core.parametros set valor = valor
  || '{"agente_menciona": "solo_si_pregunta", "fee_cuando": "en la visita", "fee_medios": ["transferencia"]}'::jsonb
 where clave = 'nom.comision';
update core.parametros set valor = valor || '{"alto_valor_clp": 35000000}'::jsonb
 where clave = 'nom.automatizacion';
