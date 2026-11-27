# Carclass Core — documento de traspaso para Claude Code

> Léelo completo antes de tocar código. Resume todo lo decidido con Felipe entre el 31 de octubre y el 5 de noviembre de 2026 en la conversación donde se diseñó y construyó Core. Si algo aquí contradice una instrucción nueva de Felipe, manda Felipe.

## 1. Qué es Carclass Core

El CRM y sistema de gestión propio del grupo empresarial **Carclass Group** (Felipe Montecinos, CEO y operador único, Huertos Familiares, Tiltil). Una base única para pipeline, leads, clientes, vehículos, agenda, cotizaciones, ventas, costos, márgenes y tareas, conectada por API y MCP a Claude, ChatGPT, WhatsApp y las webs.

**Unidades de negocio**

| Unidad | Modelo | Clientes | Notas |
|---|---|---|---|
| BlackGPS | B2B | Empresas con flota | Felipe es franquiciado. **Asisma** es el CRM oficial de la franquicia desde la reunión en adelante; Core preselecciona. |
| somosB2B | B2B | Empresas | Venta complementaria de marcas (SmartReport, SimpliRoute, Prime Seguros, Mirox, Prana, Salfasur). |
| Carclass | B2C | Personas | Sellado cerámico, láminas de seguridad, PPF XPEL, detailing, pintura. Modelo broker: el trabajo lo hace el partner **Hiendcar**. |
| Carwash.hf | B2C | Personas | Lavado local en Huertos Familiares. Sin cotización formal. Capacidad 4 autos al día. |
| NOM (Nor-Oriente Motors) | B2C | Personas | Consignación de autos premium. Dos flujos: **consignantes** (prioridad) y **compradores**. Compra directa sin flujo propio. |

**Regla de oro B2C:** los leads de Carclass y NOM llegan por campañas de Meta y Google y terminan en el **WhatsApp único del grupo (+56 9 8670 4745)**. **Carwash.hf tiene su propio número y WhatsApp (+56 9 4619 6226)** y su catálogo de WhatsApp Business es la lista oficial de precios. El marketing de Meta irá directo a WhatsApp (la landing no convirtió).

## 2. Usuarios y roles

- **Felipe**: dueño, ve todo, incluidas finanzas. Por ahora **es el único usuario**; no crear otros hasta que lo pida.
- Futuros (no crear aún): Stephanie y Jorge (comercial y operación de Carclass y Carwash.hf), Bryan (ejecutivo freelance NOM). Nadie más que Felipe ve finanzas.
- Agentes de Claude: acceso completo vía conector MCP. Las escrituras financieras siempre requieren confirmación explícita de Felipe.

## 3. Infraestructura actual

| Pieza | Dónde | Estado |
|---|---|---|
| Base de datos | Supabase, proyecto **carclass-group** (`tvjpwwwnpchecolcsnxp`, sa-east-1) | En producción |
| Esquemas | `core` (usuarios, claves API, eventos de auditoría, SOPs/vistas), `crm` (empresas, contactos, analisis, oportunidades, actividades, cotizaciones), `fin` (ventas, costos), `ops` (contratos_gps, cierres_mensuales, vehiculos, proyectos, tareas, sops) | |
| Lógica de negocio | Funciones SQL `core.api_*` (para la API) y `public.app_*` (para la app web, con RLS por rol) | |
| API | Edge Function **core-api** (Deno). REST para ChatGPT y formularios, MCP para Claude, endpoint `/lead-web` para formularios públicos | v1.1.0 en producción |
| App web | **Cloudflare Pages**, proyecto **carclass-core** (cuenta `1f79658975d74e5e9f2b7b6a96bc0107`, carclass-core.pages.dev) conectado a GitHub (`main`, salida `app`, sin build): **se publica solo con cada push a `main`** → **https://app.carclass.cl** (desde el 21-nov). El sitio Netlify `deb7fddb-…` quedó de respaldo sin tráfico (se agotaron los créditos de Netlify) | v2.10.4. v1 respaldada en `app-v1/` |
| Herramientas externas | Netlify: **cotizador-carclass** (`e5290aca-…`, PDF cotización → ingreso → acta, no guarda datos) y **nom-inspeccion** (`c71b83a5-…`, inspección IPC; guarda en `public.nom_inspecciones`) | Enlazadas desde Core (Catálogo → Herramientas). Subidas a mano, sin repositorio |
| Dominio | `app.carclass.cl` → CNAME `carclass-core.pages.dev` (TTL 300; DNS en Premium Hosting/cPanel). El 21-nov se eliminaron el A `75.2.60.5` (Netlify) y el TXT SPF del subdominio. Volver a Netlify: borrar el CNAME y recrear el A a 75.2.60.5. El panel antiguo se retiró sin respaldo (Felipe 17-nov); su playbook comercial quedó en Core (`core_v30`) | Cloudflare activo con SSL 21-nov |
| Proyecto antiguo | Supabase `blackgps-comercial` (`jacsosgucokqwmwqqjij`): ya migrado a Core, queda de solo lectura | |
| Tablas antiguas | `public.*` de carclass-group (car_ventas, gps_contratos, leads, movimientos, nom_*…): intactas, fuente histórica. La app nueva NO las usa | |

**Historial de migraciones:** vive en Supabase (`supabase_migrations.schema_migrations`, migraciones `core_v1_*` a `core_v4_*`). Bájalo con `supabase link --project-ref tvjpwwwnpchecolcsnxp` y `supabase migration fetch` para tenerlo en `supabase/migrations/`.

**Claves** (en `.secrets/`, nunca al repositorio): conector MCP de Claude (permiso `*`), GPT analista (solo `buscar_empresa` y `registrar_analisis`), landing BlackGPS (solo `lead_web:blackgps`). En la base solo se guarda el hash SHA-256 (`core.api_claves`).

## 4. Reglas del negocio que el código debe respetar

- **Montos en CLP con IVA incluido.** El neto se calcula (`monto_neto` generado, `afecto_iva` por registro).
- **Venta** = venta cerrada por su monto real. **Margen** = venta − costos asociados (`fin.costos` con `venta_id`). Venta cerrada ≠ venta cobrada (`estado_cobro`).
- **Empresas** se deduplican por RUT normalizado y nombre normalizado; **personas B2C** por teléfono normalizado (últimos 9 dígitos).
- **Toda oportunidad abierta tiene próxima acción y fecha** (exigido en la API; los 575 prospectos migrados de BlackGPS no tienen fecha y aparecen como «sin fecha»).
- **Etapas oficiales** = `core.etapas(unidad, flujo)`; son las del mapa de procesos (`docs/procesos-comerciales.md`, también en `ops.sops` y en la herramienta MCP `procesos`).
- **Motivos de pérdida, lista fija:** precio, competencia, sin_respuesta, fuera_zona, no_califica, desistio, datos_erroneos, duplicado, otro.
- **Auditoría:** cada cambio queda en `core.eventos` con autor (`core.autor()`).
- Los análisis del GPT de BlackGPS caen en etapa `pre_revision` (bandeja que Felipe aprueba o descarta).
- Leads web y de WhatsApp: `core.api_registrar_lead` (B2C → `nuevo`; BlackGPS → `por_contactar`). Se mide `primera_respuesta_en` para el SLA de 5 minutos.
- **Stock NOM vigente (Felipe 22-nov):** Toyota Corolla Cross (TDCG37, se mantiene publicado en $17.490.000) y Opel Astra GTC 2016 (en stock, pero requiere frenos, detailing y posiblemente parabrisas antes de mostrarse; tarea creada). La Outlander se retiró el 18-nov. La web muestra otros autos para no verse vacía: el asesor dice que ya se vendieron.
- **Asesor NOM en «activo» (Felipe 22-nov).** BlackGPS sigue en «borrador»: el asesor de BlackGPS es asistente de Felipe, no envía mensajes ni cotizaciones; propone respuestas, seguimientos y postventa para acelerar el trabajo.
- **Cotizaciones BlackGPS (Felipe 22-nov):** Core puede cotizar BlackGPS; probablemente con el cotizador que diseñó Felipe (cotizador-black), porque el de Asisma confunde a los clientes. Pendiente de construir.
- **Usuarios por unidad (`core_v69`):** Conversaciones, fichas y oportunidades filtran por `core.puede(unidad)`; chats sin unidad, contactos y «personal» solo para el dueño; las tablas antiguas `public.*` son solo del dueño. Probado con un usuario ficticio de Carwash.hf (ve 1 de 22 conversaciones, 0 ventas, no edita Carclass). Roles válidos hoy: `dueno`, `operador`, `ejecutivo`.
- **Direcciones ante clientes (Felipe 20-nov):** oficina «Av. Puerta Oriente 361, oficina 409B, Chicureo»; taller «complejo industrial Alto Portezuelo, en Quilicura» (El Juncal 240, bodega 16; Felipe 20-nov: se nombra el complejo primero y luego la comuna); la calle y bodega exactas al confirmar la reserva.
- **Retiro a domicilio Carclass (Felipe 20-nov, `core_v44`):** sin costo extra solo en Chicureo y Lo Barnechea y solo para ventas con PPF desde $600.000; ahí el asesor puede decir «sin costo extra». **La condición es interna, no se menciona.** Otros servicios en la zona u otras zonas: se ofrece igual, sin hablar de costo, y se traspasa para confirmar según distancia.
- **Asesor de WhatsApp:** fuente única en este repo (`supabase/functions/wa-agente`, `prompts/asesor-sistema.md`); el simulador vive en la misma función (`/wa-agente/simular`, prompt de prueba en `wa.config.agente_prompt_prueba`). Webs y mensajes de entrada en `docs/webs-asesor.md`.
- **Al cliente, documentos PDF (Felipe 21-nov):** cotizaciones, PPF por modelo e informes de tasación se envían como PDF por WhatsApp, nunca como link.

