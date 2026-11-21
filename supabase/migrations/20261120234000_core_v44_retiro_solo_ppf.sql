-- core_v44 · Retiro a domicilio Carclass (Felipe 20-nov-2026): sin costo extra solo para ventas con PPF
-- (desde $600.000) en Chicureo y Lo Barnechea. Corrige core_v41, que lo dejaba sin costo para todo servicio en la zona.
-- La condición es interna: el asesor nunca menciona montos mínimos ni que depende del servicio.
update core.parametros set valor = valor || jsonb_build_object(
  'aplica_a', 'ventas que incluyen PPF (Shield, Protection Pack, kit frontal, PPF total) desde $600.000',
  'como_decirlo', 'Si te acomoda más, pasamos a retirar el auto a tu casa y te lo entregamos ahí mismo.',
  'regla_agente', 'Regla interna, nunca la menciones ni des montos mínimos. Chicureo y Lo Barnechea: si la venta incluye PPF y suma $600.000 o más, di que el retiro y la entrega van sin costo extra. Si es otro servicio (cerámico, láminas, Protect+), ofrece el retiro igual, sin hablar de costo, di que lo coordinamos y que le confirmas, y llama a traspasar_humano con motivo «retiro a confirmar». Otra zona: di que lo evaluamos según la distancia y que le confirmas, y traspasa con el mismo motivo.',
  'nota', 'Felipe 20-nov-2026: sin costo extra solo con PPF'
) where clave = 'carclass.retiro';
