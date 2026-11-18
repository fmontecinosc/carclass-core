// Carclass Core — API única para ChatGPT (REST) y Claude (MCP)
// Toda la lógica de negocio vive en funciones SQL core.api_*; aquí solo se autentica y se enruta.
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });
const VERSION = "1.2.0";

type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: any, autor: string) => Promise<unknown>;
};

const s = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });
const str = (d: string) => ({ type: "string", description: d });
const int = (d: string) => ({ type: "integer", description: d });
const UNIDADES = ["blackgps", "somosb2b", "carclass", "carwash", "nom", "grupo"];

// Llama core.<fn>(...) con tipos explícitos: [valor, "jsonb" | "text" | "int" | "uuid"]
const callJson = async (fn: string, ...params: [unknown, string][]) => {
  // Los parámetros viajan como texto y se convierten en SQL (evita doble codificación de jsonb)
  const ph = params.map(([, t], i) => `($${i + 1}::text)::${t}`).join(", ");
  const vals = params.map(([v, t]) => v === null || v === undefined ? null : t === "jsonb" ? JSON.stringify(v) : String(v));
  const rows = await sql.unsafe(`select core.${fn}(${ph}) as r`, vals as any[]);
  return rows[0]?.r;
};

const empresaSchema = s({
  nombre: str("Razón social o nombre comercial"),
  rut: str("RUT de la empresa, con o sin puntos y guion"),
  rubro: str("Giro o industria"),
  subsegmento: str("Subsegmento dentro del rubro"),
  tamano_flota: int("Cantidad de vehículos de la flota"),
  region: str("Región"), comuna: str("Comuna"), direccion: str("Dirección"),
  web: str("Sitio web"), telefono: str("Teléfono general"), email: str("Correo general"),
});