## 5. Estado de los datos (5-nov-2026)

761 empresas (91 desde el 10-nov, ver v19 y v20) · 575 prospectos BlackGPS por contactar (eliminados en v19) · 27 leads abiertos en Asisma (importados de su CSV, con `asisma_id`) · ventas: BlackGPS hasta julio por facturas + 8 pedidos de hardware Asisma (sep–oct), Carclass hasta junio, NOM una comisión. **Faltan:** facturas de licencias BlackGPS desde agosto, costos BlackGPS desde junio, ventas Carclass desde julio. Los pedidos de hardware de Asisma se venden a costo y dos dan margen negativo (Bugueño PED-002420, Fundación El Teniente PED-002184): pendiente que Felipe explique.

## 6. Lo que hay que construir ahora (Fase 3, prioridad de Felipe)

### 6.1 App web completa, estilo Asisma
Referencia: Asisma CRM (asismacrm.dyndns.info). Felipe quiere el diseño **lo más parecido posible a Asisma** en login, onboarding y navegación, **con verde Rolex `#006039` en lugar del azul y dorado `#A37E2C` en acentos**. Modo claro por defecto y oscuro opcional. Tipografía tipo Plus Jakarta Sans. Logo: `assets/logo-carclass.png`. Inspirarse en la estructura y patrones de Asisma; no copiar su código ni su marca.

Patrones de Asisma a replicar:
- Login partido: panel de marca a la izquierda (titular, tres beneficios con check), formulario a la derecha, «Recordar dispositivo», «¿Olvidaste tu contraseña?».
- Menú lateral por secciones con encabezados en versalitas: Análisis, Comercial, Catálogo, Organización, Post-venta, Ayuda. Botón verde «Activar avisos en este dispositivo» bajo el logo. Usuario y «Salir» al pie.
- Barra superior: nombre de la organización / sección, botón «Nuevo lead», tema claro/oscuro, campanita.
- Dashboard: filtro de rango de fechas; tarjetas de KPI (leads totales, tasa de conversión, respuesta promedio, ventas pagadas); barras de leads por etapa del embudo y por origen/canal; evolución mensual (leads creados vs ganados); exportar CSV.
- Embudo automático: actividad → avanza etapa, nunca retrocede solo; arrastre en kanban.
- Ficha con bitácora (nota, llamada, correo, reunión, adjuntos) y eventos del sistema.
- Agenda día/semana/mes que propone actividades sola (llamar tras cotizar, retomar detenidos, contacto mensual).
- Cotización con banda de precio, PDF, link público y estado «vista».
- Venta cerrada separada de cobrada. Motivos de pérdida fijos.
- Permisos por módulo y rol.

Módulos:

| Sección | Módulo | Contenido |
|---|---|---|
| Análisis | Dashboard | KPIs por unidad, SLA de primera respuesta, embudo, canales y campañas, evolución mensual |
| | Notificaciones | Centro de avisos |
| Comercial | Bandeja | Entrantes con reloj de minutos sin respuesta; pre-revisión de análisis del GPT |
| | Conversaciones | Chats de WhatsApp en la app: quién atiende (asesor IA o humano), botón «Tomar conversación» y «Devolver al asesor» |
| | Embudo | Kanban por unidad y flujo (NOM consignantes y compradores separados) |
| | Agenda | Calendario sincronizado en **ambos sentidos con Google Calendar** de Felipe |
| | Cotizaciones | Carclass y BlackGPS, banda de precio, PDF, link público, «vista» |
| | Clientes | Personas y empresas, ficha 360 |
| Operación | Vehículos | Stock NOM (inspección, reporte al consignante) y autos de clientes Carclass |
| | Tareas y Postventa | Seguimientos automáticos (48 h, 5 días, 30 días, 6 meses) |
| Finanzas | Ventas y márgenes | Solo dueño |
| Organización | Equipo | Usuarios, roles, permisos por módulo |

App instalable (PWA) con **notificaciones push** al teléfono y computador (en iPhone requiere instalarla en la pantalla de inicio). Avisos aprobados por Felipe: lead nuevo · lead sin respuesta a los 5 minutos · cliente pide hablar con una persona · cotización vista · reunión en 1 hora.

### 6.2 WhatsApp + asesor Carclass como agente autónomo
- Número único con **WhatsApp Business verificado**. Conectar por **WhatsApp Cloud API en modo coexistencia** (Felipe sigue usando la app en su teléfono). Webhook → core-api: guardar mensajes, crear lead con `api_registrar_lead`, alimentar Conversaciones.
- El asesor responde **las 24 horas, también fuera de horario**. Debe correr por la **API de Anthropic** desde una Edge Function (Felipe aún **no tiene cuenta de API**: primer paso). Sus instrucciones base están en la skill `asesor-carclass` de Felipe; convertirlas en el prompt del agente y darle herramientas de Core.
- Alcance del asesor:
  - **Carclass, proceso completo para sellado cerámico, láminas de seguridad y PPF:** diagnosticar, recomendar, informar valores específicos o aproximados de la lista aprobada, pedir **abono de reserva por transferencia**, recibir el **comprobante** del cliente, y **agendar la reserva en Google Calendar con el correo del cliente como invitado**. Puede ofrecer **retiro a domicilio**, prioritario en **Chicureo, Lo Barnechea y Las Condes**.
  - **Pintura y desabolladura: los gestiona un humano** (hay que evaluar fotos y cotizar con el especialista). El asesor recibe fotos y datos y traspasa.
  - **Setter de NOM:** calificar consignantes y compradores según `docs/procesos-comerciales.md` y agendar con el closer. No tasa ni acepta autos.
  - Traspaso a humano: si el cliente lo pide, reclamo, negociación de precio fuera de política, pintura.
- Política de Meta (2026): prohíbe chatbots de IA de uso general en WhatsApp Business; los asistentes propios de un negocio están permitidos. El asesor debe hablar solo de los servicios del grupo.

