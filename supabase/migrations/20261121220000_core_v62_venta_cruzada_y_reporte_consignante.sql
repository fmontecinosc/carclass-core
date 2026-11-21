-- core_v62 · Decisiones de Felipe (21-nov):
-- 1) Venta cruzada activa, nombrando la marca, pero solo con la primera venta ya cerrada (para no marear al cliente).
-- 2) Reporte al consignante cada 7 días.
-- El prompt del asesor (wa.config agente_prompt y agente_prompt_prueba = prompts/asesor-sistema.md) se actualizó en el mismo cambio.
update core.parametros set valor = jsonb_set(valor, '{regla_cliente}',
  to_jsonb('Con clientes de Carclass se dice «nuestra oficina en Puertas de Chicureo». NOM o Nor-Oriente Motors solo se nombra como venta cruzada, una vez y con la primera venta ya cerrada.'::text))
 where clave = 'grupo.base';

update core.parametros set valor = jsonb_set(valor, '{regla_cliente}',
  to_jsonb('No menciones NOM ni Nor-Oriente Motors mientras el cliente decide; solo como venta cruzada, una vez y con la primera venta ya cerrada. Nunca digas «nuestro taller»: es «el centro de instalación del complejo industrial Alto Portezuelo» (del partner). También recibimos en «nuestra oficina en Puertas de Chicureo».'::text))
 where clave = 'carclass.recepcion';

insert into core.parametros (clave, valor)
values ('grupo.venta_cruzada', jsonb_build_object(
  'activa', true,
  'condicion', 'primera venta cerrada: reserva confirmada, abono recibido o servicio agendado',
  'regla', 'Una sola mención, en una línea, nombrando la marca; si no hay interés, no se insiste.',
  'carclass_a_nom', 'Si el cliente va a vender o cambiar su auto: «también tenemos Nor-Oriente Motors, nuestra marca de consignación de autos».',
  'nom_a_carclass', 'A quien compra o consigna con NOM: la protección Carclass para su auto.',
  'nota', 'Felipe 21-nov-2026'))
on conflict (clave) do update set valor = excluded.valor;

insert into core.parametros (clave, valor)
values ('nom.reporte_consignante', jsonb_build_object(
  'frecuencia_dias', 7,
  'canal', 'WhatsApp (PDF)',
  'contenido', 'visitas y contactos del aviso, interesados, ofertas recibidas y propuesta de ajuste de precio si corresponde',
  'nota', 'Felipe 21-nov-2026: el reporte al consignante es cada 7 días'))
on conflict (clave) do update set valor = excluded.valor;
