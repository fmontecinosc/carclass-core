# Procesos comerciales — Carclass Group · v2.4 (21 nov 2026)

> Fuente de verdad del proceso comercial del grupo, de la captación a la recompra. Reemplaza los procesos de Drive 2025, Notion, Kommo y los HTML de chats anteriores. Estas 11 fichas son las que devuelve la herramienta MCP `procesos` (tabla `ops.sops`, `tipo = 'proceso'`) y la sección «Procesos y ayuda» de Core. Orden de prioridad: grupo → BlackGPS → Carclass → NOM → Carwash.hf.
>
> Base: documento «Procesos Carclass Group v2.4» de Felipe (decisiones del 20 nov 2026). Donde un chat posterior ya había actualizado Core (comisión NOM, fee NOM en la visita, meta de 20 llamadas BlackGPS), manda Core y así quedó escrito aquí. Los valores vivos están en `core.parametros`; si difieren de este texto, manda `core.parametros`.
>
> Montos en CLP con IVA incluido.

### 1. Principios del proceso comercial · unidad: grupo

- Orden de prioridad del grupo: 1) BlackGPS, 2) Carclass, 3) NOM, 4) Carwash.hf. Se usa en comunicación, perfiles y en este mapa.
- Canales: un WhatsApp Business verificado (API oficial en coexistencia) para BlackGPS, Carclass y NOM (+56 9 8670 4745). Carwash.hf tiene número y agente propios (+56 9 4619 6226). Todo lead de Meta, Google, landing o referido termina en WhatsApp y nace en Core en ese momento.
- Setter y closer son roles distintos. El setter (agente IA) responde, califica y agenda. El closer cotiza, negocia y cierra. El setter nunca da precio fuera de lista ni negocia.
- Primera respuesta en menos de 5 minutos, a toda hora.
- Toda oportunidad abierta tiene próxima acción y fecha.
- El dato vive en Core. En BlackGPS, Asisma es el CRM oficial desde la reunión en adelante.
- Cross-sell estructural: comprador NOM → protección Carclass; cliente Carclass que vende su auto → Detailing Pre-Venta + NOM; flota BlackGPS → Carwash.hf o Carclass flotas.
- Motivos de pérdida (lista fija): precio, competencia, sin respuesta tras cotización, fuera de zona, no califica, desistió, datos erróneos, otro.
- Montos en CLP con IVA incluido. Ninguna venta ni costo se registra sin confirmación de Felipe.

Roles:
- Setter IA: agente Claude + WhatsApp + Core.
- Closer BlackGPS: Felipe.
- Closer Carclass: Felipe, Stephanie, Jorge.
- Closer NOM: Bryan, Felipe.
- Closer Carwash.hf: Felipe (cierra por WhatsApp).
- Operaciones Carclass: Felipe con el partner Hiendcar.
- Operador Carwash.hf: Simón (lavados).
- Analista de prospectos BlackGPS: GPT en ChatGPT (envía a la bandeja de pre-revisión).
- Supervisor: Felipe.

### 2. Entrada común B2C · unidad: grupo

1. Captación: anuncio Meta o Google con destino WhatsApp o landing; la landing termina en WhatsApp. Se guarda origen, campaña y anuncio.
2. Entrada: mensaje al WhatsApp → lead «nuevo» en Core.
3. Enrutamiento: el setter identifica la unidad por el anuncio o preguntando (protección de tu auto, comprar o vender un auto, GPS y control de flota). Carwash.hf entra por su propio número.
4. Calificación: preguntas por unidad, máximo 3 por mensaje.
5. Traspaso al closer con ficha completa y cita agendada.
6. Descarte temprano con motivo de la lista fija.

### 3. Setter IA en WhatsApp · unidad: grupo