### 6.3 Web y formularios
- **carclass.cl** (Netlify, sitio `spectacular-fox-4802ec`): botón de WhatsApp con la campaña de origen en el mensaje prellenado; sin formulario.
- **Landing BlackGPS** (WordPress + formulario **Elementor**): hoy envía un correo a Felipe. Agregar la acción **Webhook** del formulario Elementor apuntando a `/core-api/lead-web` con la clave de landing (ver `.secrets/formulario-landing-blackgps.md`). Mapear nombres de campos a `nombre, empresa, telefono, email, flota, mensaje`.

### 6.4 Respaldo en Drive
Felipe guarda los documentos y la base del negocio en su Drive (fmontecinos@carclass.cl), carpeta **«Directorio Carclass Group»**. Supabase es la fuente de verdad; Drive guarda respaldos legibles. Los agentes y sus tareas programadas viven en el proyecto de Claude «Directorio Carclass Group».

## 6.5 Estado de la Fase 3 al 5-nov-2026

**Hecho (app v2.0.0 en `app/`):**
- Login partido con «Recordar dispositivo» (sesión en localStorage o sessionStorage) y recuperación de contraseña. Onboarding de 3 pasos en el primer ingreso (`cc_onb_v2`).
- Menú lateral por secciones (Análisis, Comercial, Catálogo, Post-venta, Finanzas, Organización, Ayuda), botón «Activar avisos», usuario y «Salir». Barra superior con buscador, «Nuevo lead», tema claro/oscuro y campanita.
- Módulos: Dashboard (rango de fechas, unidad, KPIs, embudo, canales y campañas, evolución mensual, SLA, CSV), Notificaciones, Bandeja (reloj, pre-revisión GPT), Conversaciones (vista previa, sin WhatsApp aún), Embudo (kanban por unidad y flujo, arrastre, zonas Ganada/Perdida con motivos fijos), Agenda (día/semana/mes, atrasadas, sugerencias), Cotizaciones (lista), Clientes y Ficha 360 con bitácora, Vehículos, Tareas y postventa, Ventas y márgenes, Equipo (matriz de permisos), Ayuda (procesos).
- PWA: `manifest.webmanifest`, `sw.js` (caché del cascarón, clic en avisos, listo para push). supabase-js va incluido en `app/vendor/` (sin CDN).
- Avisos locales (app abierta o en segundo plano): lead nuevo y lead sin respuesta a los 5 min, sondeo cada 60 s.
- Base: migraciones `core_v5_app_fase3` (app_dashboard2, app_leads, app_bandeja, app_revisar_lead, app_registrar_lead, app_cerrar, app_embudo, app_ficha, app_agenda, app_vehiculos, app_cotizaciones) y `core_v5_app_fase3_soporte` (trigger `postventa_auto` que crea seguimientos de 48 h, 5 días, 30 días y 6 meses al ganar en Carclass y Carwash.hf, y de 48 h y 30 días en NOM; app_sugerencias, app_procesos, app_equipo).

**v2.1.0 (5-nov, tarde) · líneas de negocio diferenciadas:**
- Decisión de Felipe: Core gestiona **completo** Carclass, NOM y Carwash.hf (comercial, cartera, ventas, finanzas, administración, postventa). **BlackGPS solo como setter**: pre-revisión → prospección → reunión → botón «Pasar a Asisma». Desde ahí cotización, venta, pedidos y soporte viven en Asisma; Core guarda copia de cartera/ventas/MRR para cierres de mes. No hay cotizador BlackGPS en Core.
- Selector de línea en la barra superior (`cc_linea`, `data-linea` en `<html>` tiñe la app con el color de la unidad) y filtro en Bandeja, Embudo, Agenda, Tareas, Cotizaciones y Conversaciones. Orden (Felipe 20-nov, prioridad del Cerebro): BlackGPS, Carclass, NOM, Carwash.hf.
- Dashboard Grupo con una tarjeta por línea (meta de diciembre, 4 indicadores, alertas). Dashboard por línea: Carclass (venta vs $6 MM, margen, mezcla de servicios, cotizaciones sin seguimiento 48 h), NOM (ventas vs 2/mes, stock con días e inspección IPC, embudos consignantes y compradores), Carwash.hf (ocupación vs 4 autos/día, recompra), BlackGPS (llamadas vs 30, reuniones vs 3, concentración de cartera, clientes en riesgo).
- Cotizador Carclass y Carwash.hf (`crm.catalogo`, precios abril 2026 del Cerebro), banda de precio (`descuento_max_pct`, hoy 0%), PDF por impresión, link público `#/c/<token>` (`public.cotizacion_publica`, anon) que marca «vista» y avisa. Al enviar, la oportunidad pasa a «Cotizado» con seguimiento a 48 h.
- Formulario de lead con campos por unidad (auto y servicio en Carclass; auto, km, precio y documentos en NOM consignante; presupuesto y pago en comprador; vehículo y fecha en Carwash.hf; empresa y flota en BlackGPS).
- Metas en `core.metas` (editables por el dueño). Migraciones `core_v6_metas_catalogo_cotizador` y `core_v6_resumen_lineas` (`app_lineas`).
- Probado de punta a punta en una transacción revertida: lead → cotización enviada → vista por link → ganada → 4 tareas de postventa.

**v2.2.0 (5-nov, noche) · control financiero del grupo:**
- Terminología: Carclass Group es un **grupo empresarial**, no un holding. En la interfaz se dice «Grupo».
- Finanzas (solo `core.ve_finanzas()`: dueño o un futuro rol de administrador de finanzas): Resultados (EERR por mes, trimestre, semestre o año, neto o con IVA, por unidad), Flujo de caja (base caja, saldo inicial por cuentas, por cobrar con antigüedad, por pagar), Registro (ventas, costos, gastos, movimientos y cuentas) e Importar (CSV con mapeo de columnas y mensualidades BlackGPS desde contratos). Exporta CSV y PDF.
- Migraciones `core_v7_finanzas_eerr_flujo` (fecha de cobro y de pago, `fin.cuentas`, `fin.movimientos`, app_eerr, app_flujo, app_fin_*) y `core_v8_catalogo_completo_parametros` (13 servicios Carclass con costo de referencia, 5% de descuento sin aprobación, retiro sin costo en Chicureo, Las Condes y Lo Barnechea, comisión NOM en `core.parametros`).
- BlackGPS en finanzas: todas sus ventas (equipos, instalación, mensualidades) viven en `fin.ventas`. Desde noviembre factura el asistente de finanzas; Asisma prepara un módulo de facturación que podría reemplazarlo.
- Comisión NOM (**definitiva, Felipe 20-nov, tras revisar el mercado**): precio de venta bajo $20 MM → 5% del precio (mínimo $500.000); desde $20 MM → el mayor entre $1.000.000 y el 3,5% del precio; con IVA (`core.parametros['nom.comision']`, función `nom.comision(precio)`, `core_v43`: $15 MM → $750.000 · $20 MM → $1.000.000 · $30 MM → $1.050.000 · $40 MM → $1.400.000). Mercado: VP Motors y Mi Auto Garantizado 5% + IVA, MrCar 4,5% + IVA, Tradecars 4%. Los $50.000 iniciales se presentan al cliente como «servicio de inicio» (inspección, fotos y publicación), descontable de la comisión; «no reembolsable» queda en el contrato. Reemplaza el «4% mínimo $150.000» del mapa de procesos y el rango 3–5%. Visita en Chicureo: 2 h, bloques 10:00 y 15:00, lun–vie (`nom.oficina`). Mercado Pago: por API con access token (Felipe 18-nov), pendiente el token. Fee de entrada $50.000 al agendar (transferencia o link Mercado Pago), no reembolsable, descontable de la comisión.
- Drive: carpeta «Base financiera Carclass Group» (id `18Ul7zo4X4dw_S4zrQOeaVRPtbOnXrpgK`) dentro de «Directorio Carclass Group», con Ventas 2026, Costos y gastos 2026, EERR 2026, Flujo de caja 2026, Contratos BlackGPS y Gastos fijos (plantilla). Es copia: la fuente de verdad es Core.