const TOOLS: Tool[] = [
  {
    name: "buscar_empresa",
    description: "Busca una empresa por nombre, parte del nombre o RUT y devuelve su ficha 360: contactos, oportunidades por unidad, último análisis, últimas actividades y contrato GPS. Úsala antes de analizar o contactar una empresa para no duplicar.",
    inputSchema: s({ q: str("Nombre o RUT"), limite: int("Máximo de resultados (1-20, por defecto 5)") }, ["q"]),
    run: (a) => callJson("api_buscar_empresa", [a.q, "text"], [a.limite ?? 5, "int"]),
  },
  {
    name: "registrar_analisis",
    description: "Guarda el análisis de una empresa como potencial cliente. Crea o actualiza la empresa (deduplica por RUT y nombre), el contacto y deja la oportunidad en la bandeja de pre-revisión (etapa 'pre_revision') para que Felipe la apruebe o descarte. Si la empresa ya tiene una oportunidad abierta en esa unidad, solo suma el análisis a su ficha.",
    inputSchema: s({
      unidad: { type: "string", enum: UNIDADES, description: "Unidad de negocio; por defecto blackgps" },
      empresa: empresaSchema,
      contacto: s({ nombre: str("Nombre"), cargo: str("Cargo"), telefono: str("Teléfono"), email: str("Correo"), decisor: { type: "boolean", description: "¿Es quien decide la compra?" } }),
      analisis: s({
        titulo: str("Título corto de la oportunidad"),
        resumen: str("Resumen del análisis y ángulo comercial"),
        dolores: { type: "array", items: { type: "string" }, description: "Problemas detectados" },
        pilar: { type: "string", enum: ["software", "conectividad", "hardware"], description: "Pilar BlackGPS que aplica" },
        marcas_somosb2b: { type: "array", items: { type: "string" }, description: "Marcas complementarias de somosB2B" },
        score: int("Puntaje de calce de 0 a 100"),
      }),
    }, ["empresa"]),
    run: (a, autor) => callJson("api_registrar_analisis", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "cola_del_dia",
    description: "Lista priorizada de oportunidades abiertas con acción vencida, para hoy o sin fecha, con teléfono, flota y ángulo comercial. Es la base para la sesión diaria de llamadas.",
    inputSchema: s({ unidad: { type: "string", enum: UNIDADES }, limite: int("Máximo de filas (1-50, por defecto 15)") }),
    run: (a) => callJson("api_cola", [a.unidad ?? null, "text"], [a.limite ?? 15, "int"]),
  },
  {
    name: "registrar_actividad",
    description: "Registra una llamada, correo, WhatsApp, reunión, visita o nota sobre una oportunidad. Avanza la etapa automáticamente (nunca retrocede) y fija la próxima acción. resultado: 'no_contesta', 'interesado', 'reunion_agendada', 'no_interesado' (marca perdida), u otro texto.",
    inputSchema: s({
      oportunidad_id: str("ID de la oportunidad"),
      tipo: { type: "string", enum: ["llamada", "correo", "whatsapp", "reunion", "visita", "nota"] },
      resultado: str("Resultado de la gestión"),
      nota: str("Detalle"),
      proxima_accion: str("Qué sigue"),
      proxima_fecha: str("Fecha de la próxima acción, AAAA-MM-DD; por defecto en 2 días"),
    }, ["oportunidad_id", "tipo"]),
    run: (a, autor) => callJson("api_registrar_actividad", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "mover_etapa",
    description: "Cambia la etapa o el estado de una oportunidad (abierta, ganada, perdida, descartada). Perdida exige motivo; abierta exige próxima fecha. Para el traspaso a Asisma usa etapa 'en_asisma' y asisma_id.",
    inputSchema: s({
      oportunidad_id: str("ID de la oportunidad"), etapa: str("Nueva etapa"),
      estado: { type: "string", enum: ["abierta", "ganada", "perdida", "descartada"] },
      motivo_codigo: { type: "string", enum: ["precio", "competencia", "sin_respuesta", "fuera_zona", "no_califica", "desistio", "datos_erroneos", "duplicado", "otro"] },
      motivo: str("Detalle del motivo"), asisma_id: str("ID del lead en Asisma"),
      flujo: { type: "string", enum: ["consignante", "comprador"] }, closer: str("Closer asignado"),
      monto_estimado: int("Monto estimado con IVA"),
      proxima_accion: str("Qué sigue"), proxima_fecha: str("AAAA-MM-DD"),
    }, ["oportunidad_id"]),
    run: (a, autor) => callJson("api_mover_etapa", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "ficha_traspaso_asisma",
    description: "Prepara los datos de una oportunidad para cargarla en Asisma y lista lo que falta (RUT, contacto, teléfono, correo, giro).",
    inputSchema: s({ oportunidad_id: str("ID de la oportunidad") }, ["oportunidad_id"]),
    run: (a) => callJson("api_ficha_asisma", [a.oportunidad_id, "uuid"]),
  },
  {
    name: "crear_tarea",
    description: "Crea una tarea del holding, opcionalmente ligada a una empresa, oportunidad o proyecto.",
    inputSchema: s({
      titulo: str("Qué hay que hacer"), descripcion: str("Detalle"),
      unidad: { type: "string", enum: UNIDADES }, responsable: str("Por defecto Felipe"),
      vence: str("AAAA-MM-DD"), prioridad: { type: "string", enum: ["alta", "media", "baja"] },
      empresa_id: str("ID empresa"), oportunidad_id: str("ID oportunidad"), proyecto_id: str("ID proyecto"),
    }, ["titulo"]),
    run: (a, autor) => callJson("api_crear_tarea", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "listar_tareas",
    description: "Lista tareas por estado (pendiente, en_curso, hecha, descartada; varios separados por coma).",
    inputSchema: s({ estado: str("Por defecto 'pendiente,en_curso'") }),
    run: (a) => callJson("api_tareas", [a.estado ?? "pendiente,en_curso", "text"]),
  },
  {
    name: "resumen_holding",
    description: "Resumen ejecutivo: pipeline por unidad y etapa, cola de hoy, resultado por unidad de los últimos meses (ventas con IVA, costos directos, margen), MRR y equipos BlackGPS, tareas pendientes y fecha de la última venta registrada por unidad.",
    inputSchema: s({ meses: int("Meses hacia atrás, por defecto 3") }),
    run: (a) => callJson("api_resumen", [a.meses ?? 3, "int"]),
  },
  {
    name: "registrar_venta",
    description: "Registra una venta cerrada por su monto real con IVA incluido, con sus costos directos asociados, y marca la oportunidad como ganada. Confirma siempre monto y costos con Felipe antes de llamarla.",
    inputSchema: s({
      unidad: { type: "string", enum: UNIDADES }, monto: int("Monto con IVA incluido"),
      fecha: str("AAAA-MM-DD"), descripcion: str("Qué se vendió"),
      modalidad: { type: "string", enum: ["broker", "servicio", "consignacion", "compra_directa", "licencia", "hardware", "instalacion", "otro"] },
      estado_cobro: { type: "string", enum: ["pendiente", "parcial", "cobrado"] },
      afecto_iva: { type: "boolean" }, oportunidad_id: str("ID de la oportunidad ganada"),
      empresa: empresaSchema,
      costos: { type: "array", items: s({ monto: int("Con IVA"), categoria: str("Ej: partner, equipos"), descripcion: str(""), proveedor: str("") }, ["monto"]) },
    }, ["unidad", "monto"]),
    run: (a, autor) => callJson("api_registrar_venta", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "registrar_costo",
    description: "Registra un costo con IVA incluido: directo (ligado a venta_id), fijo o variable. Confirma con Felipe antes de llamarla.",
    inputSchema: s({
      unidad: { type: "string", enum: UNIDADES }, monto: int("Con IVA"), fecha: str("AAAA-MM-DD"),
      tipo: { type: "string", enum: ["directo", "fijo", "variable"] }, venta_id: str("Venta a la que pertenece"),
      categoria: str(""), descripcion: str(""), proveedor: str(""), afecto_iva: { type: "boolean" },
    }, ["unidad", "monto"]),
    run: (a, autor) => callJson("api_registrar_costo", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "registrar_lead",
    description: "Registra un lead entrante (setter). B2C: Carclass, Carwash.hf o NOM, identificado por teléfono; no duplica. NOM exige flujo consignante o comprador. B2B BlackGPS: empresa, RUT y contacto. Guarda canal, campaña y anuncio de origen, el mensaje del cliente y el vehículo si lo hay. Queda en etapa 'nuevo' (B2C) o 'por_contactar' (BlackGPS).",
    inputSchema: s({
      unidad: { type: "string", enum: ["carclass", "carwash", "nom", "blackgps", "somosb2b"] },
      flujo: { type: "string", enum: ["consignante", "comprador"], description: "Solo NOM" },
      nombre: str("Nombre de la persona"), telefono: str("Teléfono o WhatsApp"), email: str("Correo"),
      comuna: str(""), region: str(""),
      empresa: str("Solo B2B: razón social"), rut: str("Solo B2B"), cargo: str("Solo B2B"), flota: int("Solo B2B: vehículos"),
      canal: { type: "string", enum: ["whatsapp", "web", "landing", "meta", "google", "referido", "manual"] },
      origen: str("Detalle del origen"), campana: str("Campaña de Meta o Google"), anuncio: str("Anuncio"),
      interes: str("Servicio o auto de interés"), mensaje: str("Mensaje del cliente"),
      setter: str("Quién atiende como setter"), closer: str("Closer asignado"),
      vehiculo: s({ patente: str(""), marca: str(""), modelo: str(""), version: str(""), anio: int(""), km: int(""), precio_esperado: int("Solo consignantes, con IVA si aplica") }),
    }, ["unidad"]),
    run: (a, autor) => callJson("api_registrar_lead", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "bandeja",
    description: "Leads que esperan acción: 'entrantes' (nuevos y sin primera respuesta, con minutos de espera) y 'pre_revision' (análisis del GPT que Felipe debe aprobar o descartar).",
    inputSchema: s({ tipo: { type: "string", enum: ["todas", "entrantes", "pre_revision"] } }),
    run: (a) => callJson("api_bandeja", [a.tipo ?? "todas", "text"]),
  },
  {
    name: "revisar_lead",
    description: "Aprueba o descarta un lead en pre-revisión. Aprobar lo pasa a la siguiente etapa con próxima acción para hoy. Descartar exige motivo_codigo: precio, competencia, sin_respuesta, fuera_zona, no_califica, desistio, datos_erroneos, duplicado, otro.",
    inputSchema: s({ oportunidad_id: str(""), aprobar: { type: "boolean" }, motivo_codigo: str(""), nota: str(""), proxima_accion: str(""), proxima_fecha: str("AAAA-MM-DD") }, ["oportunidad_id", "aprobar"]),
    run: (a, autor) => callJson("api_revisar_lead", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "procesos",
    description: "Devuelve el mapa de procesos comerciales (cerebro): principios, roles setter/closer, etapas y reglas por unidad. Léelo antes de atender un lead o mover etapas.",
    inputSchema: s({ unidad: { type: "string", enum: ["carclass", "carwash", "nom", "blackgps"] } }),
    run: (a) => callJson("api_procesos", [a.unidad ?? null, "text"]),
  },
  {
    name: "registrar_cierre_mensual",
    description: "Guarda la foto del mes de BlackGPS: equipos en alta, clientes activos y MRR, leídos desde la plataforma BlackGPS.",
    inputSchema: s({ mes: str("Cualquier día del mes, AAAA-MM-DD"), equipos_alta: int(""), clientes_activos: int(""), mrr: int("MRR con IVA"), unidad: str("Por defecto blackgps"), notas: str("") }, ["mes"]),
    run: (a, autor) => callJson("api_cierre_mensual", [a, "jsonb"], [autor, "text"]),
  },
  // ───────── NOM · tasador trazable (v31/v32) ─────────
  // La aprobación y el envío al cliente NO están en la API: los decide una persona en la app.
  {
    name: "nom_tasaciones",
    description: "Lista las tasaciones NOM recientes (folio, vehículo, estado, precio de publicación, confianza, comparables válidos). Búscala antes de crear una nueva para el mismo auto.",
    inputSchema: s({ q: str("Texto: folio, marca, modelo, patente o propietario") }),
    run: (a) => callJson("api_nom_tasaciones", [a.q ?? null, "text"]),
  },
  {
    name: "nom_tasacion_crear",
    description: "Crea la ficha de una tasación NOM (queda en borrador). Marca, modelo y año obligatorios. Indica version_confirmada=true solo si la versión exacta está validada (padrón, ficha o ejecutivo); si no, la tasación saldrá como pre-estimación. 'fuentes' indica de dónde salió cada dato: declarado_por_cliente | extraido_de_documento | validado_por_ejecutivo | verificado_en_fuente | observado_en_inspeccion. No inventes datos.",
    inputSchema: s({
      marca: str(""), modelo: str(""), version: str("Variante comercial exacta, p. ej. 'Comfortline 1.0 TSI AT 4x2'"), version_confirmada: { type: "boolean" },
      anio: int("Año modelo"), motor: str(""), transmision: str("Automática / Manual / CVT…"), traccion: str("4x2 / 4x4 / AWD"), carroceria: str(""),
      combustible: str(""), km: int("Kilometraje"), color: str(""), patente: str("Uso interno; se muestra en el informe solo si mostrar_patente"),
      duenos: str("Informado, p. ej. 'Único dueño (informado)'"), llaves: str(""), equipamiento: str(""), observaciones: str("Notas internas del vehículo"),
      oportunidad_id: str("Oportunidad NOM consignante en Core"), empresa_id: str("Ficha del propietario en Core"), conversacion_id: str("wa.conversaciones.id"),
      origen: { type: "string", enum: ["panel", "whatsapp", "mcp", "web", "derivacion"] },
      fuentes: { type: "object", description: "campo → fuente" },
      resumen_comercial: str("2–4 líneas para el informe: fortalezas, demanda y factores de valor"), criterios: str("Criterios de tasación para el informe"),
      comercialidad: int("1–5, solo con fundamento"), comercialidad_txt: str("Etiqueta, p. ej. 'BUENA COMERCIALIDAD'"), alcance: str("Alcance y supuestos"),
    }, ["marca", "modelo", "anio"]),
    run: (a, autor) => callJson("api_nom_tasacion_crear", [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "nom_tasacion_actualizar",
    description: "Actualiza la ficha o los textos de una tasación en borrador/calculada (incluye analisis_comparables). Cambiar datos del auto la devuelve a borrador hasta recalcular. Una tasación aprobada o enviada no se modifica: se pide nueva versión en la app.",
    inputSchema: s({ id: str("ID de la tasación"), cambios: { type: "object", description: "Mismos campos que nom_tasacion_crear + analisis_comparables, cobertura, mostrar_patente" } }, ["id", "cambios"]),
    run: (a, autor) => callJson("api_nom_tasacion_actualizar", [a.id, "uuid"], [a.cambios ?? {}, "jsonb"], [autor, "text"]),
  },
  {
    name: "nom_registrar_mercado",
    description: "Registra UNA búsqueda de mercado ejecutada AHORA y los avisos encontrados (idealmente 8–15 por tasación). Solo avisos reales con URL directa que hayas abierto: nunca inventes URL, precio, km ni versión. verificacion='verificado_activo' solo si abriste el aviso y muestra el precio y que sigue publicado; si no, 'no_verificado'; 'caido' si ya no existe. version_match: 'misma' (misma variante), 'equivalente' (misma variante con otro nombre comercial), 'distinta' u 'indeterminada' (el aviso no dice la versión). condicion: contado | financiamiento (precio sujeto a crédito) | bono_0km | liquidacion | remate | siniestro | otro. En 'evidencia' pega el extracto de la página (título, precio, km, versión) tal como lo viste. 'diferencias' es una línea para el cliente (p. ej. 'Un año más nuevo y 20.000 km menos').",
    inputSchema: s({
      tasacion_id: str("ID de la tasación"),
      portal: str("chileautos | mercadolibre | yapo | automotora | otro"), consulta: str("Consulta o filtros usados"), url_busqueda: str("URL de la búsqueda"),
      resultados_n: int("Resultados que mostró el portal"), notas: str(""),
      avisos: { type: "array", items: s({
        url: str("URL directa del aviso"), titulo: str(""), portal: str(""), marca: str(""), modelo: str(""), version_txt: str("Versión tal como la dice el aviso"),
        version_match: { type: "string", enum: ["misma", "equivalente", "distinta", "indeterminada"] },
        anio: int(""), km: int(""), precio: int("CLP publicado"), transmision: str(""), traccion: str(""), combustible: str(""), carroceria: str(""),
        region: str(""), comuna: str(""), vendedor_tipo: { type: "string", enum: ["particular", "automotora", "rent_a_car", "concesionario", "otro"] }, vendedor_nombre: str(""),
        condicion: { type: "string", enum: ["contado", "financiamiento", "bono_0km", "liquidacion", "remate", "siniestro", "otro"] },
        verificacion: { type: "string", enum: ["verificado_activo", "no_verificado", "caido"] }, evidencia: str("Extracto del aviso"),
        diferencias: str("Diferencia principal vs. el auto tasado, para el informe"), incluido: { type: "boolean" }, motivo_tasador: str(""),
      }, ["url"]) },
    }, ["tasacion_id", "portal", "avisos"]),
    run: (a, autor) => callJson("api_nom_registrar_mercado", [a.tasacion_id, "uuid"], [a, "jsonb"], [autor, "text"]),
  },
  {
    name: "nom_tasacion_calcular",
    description: "Calcula la tasación con los avisos registrados: depura (versión, transmisión, tracción, combustible, año, siniestro/remate/caído/no verificado, atípicos), ajusta por año y km con parámetros configurables, y entrega rango de oferta, valor comercial, precio de publicación, rango de cierre, confianza y advertencias. Con menos de 3 comparables válidos o versión sin confirmar queda como pre-estimación. No aprueba ni envía nada.",
    inputSchema: s({ id: str("ID de la tasación") }, ["id"]),
    run: (a, autor) => callJson("api_nom_tasacion_calcular", [a.id, "uuid"], [autor, "text"]),
  },
  {
    name: "nom_tasacion_ver",
    description: "Ficha completa de una tasación: vehículo, búsquedas, avisos con motivo de inclusión/exclusión, resultado, ajustes, aprobaciones, envíos y el payload exacto que verá el cliente ('informe'). La parte interna (precio pretendido, toma, comisión) solo aparece con permiso nom_interno.",
    inputSchema: s({ id: str("ID de la tasación") }, ["id"]),
    run: (a) => callJson("api_nom_tasacion", [a.id, "uuid"], [a.__interna === true, "boolean"]),
  },
  {
    name: "nom_interna_guardar",
    description: "Guarda la parte INTERNA de NOM de una tasación (nunca llega al cliente): precio pretendido por el cliente, urgencia, precio de toma, costos, comisión propuesta, riesgo, rotación estimada, modalidad recomendada y notas de negociación. Requiere permiso nom_interno.",
    inputSchema: s({ id: str("ID de la tasación"), interna: s({
      precio_pretendido_cliente: int(""), urgencia: str(""), precio_toma: int(""), costo_acondicionamiento: int(""), costos_comercializacion: int(""),
      comision_pct: { type: "number" }, comision_monto: int(""), riesgo: str(""), rotacion_dias_est: int(""),
      modalidad_recomendada: { type: "string", enum: ["consignacion_virtual", "consignacion_custodia", "compra_directa", "no_recomendable"] }, notas_negociacion: str(""),
    }) }, ["id", "interna"]),
    run: (a, autor) => callJson("api_nom_interna_guardar", [a.id, "uuid"], [a.interna ?? {}, "jsonb"], [autor, "text"]),
  },
];
const byName = new Map(TOOLS.map((t) => [t.name, t]));
// Herramientas que además exigen el permiso «nom_interno» (o «*»)
const REQUIERE_INTERNO = new Set(["nom_interna_guardar"]);

// ---------- auth ----------
async function sha256(t: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function auth(key: string | null) {
  if (!key) return null;
  const rows = await sql`update core.api_claves set ultimo_uso = now() where hash = ${await sha256(key)} and activo returning nombre, permisos`;
  return rows[0] ? { autor: rows[0].nombre as string, permisos: rows[0].permisos as string[] } : null;
}
const allowed = (perms: string[], tool: string) =>
  (perms.includes("*") || perms.includes(tool) || (tool.startsWith("nom_") && perms.includes("nom_tasador"))) &&
  (!REQUIERE_INTERNO.has(tool) || perms.includes("*") || perms.includes("nom_interno"));
const conPermisos = (tool: string, args: any, perms: string[]) =>
  tool === "nom_tasacion_ver" ? { ...args, __interna: perms.includes("*") || perms.includes("nom_interno") } : args;

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, x-api-key, authorization, mcp-session-id, mcp-protocol-version",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...cors, ...extra } });

const errMsg = (e: unknown) => {
  const m = String((e as any)?.message ?? e);
  return m.replace(/^.*ERROR:\s*/s, "");
};

// ---------- MCP (Streamable HTTP, respuestas JSON) ----------
async function mcp(req: Request, ident: { autor: string; permisos: string[] }) {
  if (req.method === "GET") return new Response("Use POST", { status: 405, headers: cors });
  const msg = await req.json();
  const handle = async (m: any) => {
    const id = m.id;
    if (id === undefined || id === null) return null; // notificación
    try {
      switch (m.method) {
        case "initialize":
          return { jsonrpc: "2.0", id, result: {
            protocolVersion: m.params?.protocolVersion ?? "2025-06-18",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "carclass-core", version: VERSION },
            instructions: "Carclass Core: base única del holding Carclass Group. Solo BlackGPS (y somosB2B) es B2B; Carclass, Carwash.hf y NOM son B2C con leads por WhatsApp, Meta y Google. Lee la herramienta 'procesos' antes de atender leads o mover etapas. Montos en CLP con IVA incluido. Busca antes de crear. No registres ventas ni costos sin confirmación explícita de Felipe.",
          } };
        case "ping": return { jsonrpc: "2.0", id, result: {} };
        case "tools/list":
          return { jsonrpc: "2.0", id, result: { tools: TOOLS.filter((t) => allowed(ident.permisos, t.name))
            .map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) } };
        case "tools/call": {
          const t = byName.get(m.params?.name);
          if (!t || !allowed(ident.permisos, t.name)) return { jsonrpc: "2.0", id, error: { code: -32602, message: "Herramienta no disponible" } };
          try {
            const out = await t.run(conPermisos(t.name, m.params?.arguments ?? {}, ident.permisos), ident.autor);
            return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(out) }] } };
          } catch (e) {
            return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: errMsg(e) }] } };
          }
        }
        default: return { jsonrpc: "2.0", id, error: { code: -32601, message: "Método no soportado" } };
      }
    } catch (e) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: errMsg(e) } };
    }
  };
  if (Array.isArray(msg)) {
    const out = (await Promise.all(msg.map(handle))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  const out = await handle(msg);
  return out ? json(out) : new Response(null, { status: 202, headers: cors });
}

// ---------- servidor ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("core-api");
  const route = parts.slice(i + 1); // p.ej. ["mcp","<token>"] o ["empresas"]

  try {
    if (route[0] === "mcp") {
      const ident = await auth(route[1] ?? req.headers.get("x-api-key"));
      if (!ident) return json({ error: "No autorizado" }, 401);
      return await mcp(req, ident);
    }

    if (route.length === 0 || route[0] === "salud") return json({ ok: true, servicio: "carclass-core", version: VERSION });

    // Formulario web público (landing). Clave limitada a lead_web:<unidad>; acepta JSON o formulario.
    if (route[0] === "lead-web" && req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      let f: Record<string, any> = {};
      if (ct.includes("application/json")) f = await req.json();
      else { const fd = await req.formData(); fd.forEach((v, k) => (f[k] = String(v))); }
      const key = req.headers.get("x-api-key") || url.searchParams.get("k") || f.k;
      const ident = await auth(key);
      const unidad = String(f.unidad || "blackgps");
      if (!ident || !ident.permisos.includes("lead_web:" + unidad)) return json({ error: "No autorizado" }, 401);
      if (f.website || f.empresa_web) return json({ ok: true }); // trampa anti-spam: los humanos no llenan este campo
      const tel = String(f.telefono || f.phone || "").trim(), mail = String(f.email || "").trim();
      if (!tel && !mail) return json({ error: "Falta teléfono o correo" }, 400);
      if (String(f.nombre || "").length > 120 || String(f.mensaje || "").length > 2000) return json({ error: "Datos demasiado largos" }, 400);
      const flota = parseInt(String(f.flota || f.vehiculos || "").replace(/\D/g, ""), 10);
      const r: any = await callJson("api_registrar_lead", [{
        unidad, canal: "web", nombre: f.nombre || f.name, telefono: tel, email: mail, empresa: f.empresa || f.company, rut: f.rut,
        cargo: f.cargo, flota: Number.isFinite(flota) ? flota : null, comuna: f.comuna, region: f.region,
        origen: f.origen || "Landing BlackGPS", campana: f.utm_campaign || f.campana, anuncio: f.utm_content || f.anuncio,
        interes: f.interes, mensaje: [f.mensaje, f.utm_source ? `utm_source=${f.utm_source}` : "", f.utm_medium ? `utm_medium=${f.utm_medium}` : ""].filter(Boolean).join(" · "),
      }, "jsonb"], [ident.autor, "text"]);
      if (f.redirect && /^https:\/\//.test(String(f.redirect))) return new Response(null, { status: 303, headers: { location: String(f.redirect), ...cors } });
      return json({ ok: true, nuevo: r?.nueva ?? true });
    }

    const ident = await auth(req.headers.get("x-api-key"));
    if (!ident) return json({ error: "No autorizado. Envía la clave en el encabezado X-API-Key." }, 401);

    // REST para ChatGPT
    if (route[0] === "empresas" && req.method === "GET") {
      if (!allowed(ident.permisos, "buscar_empresa")) return json({ error: "Sin permiso" }, 403);
      const q = url.searchParams.get("q") ?? "";
      if (!q.trim()) return json({ error: "Falta el parámetro q" }, 400);
      return json({ resultados: await byName.get("buscar_empresa")!.run({ q, limite: url.searchParams.get("limite") ?? 5 }, ident.autor) });
    }
    if (route[0] === "analisis" && req.method === "POST") {
      if (!allowed(ident.permisos, "registrar_analisis")) return json({ error: "Sin permiso" }, 403);
      return json(await byName.get("registrar_analisis")!.run(await req.json(), ident.autor));
    }
    if (route[0] === "herramientas" && route[1] && req.method === "POST") {
      const t = byName.get(route[1]);
      if (!t || !allowed(ident.permisos, t.name)) return json({ error: "Herramienta no disponible" }, 404);
      return json(await t.run(conPermisos(t.name, await req.json(), ident.permisos), ident.autor));
    }
    return json({ error: "Ruta no encontrada" }, 404);
  } catch (e) {
    return json({ error: errMsg(e) }, 400);
  }
});
