// Simulador del asesor (antes Edge Function wa-simular): conversaciones de prueba sin tocar clientes ni la base.
// Mismas herramientas en modo simulación (solo leen Core) y mismo cerebro. Guarda cada conversación en qa.simulaciones.
// POST /wa-agente/simular con cabecera x-agente-secret y cuerpo
//   { "lote": "v54", "prompt_clave"?: "agente_prompt_prueba", "escenarios": [ { "id", "titulo", "esperado", "unidad"?, "nombre"?, "origen"?, "turnos": [...] } ] }
// prompt_clave: clave de wa.config con un prompt de prueba (solo claves que empiezan con «agente_prompt»); por defecto, el de producción.
import type Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type postgres from "npm:postgres@3.4.4";
import { pensar, MODELO_POR_DEFECTO, type Contexto } from "./cerebro.ts";
import { HERRAMIENTAS, crearEjecutor, type Conversacion } from "./herramientas.ts";
import { promptSistema } from "./prompt.ts";

type Sql = ReturnType<typeof postgres>;
const TZ = "America/Santiago";
type Escenario = { id: string; titulo?: string; esperado?: string; unidad?: string | null; nombre?: string | null; origen?: string | null; turnos: string[]; sim_nom?: { desde_turno: number; estado: unknown }; activas?: string[] };

const ahoraChile = () =>
  new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

async function correr(sql: Sql, client: Anthropic, lote: string, e: Escenario, cfg: Record<string, string>, system: string) {
  const transcripcion: { rol: string; texto: string }[] = [];
  const acciones: unknown[] = [];
  let costo = 0;
  try {
    const conv: Conversacion = { id: crypto.randomUUID(), estado: e.unidad ? "lead" : "sin_unidad", unidad: e.unidad ?? null, flujo: null,
      oportunidad_id: null, empresa_id: null, nombre: e.nombre ?? null, telefono_norm: null, ficha: {} };
    const sim = conv as any;
    if (e.sim_nom) sim.sim_nom = e.sim_nom;
    sim.sim_turno = 0;
    const activas = e.activas ?? ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && !["apagado", "observar"].includes(cfg[`agente_modo_${u}`]));
    const historial: Anthropic.MessageParam[] = [];
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

export async function simular(sql: Sql, client: Anthropic, cfg: Record<string, string>, req: Request): Promise<Response> {
  const body = await req.json().catch(() => null) as { lote?: string; prompt_clave?: string; escenarios?: Escenario[] } | null;
  const escenarios = (body?.escenarios ?? []).filter((e) => e?.id && Array.isArray(e.turnos) && e.turnos.length).slice(0, 12);
  if (!escenarios.length) return Response.json({ ok: false, error: "sin escenarios" }, { status: 400 });
  const lote = body?.lote ?? new Date().toISOString();
  let system: string;
  if (body?.prompt_clave) {
    if (!/^agente_prompt[a-z_]*$/.test(body.prompt_clave) || !cfg[body.prompt_clave] || cfg[body.prompt_clave].length < 1000) {
      return Response.json({ ok: false, error: "prompt_clave inválida o vacía" }, { status: 400 });
    }
    system = cfg[body.prompt_clave];
  } else system = await promptSistema(sql);
  // @ts-ignore EdgeRuntime existe en Supabase Edge Functions
  EdgeRuntime.waitUntil(Promise.all(escenarios.map((e) => correr(sql, client, lote, e, cfg, system))));
  return Response.json({ ok: true, lote, escenarios: escenarios.length }, { status: 202 });
}