**v2.3.0 (5-nov) · Carwash.hf:**
- Catálogo Carwash.hf en `crm.catalogo` (7 servicios × 3 tamaños, códigos `<slug>_t1..t3`, precios «desde», sin descuentos) y `core.parametros['carwash.negocio']` (dirección, horario lun–sáb 9–17, capacidad 4/día, tramos). Detalle y reglas en `docs/carwash-hf.md`.
- Reclasificación (Felipe 5-nov): los lavados boutique y los clientes Gonzalo Cabello, Gisselle Salfate, Genesis Berrios, Thalia Rojo, Manuel Trem, Rodrigo, Millaray, Thermo Energía SpA, Globaltec, Jhonatan Barrera y Piloansa son de Carwash.hf. Cargadas las 4 ventas de septiembre 2026 (planilla COSTO UTILIDAD SERVICIOS 2026; fecha 30-sep por falta de fecha en la planilla). Migración `core_v9_carwash_reclasificacion_catalogo`.
- Repositorio: https://github.com/fmontecinosc/carclass-core (rama `main`).
- Tarea programada «Renovar base financiera en Drive» (`trig_01SH1NqB2HBzxPfxvH34droo`), lunes 7:17 hora de Chile: crea copias nuevas de las planillas en la carpeta de Drive y manda las anteriores a la papelera. Necesita los conectores Supabase y Google Drive agregados desde claude.ai.

**v2.4.0 (5-nov) · herramientas y Carwash.hf:**
- Sección Catálogo → Herramientas: accesos al cotizador Carclass y a la inspección IPC, y lista de las últimas inspecciones (`public.app_inspecciones`, lee `public.nom_inspecciones`). Botones «Nueva inspección IPC» en Vehículos y en oportunidades NOM consignante (calificando, revisión agendada, revisado), y «Cotizador clásico» en Cotizaciones.
- WhatsApp por unidad en `core.parametros['whatsapp.unidades']`; el link público de cotizaciones de Carwash.hf responde al +56 9 4619 6226. Catálogo Carwash.hf = lista oficial (precios «desde»). Migración `core_v10_herramientas_inspecciones_carwash_whatsapp`.
- Las inspecciones IPC registran un valor de servicio de $99.000 con estado de pago (desde v2.5 entran a finanzas al pagarse).
- Drive renovado a mano el 5-nov con la reclasificación de Carwash.hf.

**v2.5.0 (5-nov) · inspecciones IPC en la app y como venta NOM:**
- Decisión de Felipe: las inspecciones IPC son ingreso de NOM (servicio a terceros, se espera venderlo desde 2027). `core.sync_inspecciones_ipc()` corre cada hora con pg_cron (`nom_ipc_a_ventas`, minuto 23): toda inspección con `estado_pago` pagado/cobrado y `valor_servicio > 0` entra a `fin.ventas` (unidad nom, modalidad `inspeccion`, documento = folio, origen `ipc`), sin duplicar. Las «Exento (cliente NOM)» no entran. Catálogo NOM `inspeccion_ipc` $99.000.
- `ventas_modalidad_check` ahora admite `inspeccion` y `compraventa`.
- Catálogo → Herramientas muestra el resumen mensual (`public.nom_inspecciones_mensual`), el histórico completo con buscador y filtro por veredicto, y el detalle de cada inspección (datos del auto, precios, puntos observados por sección con costo, fotos bajo demanda). RPC de solo lectura: `app_inspecciones(limite, q)` → `{filas, mensual}`, `app_inspeccion(id)`, `app_inspeccion_fotos(id)`. Montos del servicio solo para quien ve finanzas. Migraciones `core_v11_inspecciones_ipc_como_venta_nom` y `core_v12_inspecciones_historico_y_modalidades`.
- Los nombres de cada punto del checklist viven en el código de nom-inspeccion (no en la base); Core los muestra como «Sección N, punto M» con la nota del técnico. Si se sube ese código al repo, se pueden mostrar los nombres.

**Cruce con planilla «CARCLASS - FORMATO PLANTILLA INGRESOS Y GASTOS» (5-nov, aprobado por Felipe):**
- Cargada la historia 2024 (un total anual al 31-dic) y 2025 (totales mensuales por línea) con `origen = 'planilla_ig'`: ventas, costos directos, gastos y, en `fin.movimientos` (documento `planilla_ig`), retiros del dueño, pagos de IVA F29, préstamo de $5 MM (abr-2025) y aportes de capital NOM ($4 MM may y $16,08 MM jun-2026). 2025 no separa Carwash.hf de Carclass. Migración `core_v13_planilla_ingresos_gastos`.
- 2026: mensualidades BlackGPS de agosto ($4.161.995) y septiembre ($3.811.719 + $289.023 «diferencia por identificar» entre la hoja BlackGPS y la consolidada; no es neto/bruto), comisión NOM marzo $750.000, gastos de NOM (mentoría Taller SOS, arriendo Skalo, estacionamiento 101), transporte, ChatGPT e internet. Junio y julio BlackGPS quedan con las facturas de Core (la planilla dice $119.440 y $63.761 más).
- NOM compraventa VW Amarok: venta $17 MM (ago) con costos ligados (compra $15,7 MM, transferencia, garantía leasing), registrados en el mes de la venta y pagados en junio. Se eliminó la «comisión» de $1 MM del 20-sep que duplicaba la operación (`core_v14`, `core_v15`).
- Los 5 folios de ~$1,6 MM de Sociedad Comercializadora DH (ene–may 2026) eran licencia + administración de la franquicia, no equipos: categoría `licencia_franquicia`.
- Drive renovado: Ventas 2024–2026, Costos y gastos 2024–2026, EERR 2025, EERR 2026, Flujo 2025, Flujo 2026.
- **Recordar a Felipe:** el Cerebro dice que Carclass facturó ≈ $52,3 MM en 2025 y la planilla dice $39,2 MM. Según Felipe, COSTO UTILIDAD solo trae B2C; hay que cruzar con las facturas 2025 (que mezclan Carclass y BlackGPS). Por ahora manda el Cerebro como referencia y Core queda con la planilla.
- Puntos resueltos en v17 (10-nov): dic-2025 BlackGPS pasa a mensualidades + administrativos; ene-2026 queda como la planilla; octubre cargado desde las facturas; Corolla Cross registrado; garantía de leasing Amarok eliminada (se devolvió, margen ≈ $915 mil).

**v17 (10-nov) · facturas BlackGPS 2026 y ajustes (`core_v17_ajustes_y_facturas_blackgps`, aplicada por SQL porque el aviso de aprobación de `apply_migration` no llegaba al teléfono de Felipe):**
- **Base real de facturas BlackGPS = Google Sheet «Control_Facturacion_BlackGPS_Nov2026»** (`10RZOjN8JcKU5nbLjUqh2cHxvTnLQoFZzpwhlBcOP0No`, Drive de carclass). Felipe dejó de usar «BlackGPS Control Global». Hojas: FACTURACION_MENSUAL (**solo el mes en curso**: el DASHBOARD_GERENCIAL y sus tablas dinámicas suman la columna entera, no agregar meses anteriores ahí), con columna R «Monto real facturado $» (en la primera línea de cada factura; las columnas I–K usan la UF del día y no sirven como monto facturado), HISTORICO_FACTURAS_MRR (facturas MRR de meses cerrados, ene–oct 2026; al cerrar un mes se pasan ahí con el monto real en K), VENTAS_UNICAS (ordenada por fecha; instalaciones, desinstalaciones, productos, recuperación de activos), RESUMEN_MENSUAL, COBRANZA (pendientes con antigüedad) y CONTRATOS (equipos × UF). Locale es_MX: meses como texto con apóstrofo.
- `fin.ventas` BlackGPS 2026 reemplazadas por 312 facturas (`origen = 'control_global'`, empresa por RUT). Excluidas 590 (anulada) y 564 (emitida y revertida); NC 37, 538 y 55 como `otro` negativo; 512 sin monto en la fuente → $233.182. Totales con IVA: ene 6.236.450 · feb 3.236.113 · mar 5.167.763 · abr 3.647.469 · may 3.794.173 · jun 3.747.109 · jul 4.038.452 · ago 3.826.614 · sep 3.186.906 · oct 5.075.673 · nov 4.822.796.
- Factura 662 (Tremar, $1.129.675): 2 sets de cámaras ADAS + DMS y 2 FMC920. Costo $121.380 con IVA ($102.000 neto: solo los 2 FMC920; las cámaras eran stock propio retirado de Inversiones RIG). Margen neto $847.307 (`core_v18_costo_factura_662_tremar`, por SQL).
- Corolla Cross: `fin.movimientos` egreso `compra_stock` $14,5 MM (4-sep, documento TDCG37); pasa a costo al venderse.
- Cuentas grandes BlackGPS (Cerebro): Naran Global (500, meta 500–1.000 en 2027), Melón (350), UNICON Chile / Grupo UNACEM (302), Verisure (300), Grúas M10 (300). Oro Verde perdida por competencia. Melón tiene la próxima acción vencida (31-oct).
- Drive renovado el 10-nov (Ventas y Costos 2024–2026, EERR y Flujo 2025 y 2026).
- **Recordar a Felipe:** cruzar Carclass 2025 (Cerebro ≈ $52,3 MM vs planilla $39,2 MM) con las facturas 2025.