Alcance por unidad:
- Carclass: activo (asesor Carclass). Proceso completo de sellado cerámico, láminas de seguridad y PPF hasta la reserva. Arma la cotización con el catálogo vigente. Pintura y desabolladura las evalúa un humano.
- NOM: por sumar como setter (consignantes y compradores).
- BlackGPS: primero indaga el negocio y la operación del cliente (a qué se dedica, cómo opera) y luego el volumen de flota. Solo arma borradores de cotización para aprobación de Felipe.
- Carwash.hf: agente propio en otro número; se arma después del asesor Carclass. Mientras tanto lo atiende Felipe.

Hace: responde en menos de 5 min, identifica la unidad, califica, pide fotos y datos, propone horarios, registra en Core y avisa al closer con la ficha lista.

No hace: precios fuera de la lista aprobada, negociar, prometer plazos o garantías fuera de lo escrito, aceptar autos en NOM, cerrar ventas, enviar correos.

Pasa a humano de inmediato: el cliente lo pide, quiere pagar o pide descuento, reclamo o daño, negociación de precio, lead de alto valor (auto de colección o PPF completo en Carclass, auto sobre $35 MM en NOM).

Requisito técnico: los seguimientos fuera de la ventana de 24 h requieren plantillas aprobadas.

KPIs: primera respuesta < 5 min · calificado→cita > 40% (Carclass, NOM) · cotizado→ganado > 35% (Carclass) · 3 reuniones BlackGPS al día · rotación de consignación < 45 días · costo por lead y por venta por campaña.

### 4. Flujo comercial BlackGPS B2B · unidad: blackgps

Etapas: pre_revision → por_contactar → en_prospeccion → reunion_por_agendar → en_asisma → onboarding → cartera.

- Origen de leads: (a) empresas analizadas en ChatGPT → bandeja de pre-revisión; (b) formulario de la landing BlackGPS (carclass.cl/black-gps): hoy llega al correo de BlackGPS, en integración para crear el lead en Core; (c) rueda de Asisma.
- Pre-revisión: el GPT envía ficha, decisor y análisis; Felipe aprueba o descarta.
- Prospección: 5 minutos de investigación antes de cada llamada (empresa, persona, trayectoria). Cadencia día 0, 2, 5 y 10 (llamada y WhatsApp). El objetivo es la reunión presencial, no la venta. Se tutea. Solo cifras autorizadas, sin redondear hacia arriba.
- Meta diaria: 20 llamadas y 3 reuniones agendadas en Google Calendar (meta vigente en Core, `core.metas`).
- Enfoque: el problema del cliente según industria y tamaño, resuelto con uno de tres pilares: software, conectividad multioperador o hardware. Nunca abrir con el producto.
- La landing ofrece una demo gratuita y una reunión breve para conocer la operación, el tamaño de la flota y los desafíos. La demo se hace en esa reunión.
- Reunión por agendar → ficha para Asisma → en Asisma. Desde ahí manda Asisma; Core se actualiza con la exportación semanal.
- Leads de la rueda de Asisma: aceptar en menos de 5 minutos.
- En el «Total inversión inicial» de las cotizaciones de Asisma, el valor va con IVA incluido.
- En documentos a clientes: «plataforma BlackGPS», nunca Mapon (Mapon se mantiene solo en la página de BlackGPS). Las propuestas ejecutivas van en documento, no en láminas.

### 5. Operación BlackGPS: onboarding, facturación y cobranza · unidad: blackgps

Onboarding:
1. Contrato firmado.
2. Coordinación de instalación con el equipo técnico de BlackGPS; si el cliente lo requiere, homologación en concesionario para mantener la garantía de sus vehículos.
3. Alta de la cuenta en la plataforma BlackGPS, enrolamiento de equipos y configuración.
4. Capacitación al equipo del cliente.
5. Paso a cartera.

