-- core_v48 · BlackGPS: el asesor pasa de «observar» a «borrador» (propone respuestas y seguimientos que Felipe
-- revisa y envía desde Conversaciones; nada sale solo) y tiene su propio plan de seguimientos B2B.
insert into core.parametros (clave, valor) values ('blackgps.seguimiento', jsonb_build_object(
  'nota', 'Felipe 21-nov-2026: BlackGPS propone seguimientos. Ciclo B2B más largo que Carclass. En borrador, Felipe envía desde su WhatsApp.',
  'pasos', jsonb_build_array(
    jsonb_build_object('a', '1d',  'canal', 'texto_libre', 'nota', 'dato útil para su rubro o propuesta de horario'),
    jsonb_build_object('a', '4d',  'canal', 'texto_libre'),
    jsonb_build_object('a', '10d', 'canal', 'texto_libre'),
    jsonb_build_object('a', '21d', 'accion', 'marcar_perdida', 'motivo_codigo', 'sin_respuesta'))))
on conflict (clave) do update set valor = excluded.valor;

update wa.config set valor = 'borrador' where clave = 'agente_modo_blackgps';