**v19 (10-nov) · limpieza de prospectos (Felipe):** se eliminaron de `crm.empresas` 631 prospectos de la base de prospección/CallHub (`origen = 'prospeccion_blackgps'`) sin ningún avance (por contactar, 0 intentos, sin reunión, sin Asisma, sin ventas, actividades ni cotizaciones; 575 abiertos y 56 descartados). Respaldo completo (empresa, oportunidades, contactos, análisis, tareas) en `archivo.prospectos_callhub`, sin acceso desde la app. Regla: en Clientes solo van clientes reales o empresas/personas con avance (respuesta, reunión, solicitud). (`core_v19_limpieza_prospectos_callhub`, por SQL).

**v20 (10-nov) · fusión de duplicados (Felipe):** 25 fichas duplicadas de clientes BlackGPS (22 `factura_gps` sin RUT y 3 de Asisma: Alfa chilena, Fundación El Teniente, Irazábal) fusionadas en la ficha con contrato (oportunidades, contactos, ventas y tareas movidas). Eliminados 17 leads de prueba del panel («Lead +569…»), Aguas Andinas y Resiter (descartados como clientes). Fichas nuevas con RUT: Inversiones LYS, Movitrack, Servicios CH; Quality Meats y Transportes Ramos con RUT. Clientes con contrato renombrados a su nombre legal (el anterior queda en `legacy.nombre_anterior`). Toda venta BlackGPS 2026 tiene ficha; solo las 18 de `planilla_ig` (totales 2024–2025) no la tienen. Respaldo en `archivo.empresas_eliminadas`. Quedan 91 empresas/personas (`core_v20_fusion_duplicados_y_limpieza_leads`, por SQL).
- Daniela Contreras y Renato Muñoz son clientes particulares BlackGPS (1 equipo, $18.990/mes c/u) que pagan por PAC con Mercado Pago, sin factura mensual: no aparecen en Control_Facturacion ni en `fin.ventas`. Pendiente que Felipe confirme si se cargan como ventas (`core_v21_clientes_pac_mercadopago`).

**v2.5.2 (16-nov) · correcciones tras la auditoría de la app:**
- Gastos: la app y el importador enviaban `tipo = 'operacional'`, que `fin.costos` no acepta (solo `directo`, `fijo`, `variable`): registrar, editar o importar un gasto fallaba. Migración `core_v22_tipo_costo_operacional` (trigger `fin.normalizar_tipo_costo`: `operacional` o vacío → `fijo`) y la app ahora ofrece Gasto fijo, Gasto variable y Costo directo.
- Categorías de costos y movimientos alineadas con las de la base (telefono, aceleradora, licencia_franquicia, retiro_dueno, impuestos, aporte_capital…); al editar se conserva la categoría del registro aunque no esté en la lista.
- Cotizador usable en el celular (modal sin desborde, totales fuera de la tabla). Embudo: botón «Mover» en cada tarjeta (el arrastre no funciona con el dedo); al mover, una fecha vencida pasa a +2 días.
- Pendiente de la auditoría: Conversaciones aún no lee `wa.conversaciones`/`wa.mensajes` (la función `wa-webhook` ya está activa y su código no está en este repo); editar fichas, contactos y vehículos; registrar la venta al ganar y ligar costos a ventas; cuentas bancarias (0).

**v2.6.0 (16-nov) · Conversaciones de WhatsApp (Fase 5, lado Core):**
- La conexión a WhatsApp (Kapso, coexistencia, `wa-webhook`, `core.api_wa_ingesta`) y el agente (`wa.borradores`, `wa.cola_agente`, `wa.citas`, `wa.agente_log`, prompt en `wa.config`) se construyen en la carpeta `carclass-whatsapp` del PC de Felipe, no en este repo. Modo del agente: Carclass `borrador`, NOM y BlackGPS `observar`.
- Migración `core_v23_app_conversaciones` (+ `core_v23b`): `app_conversaciones()`, `app_conversacion(id)` (mensajes, borradores pendientes, citas), `app_conversacion_atender(id, 'tomar'|'devolver')` y `app_borrador_descartar(id)`. Nunca exponen conversaciones `personal`/`ignorada`. «Tomar» = `agente_activo = false`, `agente_pausado_hasta = +30 días`, vacía la cola y descarta borradores; «Devolver» = `agente_activo = true`, pausa nula.
- App: módulo Conversaciones con lista y chat (en el celular, uno a la vez), estado de la ventana de 24 h, borradores del asesor con «Enviar desde mi WhatsApp» (abre wa.me con el texto; al enviarlo desde el teléfono el webhook cierra el borrador y pausa al asesor 12 h) y «Descartar». Badge en el menú y aviso «Borrador del asesor por revisar». Se refresca cada 20 s.
- Publicación: la app se publica desde la nube con el conector Netlify (entorno «carclass-core», que permite netlify-mcp.netlify.app y api.netlify.com; Node necesita `NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt`).

**v2.7.0 (16-nov) · asesor, pestañas, edición y avisos push:**
- Felipe: el asesor **responde solo** (`activo`) a Carclass y NOM; BlackGPS en `observar`; chats personales los ve Felipe en su WhatsApp. `core_v24`: modos editables desde Conversaciones (`app_asesor_modo`, solo dueño), `app_conversacion_clasificar(id, carclass|nom|blackgps|carwash|personal, flujo)` y marca `traspaso` (tarea abierta «[WhatsApp] …» que crea `traspasar_humano`). El asesor solo responde cuando su ejecución automática (pg_cron → wa-agente, de la sesión carclass-whatsapp) está encendida; la app lo muestra como «aún no encendido».
- Pestañas en Conversaciones: Míos (BlackGPS, tomados, traspasados), Asesor IA (Carclass, NOM y chats nuevos), Todas.
- `core_v25`: `app_ficha_guardar` (nombre, RUT, teléfono, correo, comuna, región, dirección, rubro, flota, notas y contacto principal; no repite RUT ni teléfono de persona) y `app_oportunidad_guardar` (título, próxima acción y fecha obligatorias, monto). Botones «Editar» en la ficha y en cada oportunidad.
- `core_v26`: Web Push con la app cerrada. Claves en Vault (`push_vapid_publica`, `push_vapid_privada`, `push_secreto`), suscripciones en `core.push_suscripciones`, deduplicación en `core.push_log`, envío con `core.push(titulo, cuerpo, href, clave)` → pg_net → función `core-push` (en `supabase/functions/core-push`). Avisos: cliente pide hablar contigo (tarea «[WhatsApp]»), lead nuevo, sin respuesta a los 5 min y cita en 1 hora (cron `core_push_revisar` cada minuto), cotización vista. Un mensaje `saliente_api` del asesor marca `primera_respuesta_en`. Cada dispositivo se suscribe al pulsar «Activar avisos» (iPhone: app instalada en pantalla de inicio).
- Pendiente del punto 6 de la auditoría: contactos adicionales y vehículos editables.