Facturación mensual (primer día hábil del mes):
1. Cargar la UF del día (el día 1, antes de facturar).
2. Revisar equipos activos en la plataforma (campo «en fact.») y cuadrarlos con la planilla de control de facturación.
3. Preparar las facturas en Maxxa y pedir aprobación de Felipe antes de emitir.
4. Notificar desde Maxxa con copia al correo BlackGPS de Felipe (las notificaciones de Maxxa pueden salir sin preguntar).
5. Registrar las facturas emitidas en Core (no requiere confirmación).

Excepciones de facturación: particulares con PAC Mercado Pago (Renato Muñoz, Daniela Contreras) no se facturan. Grupo Futuro se notifica por correo de Felipe junto con su base de flota actualizada. Las facturas de FUSAT llevan documento de respaldo con los datos del contrato.

Ciclo de cobranza (recomendación del agente de Finanzas):
1. Día 1 hábil: facturas del mes emitidas y notificadas desde Maxxa.
2. Día 20: recordatorio preventivo a todas las facturas del mes que siguen impagas (antes del cierre de nómina de pagos a proveedores, entre el 20 y el 25).
3. Día 25: segundo contacto, por llamada o WhatsApp, a quienes no han pagado ni confirmado fecha. Se cruza antes con la cartola BancoEstado y con Mercado Pago (Bilder paga por ahí).
4. Día 1 siguiente: la factura impaga pasa a vencida y se cobra con la plantilla de Felipe, junto con la facturación del nuevo mes.
5. 5 días después del vencimiento, sin pago ni compromiso: aviso y, previo cruce con el banco, suspensión del cliente en la plataforma.
6. Sin pago tras la suspensión: derivación a CobranzaOnline, como Importaciones Ulloa.

Excepciones de canal: Rigol se cobra por WhatsApp; Grupo Futuro lo gestiona Felipe directamente; Bilder recibe link de pago de Mercado Pago que genera Felipe.

Por validar con el contador: el plazo de pago de cada contrato. El ciclo supone que las facturas vencen a fin del mes en que se emiten.

Correos a clientes: ningún correo se envía sin la confirmación explícita de Felipe (cuenta, destinatarios, copia, asunto y cuerpo). Los correos a clientes los envía Felipe desde su cuenta de SomosB2B; los agentes le dejan el texto listo. Nunca se envían desde la cuenta de BlackGPS.

Costo de licencia al distribuidor: 0,16 UF por equipo, cuadrado con la factura mensual del proveedor.

Cartera: postventa, cobranza, upsell ADAS + DMS y marcas somosB2B.

### 6. Flujo comercial Carclass · unidad: carclass

Etapas: nuevo → calificando → pre_evaluado → cotizado → negociando → agendado → en_taller → entregado (ganada) → postventa.

- Foco: sellado cerámico, PPF y láminas de seguridad. Carclass es «Dealer oficial Hiendcar» e instalador oficial XPEL.
- Calificando (setter): marca, modelo, año, patente, servicio, comuna y urgencia. Pide fotos (no hay diagnóstico presencial gratis).
- Pre-evaluado (closer): define el plan.
  - El PPF nunca se vende solo.
  - La corrección de pintura va incluida en todos los sellados, con distinto nivel: 1 año, corrección intermedia de hasta 80% de los detalles; 4 años, corrección más profunda de hasta 90%; 8 años, corrección detallada en 3 etapas, con máxima corrección y brillo.
  - PPF por defecto: XPEL Gloss. Línea superior: XPEL Ultimate (Ultimate Plus 8); Stealth (mate) solo a pedido. No mezclar dos líneas en la misma propuesta. Shield y Protection Pack se cotizan por modelo (kit frontal Gloss de la planilla Hiendcar + cerámico 4 años [+ láminas 4 micras] − 5%); los montos del catálogo son referencia «desde».
  - Máximo 2 opciones al cliente: la recomendada y una alternativa.
