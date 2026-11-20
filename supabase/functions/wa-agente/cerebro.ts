// Cerebro del asesor: (contexto, historial) → { mensajes[], acciones[] }.
// No sabe de WhatsApp ni de la base: recibe el cliente de Claude, las herramientas y un ejecutor.
// Así lo usan igual wa-agente (producción) y scripts/eval.ts (simulación).
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type { Accion, Resultado } from "./herramientas.ts";

export const MODELO_POR_DEFECTO = "claude-sonnet-5-5";
// Claude Sonnet 5.5 (USD por millón de tokens)
const PRECIOS = { input: 2.0, output: 10.0, cache_read: 0.1, cache_write: 2.5 };

export interface Contexto {
  ahora: string;                 // fecha y hora legible en America/Santiago
  modo: string;                  // observar | borrador | activo | simulacion
  unidades_activas: string[];
  unidad: string | null;
  etapa: string | null;
  nombre: string | null;
  ficha: Record<string, unknown>;
  origen: string;                // anuncio / directo + texto del anuncio
  ventana_hasta: string | null;
}

export interface EntradaCerebro {
  client: Anthropic;
  modelo?: string;
  system: string;
  herramientas: Anthropic.Tool[];
  historial: Anthropic.MessageParam[];   // termina en un turno del cliente
  contexto: Contexto;
  ejecutar: (nombre: string, input: unknown) => Promise<Resultado>;
  maxIteraciones?: number;
}

export interface SalidaCerebro {
  mensajes: string[];
  acciones: Accion[];
  silencioso: boolean;
  iteraciones: number;
  stop_reason: string | null;
  uso: { input: number; output: number; cache_read: number; cache_write: number; costo_usd: number };
  modelo: string;
}

export function textoContexto(c: Contexto): string {
  return [
    "[Contexto del sistema — no lo escribió el cliente]",
    `Ahora (Chile): ${c.ahora}`,
    `Unidades activas: ${c.unidades_activas.join(", ") || "ninguna"}`,
    `Unidad asignada: ${c.unidad ?? "sin asignar"} · Etapa: ${c.etapa ?? "—"}`,
    `Nombre de WhatsApp: ${c.nombre ?? "—"}`,
    `Origen: ${c.origen}`,
    `Ficha: ${JSON.stringify(c.ficha ?? {})}`,
    `Ventana de 24 h abierta hasta: ${c.ventana_hasta ?? "—"}`,
    "[Fin del contexto]",
  ].join("\n");
}

// Inserta el contexto como primer bloque del último turno del cliente (no rompe el prefijo cacheado)
function conContexto(historial: Anthropic.MessageParam[], ctx: string): Anthropic.MessageParam[] {
  const h = [...historial];
  const ult = h[h.length - 1];
  if (!ult || ult.role !== "user") throw new Error("El historial debe terminar en un mensaje del cliente");
  const bloques: Anthropic.ContentBlockParam[] = typeof ult.content === "string"
    ? [{ type: "text", text: ult.content }]
    : [...ult.content];
  h[h.length - 1] = { role: "user", content: [{ type: "text", text: ctx }, ...bloques] };
  return h;
}

export function separarBurbujas(texto: string): string[] {
  return texto
    .split(/\n\s*-{3,}\s*\n/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 3);
}

export async function pensar(e: EntradaCerebro): Promise<SalidaCerebro> {
  const modelo = e.modelo ?? MODELO_POR_DEFECTO;
  const max = e.maxIteraciones ?? 8;
  const mensajes: Anthropic.Beta.BetaMessageParam[] = conContexto(e.historial, textoContexto(e.contexto)) as any;
  const acciones: Accion[] = [];
  const uso = { input: 0, output: 0, cache_read: 0, cache_write: 0, costo_usd: 0 };
  let stop: string | null = null;
  let textoFinal = "";
  let iter = 0;

  for (; iter < max; iter++) {
    const resp = await e.client.beta.messages.create({
      model: modelo,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      // Si el modelo declina por seguridad, la API reintenta con el modelo alternativo que corresponda
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: e.system, cache_control: { type: "ephemeral" } }],
      tools: e.herramientas as any,
      messages: mensajes,
    } as any) as Anthropic.Beta.BetaMessage;

    const u: any = resp.usage ?? {};
    uso.input += u.input_tokens ?? 0;
    uso.output += u.output_tokens ?? 0;
    uso.cache_read += u.cache_read_input_tokens ?? 0;
    uso.cache_write += u.cache_creation_input_tokens ?? 0;
    stop = resp.stop_reason ?? null;

    if (resp.stop_reason === "refusal") break;

    mensajes.push({ role: "assistant", content: resp.content as any });

    if (resp.stop_reason === "pause_turn") continue;

    const llamadas = resp.content.filter((b: any) => b.type === "tool_use") as any[];
    if (llamadas.length === 0 || resp.stop_reason !== "tool_use") {
      textoFinal = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      break;
    }

    const resultados: any[] = [];
    for (const ll of llamadas) {
      const r = await e.ejecutar(ll.name, ll.input);
      acciones.push({ herramienta: ll.name, input: ll.input, resultado: r });
      resultados.push({
        type: "tool_result",
        tool_use_id: ll.id,
        content: JSON.stringify(r.ok ? (r.data ?? { ok: true }) : { error: r.error }),
        ...(r.ok ? {} : { is_error: true }),
      });
    }
    mensajes.push({ role: "user", content: resultados });
  }

  uso.costo_usd = (uso.input * PRECIOS.input + uso.output * PRECIOS.output + uso.cache_read * PRECIOS.cache_read + uso.cache_write * PRECIOS.cache_write) / 1e6;
  const silencioso = acciones.some((a) => a.herramienta === "marcar_personal" && a.resultado.ok) ||
    acciones.some((a) => a.herramienta === "traspasar_humano" && /posible personal/i.test(String((a.input as any)?.motivo ?? "")));

  return {
    mensajes: silencioso || stop === "refusal" ? [] : separarBurbujas(textoFinal),
    acciones,
    silencioso,
    iteraciones: iter + 1,
    stop_reason: stop,
    uso: { ...uso, costo_usd: Math.round(uso.costo_usd * 1e5) / 1e5 },
    modelo,
  };
}