**v2.8.0 (16-nov) · enviar WhatsApp desde Core y venta al ganar:**
- Conversaciones usa la función `wa-enviar` (de la sesión carclass-whatsapp; contrato en su `docs/contrato-core-whatsapp.md`): POST con `Authorization: Bearer <access_token>`; `{borrador_id}` envía el borrador, `{borrador_id, mensajes}` edita y envía, `{conversacion_id, mensajes}` responde a mano y pausa al asesor 12 h; 409 si la ventana de 24 h está cerrada. La app muestra las acciones del borrador (cotización, cita, traspaso, descarte diferido) y un campo para responder.
- `core_v27`: `app_ganar_con_venta(p)` marca ganada y, si quien ve finanzas lo pide, crea la venta en `fin.ventas` ligada a cliente, oportunidad y cotización (origen `app`). BlackGPS no registra venta aquí (viene de Control_Facturacion). `app_fin_guardar` permite cambiar `venta_id` de un costo. `app_empresa` entrega por venta sus costos ligados y margen.
- App: «Ganada» pide monto (prellenado con el de la oportunidad), tipo, detalle, cobro, documento e IVA. Ficha → Ventas muestra margen y botón «+ Costo» (costo directo ligado). En Registro, cada costo puede elegir su venta y las ventas muestran su margen.

**v2.9.0 (18-nov) · Tasador NOM trazable (rama `nom-tasador-fase1`, app sin publicar):** ver `docs/nom-tasador.md`. Esquema `nom` (`core_v31`–`core_v35`): tasaciones versionadas con avisos reales y evidencia, cálculo en la base en **modo conservador** (percentil 35, nunca sobre un comparable mejor), aprobación solo del dueño, informe cliente desde lista blanca (`nom.payload_cliente`, link `#/t/<token>`), herramientas MCP `nom_*` en core-api 1.2.0 (no aprueban ni envían). Oficina NOM en `core.parametros['nom.oficina']`: Av. Puerto Oriente 361, of. 409P, Chicureo, lun–vie 9–18 previa coordinación. `core.links_pago`: catálogo de links de pago (Mercado Pago), aún sin URL. El agente WhatsApp tiene NOM en `observar` (Felipe quiere `activo` con dos aprobaciones: tasación y fee) — falta construir esas herramientas.

**21-nov · asesor, cotizador y seguridad (rama `nom-tasador-fase1`):**
- Asesor Carclass: `crear_cotizacion` guarda el formato v2 de la app (`lineas`, `auto`), numeración `CC-AAMM-NNN`, actualiza la cotización abierta en vez de duplicarla y devuelve el link `app.carclass.cl/#/c/<token>`. `enviar_cotizacion_ppf` arma un PDF con marca Carclass (kit frontal y completo exterior en XPEL Gloss (por defecto; la planilla lo llama «gloss») y Ultimate Plus 8, más Shield y Protection Pack; nunca columnas dealer), lo guarda en el bucket público `documentos` (`core_v46`) y `wa-agente` lo envía por WhatsApp después del texto, una sola vez por auto. Modelo sin planilla: estimado con la mediana de la marca y tarea «[PPF] Pedir planilla a Hiendcar». El calce de modelos PPF es por palabra completa (X3 ≠ iX3).
- `core_v47` `app_ppf_modelos(texto)`: planillas PPF con precios públicos para el cotizador y la app.
- BlackGPS: el asesor pasa a **borrador** (`core_v48`): propone respuestas y seguimientos (`blackgps.seguimiento`: días 1, 4, 10, 21) que Felipe envía desde Conversaciones; en borrador el seguimiento se guarda aunque la ventana de 24 h esté cerrada.
- Cotizador Carclass v2 versionado en `herramientas/cotizador-carclass/` (catálogo vivo con `app_catalogo`, IVA incluido por defecto, direcciones vigentes, lugar de recepción y entrega, PPF por modelo, venta en `fin.ventas` vía `app_fin_guardar`, A4 sin cortes y vista móvil a escala). El original cobraba 19% de IVA sobre precios con IVA.
- Seguridad `core_v49`: `public.nom_inspecciones` ya no es legible ni editable por `anon` salvo inspecciones de las últimas 48 h, y `anon` no puede marcar pagos (se marcan con `app_ipc_marcar_pago`, solo dueño). Pendiente: pasar nom-inspeccion a login de Core, cerrar las ~30 tablas `public.*` abiertas a `authenticated`, retirar HQ (`tangerine-flan-697dfa`), cotizador-black, playbookblack y callhub-black. Revisión completa: plan de 5 fases (absorber playbooks, reporte al consignante y documentos Carclass en Core).
- **El repo es público:** no versionar copias de herramientas con datos de clientes (el HQ trae 38 servicios reales).

**21-nov (noche) · PDF al cliente, IPC cerrada, tasador y app 2.9.1:**
- **Regla de Felipe: al cliente se le envían documentos PDF, nunca links de cotización ni de informe.** `crear_cotizacion` genera el PDF (`pdfCotizacion`, bucket `documentos/cotizaciones/…`, `crm.cotizaciones.pdf_url`) y wa-agente lo envía después del texto; se envía un documento por nombre y turno. El informe de tasación NOM aprobado sale en PDF (`nom-automata/informe.ts`, solo `nom.payload_cliente`) aunque NOM esté en `observar`: la aprobación de Felipe autoriza el envío.
- IPC: `public.nom_inspecciones` solo para usuarios activos de Core (`core_v50`); nom-inspeccion v2 pide login de Core (supabase-js, token de sesión en vez de la clave anónima) y sigue funcionando sin conexión. Pago: `app_ipc_marcar_pago` (dueño).
- Cotizador Carclass v2 publicado (cotizador-carclass.netlify.app). Publicar sitios: conector Netlify de claude.ai (`deploy-site` → `npx @netlify/mcp … --proxy-path …` desde la carpeta del sitio); no hace falta token de Netlify.
- Simulador del asesor dentro de wa-agente: `POST /functions/v1/wa-agente/simular` con `prompt_clave` (clave de `wa.config`, p. ej. `agente_prompt_prueba`). La función `wa-simular` quedó retirada (410).
- Tasador NOM (`core_v51`–`core_v53`, nom-automata 1.1.0): investigación de mercado **por etapas** (cron `nom-automata` cada minuto; cada etapa ≤ 4 búsquedas y 4 lecturas, estado en `nom.investigaciones.conversacion`); el investigador registra también los autos vistos en listados (no verificados). Si hay menos de 3 avisos verificados, `nom.calcular_base` usa los no verificados con peso 0,6 (`nom.tasador.peso_no_verificado`) y deja una pre-estimación de confianza baja con advertencia (aprobar exige excepción). App: botón «Investigar mercado con IA» (`app_nom_investigar`) y estado (`app_nom_investigacion`). Se borró la tasación de prueba del Mazda CX-5.
- App Core 2.9.1 publicada en app.carclass.cl (módulo Tasaciones incluido).
- Pendiente para el repo privado: el despliegue de wa-agente aún importa módulos desde raw.githubusercontent; nom-automata ya se sube con todos sus archivos. Falta un token de Supabase válido (`api.supabase.com` en Network secrets) para desplegar con la CLI.
- **App 2.9.2 (21-nov):** la 2.9.1 se publicó desde la rama sin los cambios de `main` (estética 2.9, parámetros, ventas únicas BlackGPS); 2.9.2 fusiona ambas ramas y se republicó. Antes de publicar la app, fusionar `origin/main`: hay otra sesión trabajando ahí.
- **PDF con la identidad de cada marca (Felipe 21-nov):** Carclass (`wa-agente/documentos.ts`) replica el cotizador de Netlify: banda negra de 36 mm con servicios en versalitas, logo blanco (`app/img/logo-blanco.png`) y título y datos; tabla con encabezados negros, totales en cajas gris/negro y pie con contacto y condiciones. NOM (`nom-automata/informe.ts`) replica el informe de la app (`app/informe-tasacion.js`): banda negra de 25 mm con logo NOM y folio, sobretítulo champagne `#b49c5e`, títulos serif, ficha en grilla, caja de evaluación, tarjetas grises, comparables numerados en dorado con enlace verde clicable y pie en versalitas. Direcciones: «centro de instalación del complejo industrial Alto Portezuelo, en Quilicura» y «nuestra oficina en Puertas de Chicureo»; nunca «nuestro taller». wa-agente v10 y nom-automata v10 importan sus módulos desde raw.githubusercontent fijados al commit `a6c7d1a` (antes de hacer privado el repo hay que subirlos en un solo archivo).
- `core_v57`: la descripción del retiro en `crm.catalogo` sigue a `core_v53` (cualquier servicio desde $600.000; bajo eso ≈ $30.000).
- **Felipe 21-nov (tarde):** venta cruzada activa nombrando la marca, solo con la primera venta cerrada (prompt + `grupo.venta_cruzada`, `core_v62`); reporte al consignante cada 7 días (`nom.reporte_consignante`); Carwash.hf mantiene Pulido Básico aprox. $150.000 y Sellado Cerámico Lite $250.000 (corrección intermedia + sellado, sin interior) (`core_v61`); informe NOM con botón «Agendar visita por WhatsApp» (y «Elegir horario en el calendario» si existe `nom.oficina.agenda_url`).
- **Cotizador integrado (`core_v63`):** «Traer cotización de Core» (`app_cotizacion_buscar`) o `cotizador-carclass.netlify.app/?cot=<id>` (botón «Orden de ingreso» en cada cotización Carclass de la app, 2.10.2). La orden queda ligada (`car_ordenes.oportunidad_id`, `cotizacion_id`); al guardar el ingreso la oportunidad pasa a `en_taller` y al guardar la entrega a `entregado` (`app_orden_avance`, nunca reabre una cerrada); registrar la venta con la oportunidad abierta usa `app_ganar_con_venta` (ganada + venta ligada + postventa).