- Cotizado: el agente arma la cotización con el catálogo vigente (cotizador de Core o cotizador de Carclass en Netlify) y genera el PDF; el closer la revisa y se envía por WhatsApp con un mensaje de detalle. El costo partner y el margen quedan registrados internamente, nunca en el PDF del cliente. Formato: cliente · auto · comuna · necesidad → solución recomendada → alternativa → qué incluye → plazo → recepción o retiro → pago → validez 7 días. Sin descuentos agresivos.
- Pago: reserva de $50.000 (se abona al total, no se devuelve; se puede reagendar una vez avisando con 24 h), 50% del total en la recepción y el saldo en la entrega (`core.parametros` carclass.transferencia).
- Negociando: objeciones con argumento de valor (repintado de panel, pérdida de valor de reventa).
- Agendado: reserva por transferencia, comprobante del cliente, fecha, partner y reserva en Google Calendar con el cliente invitado. Se ofrecen 2 fechas concretas.
- Seguimiento automático de cotización: 48 h y 5 días, cada uno con un argumento nuevo; a los 10 días, perdido «sin respuesta tras cotización».
- Postventa: mensaje a las 48 h con cuidados y pedido de reseña en Google; oferta de mantención a los 6 meses.

### 7. Operación Carclass · unidad: carclass

