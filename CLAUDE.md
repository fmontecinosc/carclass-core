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
| App web | Netlify, sitio **carclass-core** (`deb7fddb-d934-4858-88eb-58428e9b3b1a`) → carclass-core.netlify.app | v2.3 publicada por Felipe (zip manual, 5-nov); v2.5 en el repo. v1 respaldada en `app-v1/` |
| Herramientas externas | Netlify: **cotizador-carclass** (`e5290aca-…`, PDF cotización → ingreso → acta, no guarda datos) y **nom-inspeccion** (`c71b83a5-…`, inspección IPC; guarda en `public.nom_inspecciones`) | Enlazadas desde Core (Catálogo → Herramientas). Subidas a mano, sin repositorio |
| Dominio | `app.carclass.cl` hoy apunta al panel antiguo en el hosting de la web (**Premium Hosting**, LiteSpeed). Falta CNAME `app` → `carclass-core.netlify.app` | Pendiente |
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
- **Stock NOM vigente:** solo Toyota Corolla Cross (TDCG37) y Mitsubishi Outlander (STHZ43).

## 5. Estado de los datos (5-nov-2026)

761 empresas · 575 prospectos BlackGPS por contactar · 27 leads abiertos en Asisma (importados de su CSV, con `asisma_id`) · ventas: BlackGPS hasta julio por facturas + 8 pedidos de hardware Asisma (sep–oct), Carclass hasta junio, NOM una comisión. **Faltan:** facturas de licencias BlackGPS desde agosto, costos BlackGPS desde junio, ventas Carclass desde julio. Los pedidos de hardware de Asisma se venden a costo y dos dan margen negativo (Bugueño PED-002420, Fundación El Teniente PED-002184): pendiente que Felipe explique.

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
- Selector de línea en la barra superior (`cc_linea`, `data-linea` en `<html>` tiñe la app con el color de la unidad) y filtro en Bandeja, Embudo, Agenda, Tareas, Cotizaciones y Conversaciones. Orden: Carclass, NOM, Carwash.hf, BlackGPS.
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
- Comisión NOM (Felipe 5-nov): 5% general, 3% sobre $20 MM, mínimo $500.000 bajo $10 MM.
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
- **Base real de facturas BlackGPS = Google Sheet «Control_Facturacion_BlackGPS_Nov2026»** (`10RZOjN8JcKU5nbLjUqh2cHxvTnLQoFZzpwhlBcOP0No`, Drive de carclass). Felipe dejó de usar «BlackGPS Control Global». Hojas: FACTURACION_MENSUAL (MRR, con N° factura y estado), VENTAS_UNICAS (instalaciones, desinstalaciones, productos, recuperación de activos), RESUMEN_MENSUAL, COBRANZA (pendientes con antigüedad) y CONTRATOS (equipos × UF). Locale es_MX: meses como texto con apóstrofo.
- `fin.ventas` BlackGPS 2026 reemplazadas por 312 facturas (`origen = 'control_global'`, empresa por RUT). Excluidas 590 (anulada) y 564 (emitida y revertida); NC 37, 538 y 55 como `otro` negativo; 512 sin monto en la fuente → $233.182. Totales con IVA: ene 6.236.450 · feb 3.236.113 · mar 5.167.763 · abr 3.647.469 · may 3.794.173 · jun 3.747.109 · jul 4.038.452 · ago 3.826.614 · sep 3.186.906 · oct 5.075.673 · nov 4.822.796.
- Factura 662 (Tremar, $1.129.675): 2 sets de cámaras ADAS + DMS y 2 FMC920; **falta su costo**.
- Corolla Cross: `fin.movimientos` egreso `compra_stock` $14,5 MM (4-sep, documento TDCG37); pasa a costo al venderse.
- Cuentas grandes BlackGPS (Cerebro): Naran Global (500, meta 500–1.000 en 2027), Melón (350), UNICON Chile / Grupo UNACEM (302), Verisure (300), Grúas M10 (300). Oro Verde perdida por competencia. Melón tiene la próxima acción vencida (31-oct).
- Drive renovado el 10-nov (Ventas y Costos 2024–2026, EERR y Flujo 2025 y 2026).
- **Recordar a Felipe:** cruzar Carclass 2025 (Cerebro ≈ $52,3 MM vs planilla $39,2 MM) con las facturas 2025.

**Pendiente:**
- Netlify: conectar el sitio carclass-core al repositorio (base `app`) para publicar con cada push; desde la nube de Claude la red bloquea Netlify.
- Push con la app cerrada: claves VAPID, tabla de suscripciones y envío desde core-api.
- Google Calendar en ambos sentidos, cotizador con banda de precio, PDF y link público «vista» (necesita la lista de precios), adjuntos en bitácora (Storage), inspección de vehículos NOM, invitar usuarios (solo cuando Felipe lo pida), Conversaciones con WhatsApp Cloud API (6.2).

## 7. Preguntas abiertas para Felipe

1. Lista de precios vigente que puede usar el asesor (cerámico, láminas, PPF por tamaño de auto) y monto o porcentaje del abono de reserva.
2. Datos de la cuenta para transferencias y quién valida que el abono llegó (el asesor no puede verificar un depósito solo con la foto del comprobante; la reserva queda «pendiente de validación» hasta que un humano o el banco lo confirme).
3. Horarios y capacidad de Hiendcar para que el asesor ofrezca fechas reales.
4. Costo y condiciones del retiro a domicilio por comuna.
5. Credenciales de Premium Hosting (cPanel) o que Felipe cree el CNAME de `app`.

## 8. Cómo trabajar en este repositorio

- `app/`: app web estática (sin build). Publicar con `netlify deploy --prod --dir app --site deb7fddb-d934-4858-88eb-58428e9b3b1a`. Al cambiar `app.js` o `app.css`, sube la versión en `?v=` de `index.html` y en `CACHE`/`SHELL` de `sw.js`.
- `supabase/functions/core-api/`: API. Publicar con `supabase functions deploy core-api --no-verify-jwt --project-ref tvjpwwwnpchecolcsnxp`.
- Cambios de base: siempre como migración nueva, nunca editar tablas a mano. No tocar las tablas `public.*` antiguas salvo para leer.
- Probar cada flujo de punta a punta y borrar los datos de prueba.
- Idioma de la interfaz y del código de negocio: español de Chile. Tono sobrio y directo.
- La clave publicable de Supabase va en el front; la seguridad vive en RLS y en las funciones `app_*`. Nunca exponer la service role.