**v27 (18-nov) · cruce Core ↔ Cerebro (rev. 170):** cobranza BlackGPS 2026 igual a Control_Facturacion (33 pendientes, $3.286.993; el resto cobrado según la conciliación de la cartola BancoEstado al 12-nov), factura 663 (El Alerce, 2 GPS reactivados, $30.245) y 665 de RCM con número, cobrada y con oportunidad ganada. Carwash.hf horario temporal vie–dom 10–17. Meta de llamadas 20/día. HGT Tour perdida (GPSChile). Próximas acciones de Naran, UNICON, M10, Piloansa, IAF y Alfa según el Cerebro. Pendiente de Felipe: actualizar `ops.contratos_gps` (sigue en 28 clientes, 199 equipos, MRR $3.388.765 del 29-oct; faltan RCM 13, El Alerce 66–69 y bajas), 23 leads de Asisma con próxima acción vencida, precios NOM (Outlander publicado $16.490.000 en Core vs $17.000.000 en el Cerebro; mínimo Corolla $16.000.000 vs $16.500.000) y comisión NOM (Cerebro 3–4%; Core rango 3–5% con referencia del 5-nov). El Cerebro está atrasado en: Verisure (perdida 13-nov en Core), inventario NOM (Camaro y X1 retirados) y cifras BlackGPS del 29-oct (`core_v27_sync_cerebro_cobranza_bgps`, por SQL).

**v28 (18-nov, Felipe):** 23 leads de Asisma vencidos pasan a llamadas de seguimiento del bloque de la mañana (5 por día hábil, 19–25 nov). Outlander STHZ43 retirada (la consignación no sigue). Corolla Cross: venta ideal $16.500.000, con oferta de $16.000.000 se vende (precio mínimo 16 MM). Nueva consignación VW Nivus 2022 (vehículo en evaluación, consignante por identificar, oportunidad NOM consignante «nuevo»). Comisión NOM: manda Core. Tarea programada «Datos · Sincronizar Core con Cerebro y facturación» (`trig_011CCdC6RqgDSAqcfrRo6eoX`, lun–vie 7:13 Chile) creada pero **pausada**: se creó sin conectores; hay que agregarle Supabase, Google Sheets y Claude Docs desde claude.ai (Rutinas) y activarla (`core_v28_nom_stock_y_seguimiento_asisma`, por SQL).

**WhatsApp · saludo automático (18-nov):** el «Mensaje de bienvenida» de WhatsApp Business del celular de Felipe llega como eco (`smb_message_echoes`) y se registraba como respuesta humana: sacaba el chat de la cola, pausaba al asesor 12 h y el asesor quedaba sin «nada que responder» (6 casos en 7 días). Parche en `core.api_wa_ingesta`: los ecos cuyo texto está en `wa.config['mensajes_automaticos_app']` (lista editable, comparación con `wa.norm_txt`, función `wa.es_mensaje_automatico`) solo actualizan `ultima_salida` y no se guardan ni pausan. Avisar a la sesión carclass-whatsapp (dueña del backend) para que lo incorpore a su repo (`wa_ignorar_saludo_automatico_app`, por SQL).

**Asesor · detailing interior (Felipe, 18-nov):** no se vende el detailing interior solo; forma parte de tratamientos completos con pulido y sellado cerámico. Regla agregada al prompt del asesor (`wa.config['agente_prompt']`) y Detailing Deluxe inactivo en `crm.catalogo`. El prompt nace en el repo carclass-whatsapp (`prompts/asesor-sistema.md` → `sync-prompt.ps1`): hay que llevar este cambio allá o un próximo sync lo borra.

