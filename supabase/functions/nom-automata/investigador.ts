// Investigación de mercado de una tasación NOM con Claude + búsqueda y lectura web (herramientas del servidor de Anthropic).
// Reglas: solo avisos abiertos y leídos; sin URL directa no hay aviso; nada se inventa. El cálculo lo hace la base (nom.calcular).
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";

export interface Vehiculo {
  marca: string; modelo: string; version: string | null; anio: number; km: number | null;
  transmision: string | null; combustible: string | null; traccion: string | null; comuna?: string | null;
}

export interface Hallazgo {
  busquedas: { portal: string; consulta: string; url_busqueda?: string; resultados_n?: number }[];
  avisos: Record<string, unknown>[];
  resumen_comercial: string;
  comercialidad: number;
  comercialidad_txt: string;
  analisis_comparables: string;
  notas_internas?: string;
}

const SISTEMA = `Eres el analista de mercado de Nor-Oriente Motors (NOM), consignación de autos usados en Chicureo, Santiago de Chile.
Tu trabajo: encontrar avisos VIGENTES de autos comparables publicados hoy en Chile y registrar exactamente lo que ves. Otro sistema hace el cálculo.

Cómo trabajas
1. Busca con web_search en Chileautos, Mercado Libre (autos.mercadolibre.cl / auto.mercadolibre.cl), Yapo y Kavak. Prioriza la Región Metropolitana.
   Comparable = misma marca y modelo, año ±2, idealmente misma versión, transmisión y combustible.
   Haz búsquedas que devuelvan avisos individuales, no solo listados: por ejemplo «<marca> <modelo> <año> <versión> automática chileautos», «<modelo> <año> mercadolibre Santiago», «<modelo> <año> kavak».
2. Abre con web_fetch las páginas de avisos individuales de Chileautos, Kavak y Yapo que aparezcan en los resultados.
   Mercado Libre NO se puede abrir: sus avisos regístralos directo desde el resultado de búsqueda (URL del aviso, "no_verificado").
   NUNCA uses web_fetch en listados ni páginas de búsqueda (URLs con /vehiculos?, /autos/, /buscar, filtros o varios autos): gastan lecturas y no verifican nada.
   Cada lectura va a UN aviso individual (por ejemplo chileautos.cl/vehiculos/detalles/…, yapo.cl/autos-usados/…/<número>, kavak.com/cl/…/<id>).
   Orden: primero haz las búsquedas y junta las URL individuales; después abre las 6 a 10 más parecidas al auto tasado (mismo año y versión, km cercano).
   Solo puedes abrir URLs que aparecieron en resultados de búsqueda. Si una falla, sigue con otra.
3. Registra TODOS los avisos comparables que encontraste, cada uno con la URL de su aviso individual (nunca la URL de un listado):
   - verificacion: "verificado_activo" solo si abriste la página del aviso, cargó, muestra precio y no dice vendido/pausado/finalizado;
     "caido" si dice vendido o ya no existe; "no_verificado" si solo lo viste en un listado o en el resultado de búsqueda (igual regístralo con lo que viste: Felipe lo revisa).
   - condicion: "financiamiento" si el precio exige crédito o es «precio con financiamiento»; "bono_0km", "liquidacion", "remate" o "siniestro" si corresponde; si no, "contado".
   - version_match frente a la versión declarada: "misma", "equivalente" (mismo motor y equipamiento similar), "distinta" o "indeterminada" (si no se declaró versión o el aviso no la dice).
   - evidencia: copia breve (máximo 300 caracteres) del texto donde aparecen precio, año y km, e indica si viene de la página del aviso o de un listado.
   - diferencias: en pocas palabras, en qué se diferencia del auto tasado (año, km, versión, equipamiento).
   - No registres avisos de otra versión de motor, otra tracción, otro combustible ni otra transmisión: no son comparables.
4. Si un portal solo te muestra listados (sin URL individual), registra igual cada auto que viste ahí: usa como url la página del listado o de búsqueda donde aparece, verificacion "no_verificado" y en evidencia copia título, año, km, precio y comuna tal como se ven. Nunca dejes autos comparables solo en notas_internas: todo comparable visto va en "avisos".
5. Apunta a 8–12 avisos registrados y al menos 3 verificados. Un aviso visto en un listado o en una búsqueda con su URL individual SÍ se registra (como "no_verificado"); no lo dejes solo en notas_internas. Si hay pocos, amplía a año ±2 y a otras regiones (indica la región). Nunca inventes un aviso, una URL ni una cifra.
6. Precios en pesos chilenos, enteros, sin puntos. Km enteros.
7. Trabajas por etapas: en cada etapa tienes pocas búsquedas y lecturas. Si se te acaban y aún te falta información, responde solo la palabra CONTINUAR (sin JSON) y en la etapa siguiente recibirás más. Cuando tengas suficiente, o cuando se te indique que no quedan herramientas, responde con el JSON final.

Al terminar, responde SOLO con un bloque \`\`\`json con esta forma:
{
  "busquedas": [{"portal": "chileautos", "consulta": "texto buscado", "url_busqueda": "https://…", "resultados_n": 12}],
  "avisos": [{"portal": "chileautos", "url": "https://…", "titulo": "…", "marca": "…", "modelo": "…", "version_txt": "…", "version_match": "misma",
              "anio": 2021, "km": 45000, "precio": 12990000, "transmision": "automatica", "traccion": "4x2", "combustible": "bencina",
              "region": "Metropolitana", "comuna": "Las Condes", "vendedor_tipo": "particular", "vendedor_nombre": "…", "condicion": "contado",
              "verificacion": "verificado_activo", "evidencia": "…", "diferencias": "…"}],
  "resumen_comercial": "2 o 3 frases sobrias para el cliente: cómo está el mercado de este modelo hoy (oferta, rango de precios observado, qué valora el comprador). Sin cifras internas ni comisiones.",
  "comercialidad": 1-5 (5 = se vende muy rápido),
  "comercialidad_txt": "una frase que explique la nota",
  "analisis_comparables": "3 a 5 frases: qué avisos pesan más y por qué, y qué ajustes de año, km o versión hay que considerar.",
  "notas_internas": "lo que Felipe debe saber y no va al cliente (avisos dudosos, versión por confirmar, dispersión)."
}
portal ∈ chileautos, mercadolibre, yapo, kavak, otro. vendedor_tipo ∈ particular, automotora, rent_a_car, concesionario, otro.
transmision ∈ manual, automatica. combustible ∈ bencina, diesel, hibrido, electrico.`;

