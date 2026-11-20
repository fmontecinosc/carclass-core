// wa-agente — toma conversaciones de wa.cola_agente (debounce 25 s), arma contexto, llama a Claude con herramientas
// y, según el modo de la unidad, guarda un borrador (borrador), envía por Kapso (activo) o solo registra (observar).
// La invoca pg_cron cada 10 s con la cabecera x-agente-secret (= wa.config.agente_secret).
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import postgres from "npm:postgres@3.4.4";
import { pensar, MODELO_POR_DEFECTO, type Contexto } from "./cerebro.ts";
import { HERRAMIENTAS, crearEjecutor, type Conversacion } from "./herramientas.ts";
import { promptSistema } from "./prompt.ts";
import { enviarTexto, descargarMedia, pausa } from "./kapso.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });
const client = new Anthropic({ maxRetries: 2, timeout: 90_000 });
const TZ = "America/Santiago";
const UNIDADES_AGENTE = new Set(["carclass", "nom", "blackgps", "carwash"]);
const MAX_INTENTOS = 3;

async function config(): Promise<Record<string, string>> {
  const rows = await sql`select clave, valor from wa.config`;
  return Object.fromEntries(rows.map((r: any) => [r.clave, r.valor]));
}

function seguroIgual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const ahoraChile = () =>
  new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

// Historial → mensajes para Claude (últimos 30). Imágenes y PDF del último turno del cliente van como bloques.
async function armarHistorial(convId: string): Promise<Anthropic.MessageParam[] | null> {
  const filas = await sql`
    select * from (
      select direccion, tipo, texto, media, enviado_en from wa.mensajes
      where conversacion_id = ${convId}::uuid order by enviado_en desc limit 30
    ) t order by enviado_en asc`;
  if (filas.length === 0 || filas[filas.length - 1].direccion !== "entrante") return null;

  // Índice desde donde empieza el último bloque de mensajes del cliente
  let inicioUltimo = filas.length - 1;
  while (inicioUltimo > 0 && filas[inicioUltimo - 1].direccion === "entrante") inicioUltimo--;

  const out: Anthropic.MessageParam[] = [];
  for (let i = 0; i < filas.length; i++) {
    const f: any = filas[i];
    const rol: "user" | "assistant" = f.direccion === "entrante" ? "user" : "assistant";
    const bloques: Anthropic.ContentBlockParam[] = [];
    if (rol === "assistant" && f.direccion === "saliente_app") bloques.push({ type: "text", text: "[Felipe respondió desde su celular]" });

    const esUltimo = i >= inicioUltimo;
    if (rol === "user" && esUltimo && f.media?.id && (f.tipo === "image" || (f.tipo === "document" && String(f.media?.mime_type ?? "").includes("pdf")))) {
      const m = await descargarMedia(String(f.media.id));
      if (m && f.tipo === "image" && /^image\/(jpeg|png|gif|webp)$/.test(m.mime)) {
        bloques.push({ type: "image", source: { type: "base64", media_type: m.mime as any, data: m.base64 } });
      } else if (m && m.mime === "application/pdf") {
        bloques.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: m.base64 } } as any);
      } else {
        bloques.push({ type: "text", text: `[${f.tipo} recibido: no se pudo abrir]` });
      }
    } else if (f.tipo && !["text", "button", "interactive"].includes(f.tipo) && !f.texto) {
      bloques.push({ type: "text", text: f.tipo === "audio" ? "[audio sin transcripción]" : `[${f.tipo}]` });
    }
    if (f.texto) bloques.push({ type: "text", text: String(f.texto) });
    if (bloques.length === 0) continue;

    const prev = out[out.length - 1];
    if (prev && prev.role === rol) (prev.content as Anthropic.ContentBlockParam[]).push(...bloques);
    else out.push({ role: rol, content: bloques });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out.length ? out : null;
}