**Pruebas del asesor (19-nov):** función `wa-simular` (Edge Function, `--no-verify-jwt`, cabecera `x-agente-secret`): corre conversaciones simuladas con el mismo prompt, herramientas (modo simulación: solo leen Core, no escriben ni envían) y cerebro que `wa-agente`; resultados en `qa.simulaciones` (lote, escenario, transcripción, acciones, costo). Importa una copia fija de los módulos del asesor en `supabase/functions/wa-simular/agente/` (commit beade9f; actualizar la copia y el import si cambia `wa-agente`). Se dispara con `net.http_post` desde SQL, máximo 12 escenarios por llamada. Primer lote: 24 casos, 3 reglas corregidas en el prompt (cerámico siempre 1/4/8, solo-interior solo si el cliente lo pide, láminas fuera de norma con aviso escrito). Informe: doc «Pruebas del asesor de WhatsApp» (https://claude.ai/artifact/Jf2yafSJdprrtWLBTJpmFa).

**v2.8.4 y v2.9.0 (19-nov) · estética (Felipe):** login inmersivo verde profundo con tarjeta de vidrio y acentos dorados (2.8.4). En 2.9.0 el resto de la app sigue esa línea: menú lateral oscuro en degradado verde con cuadrícula y activo dorado, barra superior de vidrio con filete dorado, botones primarios en degradado, tarjetas más redondeadas (`--r: 16px`) con realce al pasar el mouse, foco dorado en campos y modo oscuro más profundo. Todo vive en el bloque «Refresh 2.9» al final de `app/app.css` (solo estilos).

**v2.9.1 (20-nov) · datos del negocio desde la base:** la app carga `app_parametros()` (todo `core.parametros`, solo usuarios activos) en `PARAM` al iniciar sesión y arma con eso los textos que antes estaban escritos en el código: horario y dirección de Carwash.hf (`carwash.negocio`, hoy vie–dom 10–17), notas por defecto de cotizaciones (reserva de `carclass.transferencia.pago`), regla de retiro (`carclass.retiro`: sin costo solo en Chicureo y Lo Barnechea, ventas con PPF), política de descuento (`carclass.descuento`, 0%) y comisión NOM (`nom.comision`: 5% de los primeros $20 MM + 3% del exceso, mínimo $500.000, fee $50.000). La ocupación de Carwash.hf cuenta solo los días de atención (3 × 4 = 12 por semana) y muestra «cerrado» los demás. Dashboard ordenado por prioridad: BlackGPS, Carclass, NOM, Carwash.hf (`LINEAS`). Regla: **ningún horario, precio, comisión o política se escribe en `app.js`; va en `core.parametros`.** BlackGPS muestra además las **ventas únicas** (fuera del MRR: equipos y cámaras, instalaciones, desinstalaciones, otros servicios) en la tarjeta del Grupo y en su dashboard (por mes y facturas del mes), con `app_bgps_ventas_unicas(p_meses)` (`core_v42`, solo `ve_finanzas`; clasifica por `fin.ventas.modalidad`: hardware, instalacion, servicio con «desinstal» en la descripción).

**Procesos v2.4 (21-nov, Felipe):** 11 fichas en `ops.sops` (tipo `proceso`), orden grupo → BlackGPS → Carclass → NOM → Carwash.hf; fuente en `docs/procesos-comerciales.md`; respaldo de las 8 anteriores en `archivo.sops_procesos_v1` (`core_v52`). Decisiones del mismo día:
- Retiro y entrega a domicilio: sin costo en **cualquier servicio** con total desde $600.000 (sector Chicureo, Lo Barnechea y alrededores); bajo eso ≈ $30.000 (`core_v53`, reemplaza «solo PPF» de `core_v44`).
- Nunca «nuestro taller»: es «el centro de instalación del complejo industrial Alto Portezuelo» (partner); también se recibe en «nuestra oficina en Puertas de Chicureo» (`carclass.recepcion` y prompt del asesor, `core_v53`). El prompt nace en el repo carclass-whatsapp: llevar ahí estos cambios.
- NOM compra directa y parte de pago: flujo `compra_directa` con etapas nuevo → calificando → tasado → oferta_enviada → aceptada → inspeccionado → comprado (`core_v54`; `flujo_ok`, `core.etapas`, clasificar chat). En la app: pestaña «Compra directa» en el Embudo NOM y opción «Vender ya» en Nuevo lead.
- Catálogo v2.4 (`core_v55`): láminas 8 micras recomendada, corrección por plan en cerámicos (80% / 90% / 3 etapas), Detailing Pre-Venta $225.000; Carwash.hf con tamaños de la web, pulidos fuera de la web desactivados, pulido + cerámico lo cotiza Felipe. WPF y reparación de llantas se mantienen. El cotizador de Netlify (cotizador-carclass) lo gestiona otro chat.
- Landing BlackGPS: función `lead-landing` (`verify_jwt` falso, `supabase/functions/lead-landing`) recibe el webhook de Elementor en cualquier formato (etiquetas, IDs o `fields[id][value]`), lo normaliza y llama a `core-api/lead-web` con la clave de la landing (`?k=`). Los leads web de BlackGPS entran en **pre_revision** con «Revisar lead de la landing y contactar (demo gratuita)» (`core_v56`). Probado de punta a punta y borrado.

**App 2.10.1 (21-nov) · Conversaciones rediseñada + tasador:** fusión de la rama `nom-tasador-fase1` (2.9.2: Tasaciones NOM, `informe-tasacion.js`, logos para PDF) con 2.10.0 (auditoría de Chrome). Conversaciones como chat: burbujas por autor (tú en verde, cliente en blanco, asesor IA con filete dorado y etiqueta), agrupadas, separadores de día, hora en la burbuja, medios como chips, reacciones sobre la burbuja, lista de 2 líneas con un solo indicador, nombres sin letras → «Sin nombre · +56 9…», alto completo, campo que crece y botón circular; modos del asesor en el botón «Asesor IA» (panel con guardar; Carwash.hf «lo atiendes tú»); confirmaciones dentro de la app (sin `confirm()`). Embudo con acción en 2 líneas y códigos de motivo legibles, Vehículos en tarjetas en el celular, Agenda en Semana y con el cliente primero, precios exactos en el cotizador, próxima acción en día hábil (`diaHabil`), resultados B2C en la bitácora, servicios de interés según el Cerebro, «Procesos y ayuda», error de `viewRegistro` corregido. **Regla de trabajo entre sesiones:** `git pull` antes de tocar `app/`, push a `main` después, y nunca publicar en Netlify sin pull previo (una sesión publicó 2.9.2 sin subirla y casi se pierde).

**App 2.11.0 (27-nov) · módulo Directorio (`core_v84`, Felipe):** tablero central del Directorio de agentes de Claude. Esquema `dir` (bitacora, pendientes, alertas, marcador semanal) y vistas `dir.v_tablero` (todo en un JSON, lo leen los agentes con `select d from dir.v_tablero`), `dir.v_asesor_wa` (salud diaria del asesor, 14 días) y `dir.v_embudo`. App: sección «Dirección → Directorio» (solo dueño) con pestañas Resumen, BlackGPS, Carclass, NOM, Carwash.hf, Asesor WhatsApp, Alertas y Bitácora; cambiar estado de pendientes, resolver alertas, crear pendientes y «Nota al Director». Funciones `app_directorio`, `app_dir_pendiente`, `app_dir_alerta`, `app_dir_nota`, `app_dir_pendiente_nuevo` (todas exigen `core.es_dueno()`). Protocolo de los agentes en las instrucciones del proyecto de Claude y en `claude/Directorio_Tablero_Sistema.md`.

**Pendiente:**
- Netlify: el cotizador Carclass y nom-inspeccion siguen ahí; evaluar moverlos a Cloudflare Pages si se vuelven a agotar los créditos.
- Push con la app cerrada: claves VAPID, tabla de suscripciones y envío desde core-api.
- Google Calendar en ambos sentidos, cotizador con banda de precio, PDF y link público «vista» (necesita la lista de precios), adjuntos en bitácora (Storage), inspección de vehículos NOM, invitar usuarios (solo cuando Felipe lo pida), Conversaciones con WhatsApp Cloud API (6.2).

## 7. Preguntas abiertas para Felipe

1. Lista de precios vigente que puede usar el asesor (cerámico, láminas, PPF por tamaño de auto) y monto o porcentaje del abono de reserva.
2. Datos de la cuenta para transferencias y quién valida que el abono llegó (el asesor no puede verificar un depósito solo con la foto del comprobante; la reserva queda «pendiente de validación» hasta que un humano o el banco lo confirme).
3. Horarios y capacidad de Hiendcar para que el asesor ofrezca fechas reales.
4. Costo y condiciones del retiro a domicilio por comuna.
5. Credenciales de Premium Hosting (cPanel) o que Felipe cree el CNAME de `app`.

## 8. Cómo trabajar en este repositorio

- `app/`: app web estática (sin build). **Se publica sola** en Cloudflare Pages al hacer push a `main` (pull antes, nunca forzar). La API de Cloudflare se usa con `Authorization: Bearer proxy-injected` (token como network secret del entorno). Al cambiar `app.js` o `app.css`, sube la versión en `?v=` de `index.html`, en `CACHE`/`SHELL` de `sw.js` y `VERSION` de `app.js`.
- `supabase/functions/core-api/`: API. Publicar con `supabase functions deploy core-api --no-verify-jwt --project-ref tvjpwwwnpchecolcsnxp`.
- Cambios de base: siempre como migración nueva, nunca editar tablas a mano. No tocar las tablas `public.*` antiguas salvo para leer.
- Probar cada flujo de punta a punta y borrar los datos de prueba.
- Idioma de la interfaz y del código de negocio: español de Chile. Tono sobrio y directo.
- La clave publicable de Supabase va en el front; la seguridad vive en RLS y en las funciones `app_*`. Nunca exponer la service role.