const PRECIO = { input: 2.0, output: 10.0, cache_read: 0.1, cache_write: 2.5 }; // USD por millón (Sonnet 5.5)

export interface EstadoInv {
  mensajes: any[];
  uso: { input: number; output: number; cache_read: number; cache_write: number; busquedas: number; lecturas: number };
  vueltas: number;
}

// Un paso de la investigación: UNA llamada a Claude con un tope de herramientas por etapa (cabe holgado en el límite
// de tiempo de una Edge Function). El estado (conversación y uso) se guarda en la base y el cron sigue en el minuto siguiente.
export async function pasoInvestigacion(client: Anthropic, modelo: string, v: Vehiculo,
  opts: { maxBusquedas: number; maxLecturas: number; porEtapa: number; maxVueltas: number }, previo: EstadoInv | null,
): Promise<{ estado: EstadoInv; terminado: boolean; hallazgo?: Hallazgo; costo_usd: number }> {
  const est: EstadoInv = previo ?? {
    mensajes: [{ role: "user", content: [
      `Auto a tasar: ${v.marca} ${v.modelo}${v.version ? " " + v.version : ""}, año ${v.anio}${v.km != null ? `, ${v.km.toLocaleString("es-CL")} km` : ""}.`,
      v.transmision ? `Transmisión: ${v.transmision}.` : "",
      v.combustible ? `Combustible: ${v.combustible}.` : "",
      v.traccion ? `Tracción: ${v.traccion}.` : "",
      `Fecha de hoy: ${new Date().toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}.`,
      `Tienes en total ${opts.maxBusquedas} búsquedas y ${opts.maxLecturas} lecturas, repartidas en etapas. Busca, abre y registra los comparables vigentes.`,
    ].filter(Boolean).join("\n") }],
    uso: { input: 0, output: 0, cache_read: 0, cache_write: 0, busquedas: 0, lecturas: 0 },
    vueltas: 0,
  };
  const quedanB = Math.max(0, opts.maxBusquedas - est.uso.busquedas);
  const quedanL = Math.max(0, opts.maxLecturas - est.uso.lecturas);
  const sinHerramientas = (quedanB === 0 && quedanL === 0) || est.vueltas + 1 >= opts.maxVueltas;
  // Las herramientas siempre se declaran (el historial tiene bloques de ellas); en la etapa final no se pueden usar
  const tools: any[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: Math.max(1, Math.min(opts.porEtapa, quedanB)),
      user_location: { type: "approximate", city: "Santiago", region: "Región Metropolitana", country: "CL", timezone: "America/Santiago" } },
    // Mercado Libre bloquea la lectura automática: sus avisos se registran desde la búsqueda
    { type: "web_fetch_20260209", name: "web_fetch", max_uses: Math.max(1, Math.min(opts.porEtapa, quedanL)), max_content_tokens: 6000,
      blocked_domains: ["mercadolibre.cl"] },
  ];
  const r: any = await client.beta.messages.create({
    model: modelo,
    max_tokens: 12000,
    output_config: { effort: "medium" },
    cache_control: { type: "ephemeral" },
    system: SISTEMA,
    tools,
    ...(sinHerramientas || quedanB === 0 && quedanL === 0 ? { tool_choice: { type: "none" } } : {}),
    messages: est.mensajes,
  } as any);
  const u = r.usage ?? {};
  est.uso.input += u.input_tokens ?? 0; est.uso.output += u.output_tokens ?? 0;
  est.uso.cache_read += u.cache_read_input_tokens ?? 0; est.uso.cache_write += u.cache_creation_input_tokens ?? 0;
  est.uso.busquedas += u.server_tool_use?.web_search_requests ?? 0;
  est.uso.lecturas += u.server_tool_use?.web_fetch_requests ?? 0;
  est.vueltas += 1;
  est.mensajes.push({ role: "assistant", content: r.content });
  const costo_usd = Math.round(((est.uso.input * PRECIO.input + est.uso.output * PRECIO.output + est.uso.cache_read * PRECIO.cache_read
    + est.uso.cache_write * PRECIO.cache_write) / 1e6 + est.uso.busquedas * 0.01) * 1e4) / 1e4;

  if (r.stop_reason === "pause_turn") return { estado: est, terminado: false, costo_usd }; // la API pausó: se retoma tal cual
  const texto = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  const m = texto.match(/```json\s*([\s\S]*?)```/) ?? texto.match(/(\{[\s\S]*\})\s*$/);
  if (m) {
    const h = JSON.parse(m[1]) as Hallazgo;
    if (!Array.isArray(h.avisos)) throw new Error("Resultado sin avisos");
    return { estado: est, terminado: true, hallazgo: h, costo_usd };
  }
  if (est.vueltas >= opts.maxVueltas + 1) throw new Error("El analista no entregó el JSON de resultados");
  const b = Math.max(0, opts.maxBusquedas - est.uso.busquedas), l = Math.max(0, opts.maxLecturas - est.uso.lecturas);
  est.mensajes.push({ role: "user", content: (b > 0 || l > 0) && est.vueltas + 1 < opts.maxVueltas
    ? `Sigue. Te quedan ${b} búsquedas y ${l} lecturas en total (hasta ${opts.porEtapa} de cada una en esta etapa). Cuando tengas suficiente, entrega el JSON final.`
    : "Ya no quedan búsquedas ni lecturas. Entrega ahora el JSON final con todo lo que encontraste (incluye como avisos los autos vistos en listados)." });
  return { estado: est, terminado: false, costo_usd };
}

