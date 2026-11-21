-- core_v55 · Catálogo y etapas según los manuales de Felipe (procesos v2.4 y agente v1.1, 21-nov-2026),
-- con lo decidido en el chat por encima: PPF XPEL Xtreme por defecto, Shield y Protection Pack con precio por modelo,
-- retiro (descripción reemplazada por core_v57), IPC de 6 capas y 138 puntos, y Detailing Pre-Venta nuevo.

update crm.catalogo set descripcion = 'Inspección pre compra: protocolo de 6 capas y 138 puntos de control; informe con veredicto, puntaje por capa, valor de mercado estimado, costo de regularización y precio máximo sugerido.'
 where unidad = 'nom' and codigo = 'inspeccion_ipc';

update crm.catalogo set descripcion = 'Regla interna en core.parametros[''carclass.retiro'']: sin costo extra solo en Chicureo y Lo Barnechea para ventas con PPF desde $600.000. Otros servicios u otras zonas: se ofrece sin hablar de costo y se traspasa «retiro a confirmar». Nunca mencionar montos mínimos.'
 where unidad = 'carclass' and codigo = 'retiro';

update crm.catalogo set descripcion = 'XPEL Xtreme (brillante) por defecto: parachoques, capó, tapabarros, focos y espejos. Precio por modelo según la planilla de Hiendcar; 990.000 referencial. El PDF incluye Ultimate Plus 8 como línea superior; Stealth solo a pedido. Nunca se cotiza solo.'
 where unidad = 'carclass' and codigo = 'ppf_frontal';

update crm.catalogo set descripcion = 'PPF frontal XPEL Xtreme (kit 5 piezas: capó, parachoques, tapabarros, focos y espejos) + sellado cerámico 4 años + corrección + informe técnico. Precio por modelo (Felipe 21-nov): (kit frontal Xtreme de la planilla + cerámico 4 años) − 5%. 1.350.000 es solo referencia «desde».'
 where unidad = 'carclass' and codigo = 'shield';

update crm.catalogo set descripcion = 'Láminas de seguridad 4 micras + PPF frontal XPEL Xtreme (kit 5 piezas) + sellado cerámico 4 años, en una sola visita. Precio por modelo (Felipe 21-nov): (kit frontal Xtreme + cerámico 4 años + láminas 4 micras) − 5%. 1.590.000 es solo referencia «desde». Pago: reserva $50.000, 50% al ingreso y saldo a la entrega.'
 where unidad = 'carclass' and codigo = 'protection_pack';

update crm.catalogo set descripcion = replace(descripcion, 'XPEL Gloss', 'XPEL Xtreme')
 where unidad = 'carclass' and codigo = 'ppf_total' and descripcion like '%XPEL Gloss%';

-- Detailing Pre-Venta (manual v2.4, Felipe 20-nov): para quien va a vender su auto
insert into crm.catalogo (unidad, codigo, nombre, tipo, descripcion, precio, orden, aproximado, requiere_humano, activo)
select 'carclass', 'detailing_preventa', 'Detailing Pre-Venta', 'servicio',
       'Servicio integral para vender el auto: lavado, descontaminación y pulido abrillantado de un paso, pulido de focos, limpieza interior con tapicería y paneles de puerta, y aromatización. 4 a 6 horas según estado y tamaño. Valor estimado con IVA, sujeto a revisión en la recepción.',
       225000, 97, true, false, true
where not exists (select 1 from crm.catalogo where unidad = 'carclass' and codigo = 'detailing_preventa');

update core.parametros set valor = jsonb_set(valor, '{por_codigo,detailing_preventa}', '"https://carclass.cl/servicios/#detailing-pre-venta"')
 where clave = 'carclass.enlaces';

-- core.etapas: aceptar también «compradores» (plural) como flujo de NOM
create or replace function core.etapas(p_unidad text, p_flujo text default null) returns text[]
language sql immutable set search_path = '' as $$
  select case
    when p_unidad in ('blackgps','somosb2b') then array['pre_revision','por_contactar','en_prospeccion','reunion_por_agendar','en_asisma','onboarding']
    when p_unidad = 'carclass' then array['nuevo','calificando','pre_evaluado','cotizado','negociando','agendado','en_taller','entregado']
    when p_unidad = 'carwash'  then array['nuevo','coordinando','agendado','atendido']
    when p_unidad = 'nom' and p_flujo in ('comprador','compradores') then array['nuevo','calificando','presentado','visita_agendada','negociando','reservado','entregado']
    when p_unidad = 'nom' and p_flujo = 'compra_directa' then array['nuevo','calificando','tasado','oferta_enviada','aceptada','inspeccionado','comprado']
    when p_unidad = 'nom' then array['nuevo','calificando','revision_agendada','revisado','propuesta','contrato_firmado','publicado','negociando']
    else array['nuevo','en_curso'] end
$$;