async function procesar(convId: string, desde: Date, cfg: Record<string, string>) {
  const t0 = Date.now();
  const filas = await sql`
    select c.*, o.etapa from wa.conversaciones c left join crm.oportunidades o on o.id = c.oportunidad_id
    where c.id = ${convId}::uuid`;
  const c: any = filas[0];
  // Solo se saca de la cola si no llegó un mensaje nuevo mientras se procesaba (ese reinicia procesar_desde)
  const quitar = async (motivo: string) => {
    await sql`delete from wa.cola_agente where conversacion_id = ${convId}::uuid
              and abs(extract(epoch from (procesar_desde - ${desde}::timestamptz))) < 0.002`;
    return motivo;
  };
  if (!c) return quitar("no existe");

  // Reglas de actuación
  if (!["sin_unidad", "lead"].includes(c.estado)) return quitar(`estado ${c.estado}`);
  if (c.unidad && !UNIDADES_AGENTE.has(c.unidad)) return quitar(`unidad ${c.unidad}`);
  if (c.agente_pausado_hasta && new Date(c.agente_pausado_hasta) > new Date()) return quitar("pausado");
  if (!c.ventana_hasta || new Date(c.ventana_hasta) <= new Date()) return quitar("ventana de 24 h cerrada");
  const modo: string = (await sql`select wa.modo_agente(${c.unidad ?? "carclass"}) as m`)[0].m;
  if (modo === "apagado") return quitar("apagado");

  const historial = await armarHistorial(convId);
  if (!historial) return quitar("nada que responder");

  const activas = ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && cfg[`agente_modo_${u}`] !== "apagado" && cfg[`agente_modo_${u}`] !== "observar");
  const ref = c.referral ?? null;
  const contexto: Contexto = {
    ahora: ahoraChile(),
    modo,
    unidades_activas: activas,
    unidad: c.unidad,
    etapa: c.etapa ?? null,
    nombre: c.nombre,
    ficha: c.ficha ?? {},
    origen: ref ? `Anuncio clic a WhatsApp${ref.headline ? ` · «${ref.headline}»` : ""}${ref.body ? ` · ${String(ref.body).slice(0, 200)}` : ""}` : "WhatsApp directo",
    ventana_hasta: c.ventana_hasta ? new Date(c.ventana_hasta).toLocaleString("es-CL", { timeZone: TZ }) : null,
  };
  const conv: Conversacion = {
    id: c.id, estado: c.estado, unidad: c.unidad, flujo: c.flujo, oportunidad_id: c.oportunidad_id,
    empresa_id: c.empresa_id, nombre: c.nombre, telefono_norm: c.telefono_norm, ficha: c.ficha ?? {},
  };

  const salida = await pensar({
    client,
    modelo: cfg.agente_modelo || MODELO_POR_DEFECTO,
    system: await promptSistema(sql),
    herramientas: HERRAMIENTAS,
    historial,
    contexto,
    ejecutar: crearEjecutor({ sql, conv, modo }),
  });

  // Cualquier borrador anterior de esta conversación queda reemplazado por el nuevo
  await sql`update wa.borradores set estado = 'vencido', resuelto_en = now(), resuelto_por = 'reemplazado'
            where conversacion_id = ${convId}::uuid and estado = 'pendiente'`;

  if (!salida.silencioso && salida.mensajes.length > 0) {
    if (modo === "activo") {
      const pnid = c.phone_number_id || cfg.phone_number_id;
      for (let i = 0; i < salida.mensajes.length; i++) {
        if (i > 0) await pausa();
        const texto = salida.mensajes[i];
        const { wamid } = await enviarTexto(pnid, c.wa_usuario, texto);
        await sql`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                  values (${wamid}, ${convId}::uuid, 'saliente_api', 'text', ${texto}, now())`;
        if (c.oportunidad_id) {
          await sql`select core.api_registrar_actividad(${sql.json({ oportunidad_id: c.oportunidad_id, tipo: "whatsapp", resultado: "enviado", nota: texto } as any)}, 'Agente IA')`;
        }
      }
      await sql`update wa.conversaciones set ultima_salida = now() where id = ${convId}::uuid`;
    } else if (modo === "borrador") {
      await sql`insert into wa.borradores (conversacion_id, mensajes, acciones)
                values (${convId}::uuid, ${sql.json(salida.mensajes as any)}, ${sql.json(salida.acciones as any)})`;
    }
    // observar: no se envía ni se guarda borrador
  }

  await sql`insert into wa.agente_log (conversacion_id, modelo, modo, tokens_in, tokens_out, cache_read, cache_write, costo_usd, latencia_ms, iteraciones, herramientas, stop_reason)
            values (${convId}::uuid, ${salida.modelo}, ${modo}, ${salida.uso.input}, ${salida.uso.output}, ${salida.uso.cache_read}, ${salida.uso.cache_write},
                    ${salida.uso.costo_usd}, ${Date.now() - t0}, ${salida.iteraciones}, ${salida.acciones.map((a) => a.herramienta)}, ${salida.stop_reason})`;
  await quitar("ok");
  return `ok · ${modo} · ${salida.mensajes.length} burbujas · ${salida.acciones.length} acciones`;
}

async function manejarError(convId: string, intentos: number, err: unknown) {
  const msg = String((err as any)?.message ?? err).slice(0, 500);
  await sql`insert into wa.agente_log (conversacion_id, error) values (${convId}::uuid, ${msg})`;
  if (intentos >= MAX_INTENTOS) {
    const c: any = (await sql`select nombre, telefono_norm, unidad, oportunidad_id, empresa_id from wa.conversaciones where id = ${convId}::uuid`)[0] ?? {};
    await sql`select core.api_crear_tarea(${sql.json({
      titulo: `[WhatsApp] Error de sistema · ${c.nombre ?? c.telefono_norm ?? convId}`,
      descripcion: `El agente falló ${intentos} veces y dejó de intentar. Responde tú esta conversación. Último error: ${msg}`,
      unidad: c.unidad ?? "grupo", responsable: "Felipe", prioridad: "alta", oportunidad_id: c.oportunidad_id ?? null, empresa_id: c.empresa_id ?? null,
    } as any)}, 'Agente IA')`;
    await sql`delete from wa.cola_agente where conversacion_id = ${convId}::uuid`;
  } else {
    // Reintento en 1 minuto
    await sql`update wa.cola_agente set bloqueado_hasta = now() + interval '1 minute', ultimo_error = ${msg} where conversacion_id = ${convId}::uuid`;
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
    const cfg = await config();
    if (!seguroIgual(req.headers.get("x-agente-secret") ?? "", cfg.agente_secret ?? "")) return new Response("No autorizado", { status: 401 });

    const tomados = await sql`select * from wa.tomar_cola(3)`;
    const resultados: string[] = [];
    for (const t of tomados) {
      try {
        resultados.push(await procesar(t.conversacion_id, t.procesar_desde, cfg));
      } catch (e) {
        await manejarError(t.conversacion_id, t.intentos, e);
        resultados.push(`error`);
      }
    }
    return new Response(JSON.stringify({ ok: true, procesados: resultados }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