// Limpieza mínima antes de entregar a la base (los CHECK de nom.mercado_avisos son la última palabra)
const PORTALES = new Set(["chileautos", "mercadolibre", "yapo", "kavak", "otro"]);
const VEND = new Set(["particular", "automotora", "rent_a_car", "concesionario", "otro"]);
const COND = new Set(["contado", "financiamiento", "bono_0km", "liquidacion", "remate", "siniestro", "otro"]);
const VERIF = new Set(["verificado_activo", "no_verificado", "caido"]);
const MATCH = new Set(["misma", "equivalente", "distinta", "indeterminada"]);
const num = (x: unknown) => { const n = Number(String(x ?? "").replace(/[^\d]/g, "")); return Number.isFinite(n) && n > 0 ? n : null; };

export function limpiarAviso(a: any) {
  const url = String(a.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    portal: PORTALES.has(a.portal) ? a.portal : "otro",
    url, titulo: a.titulo ?? null, marca: a.marca ?? null, modelo: a.modelo ?? null, version_txt: a.version_txt ?? null,
    version_match: MATCH.has(a.version_match) ? a.version_match : "indeterminada",
    anio: num(a.anio), km: a.km === 0 ? 0 : num(a.km), precio: num(a.precio),
    transmision: a.transmision ?? null, traccion: a.traccion ?? null, combustible: a.combustible ?? null,
    region: a.region ?? null, comuna: a.comuna ?? null,
    vendedor_tipo: VEND.has(a.vendedor_tipo) ? a.vendedor_tipo : null, vendedor_nombre: a.vendedor_nombre ?? null,
    condicion: COND.has(a.condicion) ? a.condicion : "contado",
    verificacion: VERIF.has(a.verificacion) ? a.verificacion : "no_verificado",
    evidencia: a.evidencia ? String(a.evidencia).slice(0, 600) : null,
    diferencias: a.diferencias ?? null,
  };
}