- Proceso de servicio: asesoría (agente o Felipe) → agenda e ingreso → instalación (lavado, preparación, pulido y aplicación) → entrega.
- Recepción de autos: nuestra oficina en Puertas de Chicureo (Av. Puerta Oriente 361, oficina 409B) o el centro de instalación del partner en el complejo Alto Portezuelo (El Juncal 240, Quilicura), de 9:00 a 18:00, con previa coordinación. Con clientes nunca se dice «nuestro taller» ni se menciona NOM.
- Retiro y entrega a domicilio: solo en el sector cercano a Chicureo (Chicureo, Lo Barnechea y alrededores). Sin costo cuando el total cotizado es de $600.000 o más, sea cual sea el servicio; bajo ese total, aprox. $30.000. El agente nunca menciona el monto mínimo.
- Láminas de seguridad XPEL: solo en el local, idealmente junto con otro servicio; se instalan en unas pocas horas (las instala Láminas Maru). Si el cliente pide un tono más oscuro que el legal, se instala avisándole por escrito que queda fuera de norma y puede tener multas o problemas en la revisión técnica.
- Cupos semanales del agente (sujetos a la disponibilidad de Hiendcar): sellado cerámico 2 a 3, PPF frontal 2 a 3, láminas de seguridad 1 a 2 por día.
- En taller: QC de recepción con fotos. Brief a Hiendcar sin datos personales del cliente: código de orden Carclass, auto, color y código de pintura, km, fotos de recepción, servicios exactos (PPF: zonas y film; cerámico: producto; corrección: nivel), fecha de ingreso, fecha comprometida y SLA por escrito. El partner no ofrece servicios adicionales, envía fotos del proceso y factura a Carclass. Se registran el ingreso y el costo del partner en Core.
- Entregado: QC final de 12 puntos con fotos, acta de entrega, cuidados de 48–72 h y saldo → venta ganada.
- Detailing Pre-Venta (valor estimado $225.000, carclass.cl/servicios/#detailing-pre-venta): lavado, descontaminación, pulido abrillantado de un paso, pulido de focos, limpieza interior con tapicería y paneles de puerta, y aromatización; 4 a 6 horas. Se ofrece a todo consignante de NOM.

### 8. Flujo NOM consignantes · unidad: nom

Etapas: nuevo → calificando → revision_agendada → revisado → propuesta → contrato_firmado → publicado → negociando → vendido (ganada) | no_renovado.

- Calificando (setter): marca, modelo, versión, año, km, precio esperado, documentos, prendas y exclusividad. Criterios: 2015 o más nuevo, sin prendas, precio dentro de ±10% del mercado.
- Tasación (Core · Tasaciones NOM): avisos reales verificados, modo conservador (percentil 35, nunca sobre un comparable mejor). Felipe aprueba antes de enviar; el informe nunca muestra datos internos.
- Custodia: el auto queda en manos del dueño durante la consignación. NOM coordina con el dueño las visitas de compradores calificados. Si hace falta, el edificio tiene espacio para guardar 1 auto de un día para otro o de viernes a domingo; se coordina caso a caso.
- Visita de ingreso: oficina NOM, Av. Puerta Oriente 361, oficina 409B, Chicureo. Lunes a viernes de 9:00 a 18:00, previa coordinación; bloques de 2 h a las 10:00 o 15:00. El auto llega lavado, presentable y sin objetos personales, porque con él se hacen las fotos de la publicación.
- Fee de entrada: $50.000 por transferencia, en la visita (sin link de pago por ahora). Cubre la inspección de 6 capas, la publicación, la preparación y las fotos. No se devuelve si el auto no se vende; se descuenta de la comisión al vender.
- Revisión: protocolo de 6 capas y 138 puntos de control, con índice por capa y veredicto. No hay puntaje mínimo: se consigna si el veredicto es APTO.
- Propuesta: 3 comparables, precio de publicación y piso. Comisión vigente en Core (`core.parametros` nom.comision, Felipe 20 nov): bajo $20 MM, 5% del precio con mínimo $500.000; desde $20 MM, el mayor entre $1.000.000 y el 3,5% del precio; con IVA, más el fee de entrada. Contrato con exclusividad de 45 días.
- Contrato: borrador por WhatsApp para revisión y firma (plantilla: Contrato de consignación NOM, borrador base).
- Publicado: fotos, ficha, Chileautos, Yapo, Facebook Marketplace e Instagram.
- Reporte semanal al consignante: lo genera el agente en la herramienta de reportería (reporte-consignacion.netlify.app), con su protocolo de ajuste de precio, y se envía por WhatsApp. Mismo día de la semana para todos los consignantes.
- Nada bajo el piso sin aprobación escrita del consignante.
- Venta: transferencia digital por Autofact. Pago al consignante idealmente dentro de las primeras 24 h; plazo máximo 3 días hábiles.

### 9. Flujo NOM compradores · unidad: nom

Etapas: nuevo → calificando → presentado → visita_agendada → negociando → reservado → entregado (ganada) → postventa.

- Calificando (setter): presupuesto, plazo menor a 30 días, contado o financiamiento, parte de pago.
- Presentado: ficha, fotos, informe de revisión de 6 capas y precio argumentado. Visita y test drive solo para calificados, coordinados con el dueño del auto, que lo tiene en su poder.
- Reserva mínima: $200.000.
- Entrega: transferencia por Autofact, carpeta del vehículo.
- Postventa: 48 h y 15 días; referido $50.000; oferta de protección Carclass.
- Inspección pre compra para terceros: producto aparte (informe de 6 capas y 138 puntos), valor $99.000.
- Compra directa o parte de pago: ver ficha 10.

### 10. NOM compra directa y parte de pago · unidad: nom

Etapas (flujo compra_directa en Core): nuevo → calificando → tasado → oferta_enviada → aceptada → inspeccionado → comprado (ganada). Después: en preparación → publicado, en Vehículos (stock propio).

- Cuándo aplica: (a) el dueño quiere vender ya y prefiere una oferta firme en vez de consignar; (b) un comprador de NOM entrega su auto como parte de pago.
- Calificando (setter): los mismos datos que en consignación (marca, modelo, versión, año, km, documentos, prendas) y el precio esperado. El setter nunca ofrece un precio.
- Tasado: tasación conservadora en Core con avisos reales verificados, descontando costo de regularización y preparación.
- Oferta: siempre escrita y siempre aprobada por Felipe antes de enviarla, porque compromete caja propia.
- Inspeccionado: protocolo de 6 capas y 138 puntos antes de pagar. Si aparece algo no declarado, la oferta se ajusta por escrito o se retira.
- Comprado: transferencia digital por Autofact y pago por transferencia bancaria.
- Parte de pago: el auto recibido se tasa igual que una compra directa y su valor se descuenta del precio del auto que el cliente compra. Solo se cierra junto con la venta del auto NOM.
- Después: el auto entra como stock propio (modalidad compra_directa), pasa por Detailing Pre-Venta y se publica.
- Margen mínimo: entre $1.000.000 y $1.500.000 sobre el precio de compra. Si la tasación no deja ese margen, no se compra.
- Monto de compra: hoy, autos de hasta $8.000.000 a $10.000.000.
- Meta de stock propio: idealmente 2 autos rotando al mismo tiempo.

### 11. Flujo comercial Carwash.hf · unidad: carwash

Etapas: nuevo → coordinando → agendado → atendido (ganada) → recompra.

- Canal: número y agente propios de Carwash.hf (+56 9 4619 6226), aparte del WhatsApp del grupo.
- Estado: operación activa en horario temporal, viernes a domingo de 10:00 a 17:00, máximo 4 autos por día, sujeto a que haya lavador. Se agendan lavados en ese horario; si el día está lleno o el cliente pide otro día, se ofrece el siguiente bloque disponible.
- Coordinando (setter): marca y modelo para definir el tamaño, servicio, día y hora. Cotiza los 4 lavados con el catálogo de abajo; pulido, cerámico, empresas y vans pasan a Felipe.
- Agendado: bloque reservado y recordatorio el día anterior.
- Cierre: lo hace Felipe por WhatsApp.
- Atendido: servicio hecho por el operador (Simón) y pagado → venta ganada.
- Recompra: recordatorio a cada cliente 15 días después de su lavado, más un mensaje de difusión antes de cada fin de semana con los cupos disponibles (12 por semana: 4 por día, viernes a domingo). Los cupos limitados son el argumento: «quedan X horas este sábado».
- La difusión va solo a clientes que aceptaron recibir mensajes. Fuera de la ventana de 24 h de WhatsApp necesita plantilla aprobada.
- Sin cotización formal.

Catálogo Carwash.hf (CLP con IVA). La web carclass.cl/carwash-hf es lo que ve el cliente y manda en lo público. Tamaños: auto o SUV compacto · SUV o pickup mediana · pickup XL o SUV 7 asientos. El tamaño se define por marca y modelo.

Lavados con precio (el setter cotiza solo):
- Básico: $15.000 / $20.000 / $25.000. Lavado exterior, vidrios, neumáticos y plásticos hidratados.
- Boutique (el más pedido): $30.000 / $35.000 / $40.000. Exterior, llantas y guardafangos, aspirado y limpieza interior, neumáticos y plásticos hidratados; cerca de 1 h 30 min según el estado del auto.
- Técnico: $60.000 / $75.000 / $90.000. Todo el Boutique + descontaminación de pintura + encerado + plásticos interiores hidratados.
- Interior + tapiz: $125.000 / $155.000 / $175.000. Tapices de techo, alfombras, asientos y maleta; tablero, puertas y maleta; lavado exterior de cortesía.

La web publica cada lavado «desde» el precio del tamaño mediano ($20.000, $35.000, $75.000, $155.000). Los precios del tamaño compacto también están vigentes (Felipe, 21 nov 2026).

Sin precio publicado (se cotiza por WhatsApp; lo hace Felipe): pulido y sellado cerámico; empresas (lavado programado para camionetas de faena, vans de pasajeros y vehículos corporativos); vans, furgones y minibuses.

Reglas: atención solo con hora agendada por WhatsApp; la hora se confirma el día anterior. Sin descuentos, planes ni paquetes no escritos. No se mezclan precios, garantías ni XPEL de Carclass con Carwash.hf. Sin servicio a domicilio.
