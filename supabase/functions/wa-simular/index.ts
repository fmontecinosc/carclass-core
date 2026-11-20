// wa-simular — pruebas del asesor de WhatsApp sin tocar clientes ni la base.
// Usa el mismo prompt (wa.config.agente_prompt), las mismas herramientas en modo simulación (solo leen Core)
// y el mismo cerebro que wa-agente. Guarda cada conversación simulada en qa.simulaciones.
// Llamada: POST con cabecera x-agente-secret (= wa.config.agente_secret) y cuerpo
//   { "lote": "2026-11-18-a", "prompt_url"?: "https://raw.githubusercontent.com/fmontecinosc/carclass-core/<sha>/prompts/asesor-sistema.md",
//     "escenarios": [ { "id", "titulo", "esperado", "unidad"?, "nombre"?, "origen"?, "turnos": ["msg 1", "msg 2"] } ] }
// Los módulos del asesor se importan del repo (supabase/functions/wa-agente en un commit fijo): una sola fuente.
// Con prompt_url se prueba un prompt del repo antes de subirlo a wa.config (solo URLs de este repositorio).
// Responde 202 de inmediato y procesa en segundo plano.
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import postgres from "npm:postgres@3.4.4";
import { pensar, MODELO_POR_DEFECTO, type Contexto } from "https://raw.githubusercontent.com/fmontecinosc/carclass-core/ea591f0b7f33d3a19035114739350c5d805af38d/supabase/functions/wa-agente/cerebro.ts";
import { HERRAMIENTAS, crearEjecutor, type Conversacion } from "https://raw.githubusercontent.com/fmontecinosc/carclass-core/ea591f0b7f33d3a19035114739350c5d805af38d/supabase/functions/wa-agente/herramientas.ts";
import { promptSistema } from "https://raw.githubusercontent.com/fmontecinosc/carclass-core/ea591f0b7f33d3a19035114739350c5d805af38d/supabase/functions/wa-agente/prompt.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 4, idle_timeout: 20 });
const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
const TZ = "America/Santiago";

// sim_nom: estado NOM ficticio desde un turno (1 = primer mensaje del cliente), p. ej. tasación ya enviada para probar el agendamiento
type Escenario = { id: string; titulo?: string; esperado?: string; unidad?: string | null; nombre?: string | null; origen?: string | null; turnos: string[]; sim_nom?: { desde_turno: number; estado: unknown }; activas?: string[] };

function seguroIgual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const ahoraChile = () =>
  new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

const PROMPT_REPO = "https://raw.githubusercontent.com/fmontecinosc/carclass-core/";

async function correr(lote: string, e: Escenario, cfg: Record<string, string>, promptOverride: string | null) {
  const transcripcion: { rol: string; texto: string }[] = [];
  const acciones: unknown[] = [];
  let costo = 0;
  try {
    const conv: Conversacion = { id: crypto.randomUUID(), estado: e.unidad ? "lead" : "sin_unidad", unidad: e.unidad ?? null, flujo: null,
      oportunidad_id: null, empresa_id: null, nombre: e.nombre ?? null, telefono_norm: null, ficha: {} };
    const sim = conv as any;
    if (e.sim_nom) sim.sim_nom = e.sim_nom;
    sim.sim_turno = 0;
    // activas: permite probar una unidad como si estuviera activa (p. ej. NOM antes de encenderla), sin tocar los modos reales
    const activas = e.activas ?? ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && !["apagado", "observar"].includes(cfg[`agente_modo_${u}`]));
    const historial: Anthropic.MessageParam[] = [];
    const system = promptOverride ?? await promptSistema(sql);
    for (const msg of e.turnos) {
      sim.sim_turno += 1;
      historial.push({ role: "user", content: [{ type: "text", text: msg }] });
      transcripcion.push({ rol: "cliente", texto: msg });
      const contexto: Contexto = {
        ahora: ahoraChile(), modo: "activo", unidades_activas: activas, unidad: conv.unidad, etapa: null,
        nombre: conv.nombre, ficha: conv.ficha ?? {}, origen: e.origen ?? "WhatsApp directo",
        ventana_hasta: new Date(Date.now() + 86_400_000).toLocaleString("es-CL", { timeZone: TZ }),
      };
      const salida = await pensar({ client, modelo: cfg.agente_modelo || MODELO_POR_DEFECTO, system, herramientas: HERRAMIENTAS, historial, contexto,
        ejecutar: crearEjecutor({ sql, conv, modo: "activo", simular: true }) });
      costo += salida.uso.costo_usd;
      for (const a of salida.acciones) acciones.push({ turno: transcripcion.length, ...(a as any) });
      const texto = salida.silencioso ? "[el asesor no responde: lo trata como chat personal]" : (salida.mensajes.join("\n---\n") || "[sin respuesta]");
      transcripcion.push({ rol: "asesor", texto });
      historial.push({ role: "assistant", content: [{ type: "text", text: texto }] });
    }
    await sql`insert into qa.simulaciones (lote, escenario, titulo, esperado, transcripcion, acciones, costo_usd)
              values (${lote}, ${e.id}, ${e.titulo ?? null}, ${e.esperado ?? null}, ${sql.json(transcripcion as any)}, ${sql.json(acciones as any)}, ${costo})`;
  } catch (err) {
    await sql`insert into qa.simulaciones (lote, escenario, titulo, esperado, transcripcion, acciones, costo_usd, error)
              values (${lote}, ${e.id}, ${e.titulo ?? null}, ${e.esperado ?? null}, ${sql.json(transcripcion as any)}, ${sql.json(acciones as any)}, ${costo}, ${String((err as Error)?.message ?? err)})`;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  const rows = await sql`select clave, valor from wa.config`;
  const cfg: Record<string, string> = Object.fromEntries(rows.map((r: any) => [r.clave, r.valor]));
  if (!seguroIgual(req.headers.get("x-agente-secret") ?? "", cfg.agente_secret ?? "")) return new Response("No autorizado", { status: 401 });
  const body = await req.json().catch(() => null) as { lote?: string; prompt_url?: string; escenarios?: Escenario[] } | null;
  const escenarios = (body?.escenarios ?? []).filter((e) => e?.id && Array.isArray(e.turnos) && e.turnos.length).slice(0, 12);
  if (!escenarios.length) return Response.json({ ok: false, error: "sin escenarios" }, { status: 400 });
  const lote = body?.lote ?? new Date().toISOString();
  let promptOverride: string | null = null;
  if (body?.prompt_url) {
    if (!body.prompt_url.startsWith(PROMPT_REPO)) return Response.json({ ok: false, error: "prompt_url debe ser de este repositorio" }, { status: 400 });
    const r = await fetch(body.prompt_url);
    promptOverride = r.ok ? await r.text() : null;
    if (!promptOverride || promptOverride.length < 1000) return Response.json({ ok: false, error: `no pude leer el prompt (${r.status})` }, { status: 400 });
  }
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(Promise.all(escenarios.map((e) => correr(lote, e, cfg, promptOverride))));
  return Response.json({ ok: true, lote, escenarios: escenarios.length }, { status: 202 });
});
