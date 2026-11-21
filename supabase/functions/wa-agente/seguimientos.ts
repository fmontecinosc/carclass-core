// Seguimientos del asesor (wa.seguimientos): los programa la herramienta programar_seguimiento (23 h, día 3, día 7,
// día 10 = perdida) o Felipe a mano. Cada vez que corre wa-agente se procesan los vencidos:
//  - Si el cliente respondió después de programarlos, se cancelan todos (la conversación siguió sola).
//  - Si la conversación está pausada, se corren al fin de la pausa. Si la tomó un humano o se cerró, se cancelan.
//  - texto_libre / plantilla: Claude escribe UN mensaje que aporte algo nuevo. Con la ventana de 24 h abierta y la unidad
//    en «activo» se envía; en «borrador» queda como borrador; si no se puede enviar, queda como tarea con el texto listo.
//  - marcar_perdida: la oportunidad pasa a perdida (sin_respuesta) si la unidad está en «activo»; si no, tarea.
import type Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type postgres from "npm:postgres@3.4.4";
import { pensar } from "./cerebro.ts";
import { enviarTexto, pausa } from "./kapso.ts";

type Sql = ReturnType<typeof postgres>;
const AUTOR = "Agente IA";
const TZ = "America/Santiago";

const fechaChile = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const ahoraChile = () =>
  new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date());

// Historial de texto completo (puede terminar en un mensaje nuestro): base para escribir el seguimiento
async function historialTexto(sql: Sql, convId: string): Promise<Anthropic.MessageParam[]> {
  const filas = await sql`
    select * from (select direccion, tipo, texto, enviado_en from wa.mensajes
                   where conversacion_id = ${convId}::uuid order by enviado_en desc limit 30) t
    order by enviado_en asc`;
  const out: Anthropic.MessageParam[] = [];
  for (const f of filas as any[]) {
    const rol: "user" | "assistant" = f.direccion === "entrante" ? "user" : "assistant";
    const texto = f.texto ? String(f.texto) : `[${f.tipo}]`;
    const prev = out[out.length - 1];
    if (prev && prev.role === rol) (prev.content as Anthropic.ContentBlockParam[]).push({ type: "text", text: texto });
    else out.push({ role: rol, content: [{ type: "text", text: texto }] });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

function instruccion(s: any, horas: number): string {
  return [
    "[Instrucción interna de seguimiento — no la escribió el cliente]",
    `El cliente no ha respondido desde nuestro último mensaje (hace unas ${horas} horas).`,
    "Escribe UN mensaje breve de seguimiento (1 a 3 líneas, una sola burbuja), cálido y sin presión, que aporte algo nuevo.",
    s.idea ? `Idea para aportar: ${s.idea}` : "",
    "Nunca preguntes «¿viste la cotización?» ni repitas la cotización completa. No prometas enviar fotos ni nada que no puedas mandar ahora mismo; si aún no compartiste la página web del servicio, puedes compartirla.",
    "No uses herramientas. Si ya no corresponde escribir (por ejemplo, el cliente dijo que no le interesa o pidió que no lo contacten), responde exactamente: OMITIR",
  ].filter(Boolean).join("\n");
}

async function tarea(sql: Sql, c: any, titulo: string, descripcion: string) {
  await sql`select core.api_crear_tarea(${sql.json({
    titulo, descripcion, unidad: c.unidad ?? "carclass", responsable: "Felipe", prioridad: "media",
    vence: fechaChile(new Date()), oportunidad_id: c.oportunidad_id ?? null, empresa_id: c.empresa_id ?? null,
  } as any)}, ${AUTOR})`;
}

export async function procesarSeguimientos(sql: Sql, client: Anthropic, cfg: Record<string, string>, system: string): Promise<string[]> {
  // Se toman hasta 3 vencidos y se corren 10 minutos (reintento natural si algo falla a mitad de camino)
  const lote = await sql`
    update wa.seguimientos s set cuando = now() + interval '10 minutes'
    where s.id in (select id from wa.seguimientos where estado = 'pendiente' and cuando <= now()
                   order by cuando limit 3 for update skip locked)
    returning s.*`;
  const out: string[] = [];
  for (const s of lote as any[]) {
    try { out.push(await uno(sql, client, cfg, system, s)); }
    catch (e) { out.push(`seguimiento error: ${String((e as any)?.message ?? e).slice(0, 120)}`); }
  }
  return out;
}

async function uno(sql: Sql, client: Anthropic, cfg: Record<string, string>, system: string, s: any): Promise<string> {
  const fin = (estado: string) => sql`update wa.seguimientos set estado = ${estado} where id = ${s.id}`;
  const c: any = (await sql`
    select c.*, o.etapa, o.estado as op_estado from wa.conversaciones c
    left join crm.oportunidades o on o.id = c.oportunidad_id where c.id = ${s.conversacion_id}::uuid`)[0];
  if (!c || !["lead", "sin_unidad"].includes(c.estado)) { await fin("cancelado"); return "cancelado: conversación cerrada"; }
  if (c.agente_activo === false) { await fin("cancelado"); return "cancelado: tomada por humano"; }
  if (c.op_estado && c.op_estado !== "abierta") { await fin("cancelado"); return `cancelado: oportunidad ${c.op_estado}`; }

  // ¿El cliente escribió después de programar el seguimiento? Entonces la conversación siguió: se cancelan todos.
  const respondio = await sql`select 1 from wa.mensajes where conversacion_id = ${c.id}::uuid and direccion = 'entrante' and enviado_en > ${s.creado_en} limit 1`;
  if (respondio.length) {
    await sql`update wa.seguimientos set estado = 'cancelado' where conversacion_id = ${c.id}::uuid and estado = 'pendiente'`;
    await fin("cancelado");
    return "cancelado: el cliente respondió";
  }
  if (c.agente_pausado_hasta && new Date(c.agente_pausado_hasta) > new Date()) {
    await sql`update wa.seguimientos set cuando = ${new Date(new Date(c.agente_pausado_hasta).getTime() + 5 * 60_000)} where id = ${s.id}`;
    return "pospuesto: pausa";
  }
  let modo: string = (await sql`select wa.modo_agente(${c.unidad ?? "carclass"}) as m`)[0].m;
  if (modo === "apagado") { await fin("cancelado"); return "cancelado: asesor apagado"; }
  // Kapso sin cupo (ver index.ts): el seguimiento queda como borrador para enviarlo desde el teléfono
  if (modo === "activo" && cfg.kapso_limite_hasta && new Date(cfg.kapso_limite_hasta) > new Date()) modo = "borrador";
  const nombre = c.nombre ?? c.telefono_norm ?? "cliente";

  if (s.canal === "marcar_perdida") {
    if (modo === "activo" && c.oportunidad_id) {
      await sql`select core.api_mover_etapa(${sql.json({ oportunidad_id: c.oportunidad_id, estado: "perdida", motivo_codigo: "sin_respuesta", motivo: "Sin respuesta tras los seguimientos" } as any)}, ${AUTOR})`;
      await fin("enviado");
      return "perdida: sin respuesta";
    }
    await tarea(sql, c, `[Seguimiento] Cerrar como perdida · ${nombre}`, "No respondió después de los seguimientos. Si corresponde, márcala como perdida (sin respuesta).");
    await fin("omitido");
    return "tarea: cerrar perdida";
  }

  // Escribir el seguimiento
  const hist = await historialTexto(sql, c.id);
  const ultSalida = c.ultima_salida ? new Date(c.ultima_salida) : new Date(s.creado_en);
  const horas = Math.max(1, Math.round((Date.now() - ultSalida.getTime()) / 3_600_000));
  const instr: Anthropic.ContentBlockParam = { type: "text", text: instruccion(s, horas) };
  const ult = hist[hist.length - 1];
  if (ult && ult.role === "user") (ult.content as Anthropic.ContentBlockParam[]).push(instr);
  else hist.push({ role: "user", content: [instr] });

  const activas = ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && !["apagado", "observar"].includes(cfg[`agente_modo_${u}`]));
  const salida = await pensar({
    client, modelo: cfg.agente_modelo || undefined, system, herramientas: [], historial: hist,
    contexto: {
      ahora: ahoraChile(), modo, unidades_activas: activas, unidad: c.unidad, etapa: c.etapa ?? null, nombre: c.nombre,
      ficha: c.ficha ?? {}, origen: "Seguimiento programado",
      ventana_hasta: c.ventana_hasta ? new Date(c.ventana_hasta).toLocaleString("es-CL", { timeZone: TZ }) : null,
    },
    ejecutar: async () => ({ ok: false, error: "Sin herramientas en un seguimiento" }),
    maxIteraciones: 2,
  });
  await sql`insert into wa.agente_log (conversacion_id, modelo, modo, tokens_in, tokens_out, cache_read, cache_write, costo_usd, iteraciones, herramientas, stop_reason)
            values (${c.id}::uuid, ${salida.modelo}, ${"seguimiento:" + modo}, ${salida.uso.input}, ${salida.uso.output}, ${salida.uso.cache_read},
                    ${salida.uso.cache_write}, ${salida.uso.costo_usd}, ${salida.iteraciones}, ${[]}, ${salida.stop_reason})`;
  const mensajes = salida.mensajes.filter((m) => m.trim().toUpperCase() !== "OMITIR");
  if (mensajes.length === 0) { await fin("omitido"); return "omitido por el asesor"; }

  const ventanaAbierta = c.ventana_hasta && new Date(c.ventana_hasta).getTime() > Date.now() + 60_000;
  if (modo === "activo" && ventanaAbierta) {
    const pnid = c.phone_number_id || cfg.phone_number_id;
    for (let i = 0; i < mensajes.length; i++) {
      if (i > 0) await pausa();
      let wamid: string | null;
      try {
        ({ wamid } = await enviarTexto(pnid, c.wa_usuario, mensajes[i]));
      } catch (e) {
        // Un envío fallido no puede quedar en silencio (antes se reintentaba cada 10 min sin aviso): se registra el error
        // y el texto queda como borrador para que Felipe lo envíe desde su WhatsApp, con aviso.
        const msg = String((e as any)?.message ?? e).slice(0, 500);
        await sql`insert into wa.agente_log (conversacion_id, modo, error) values (${c.id}::uuid, ${"seguimiento:" + modo}, ${msg})`;
        if (/Kapso 402/.test(msg)) {
          await sql`insert into wa.config (clave, valor) values ('kapso_limite_hasta', ${new Date(Date.now() + 24 * 3_600_000).toISOString()})
                    on conflict (clave) do update set valor = excluded.valor`;
        }
        await sql`update wa.borradores set estado = 'vencido', resuelto_en = now(), resuelto_por = 'reemplazado'
                  where conversacion_id = ${c.id}::uuid and estado = 'pendiente'`;
        await sql`insert into wa.borradores (conversacion_id, mensajes, acciones)
                  values (${c.id}::uuid, ${sql.json(mensajes.slice(i) as any)}, ${sql.json([{ herramienta: "seguimiento", input: { paso: s.canal, idea: s.idea, error_envio: msg }, resultado: { ok: false } }] as any)})`;
        await sql`select core.push(${"Seguimiento sin enviar"}, ${nombre + " · WhatsApp rechazó el envío; revisa y envía desde Conversaciones"}, ${"#/conversaciones/" + c.id}, ${"wa_seg_err:" + s.id})`;
        await fin("omitido");
        return `seguimiento no enviado: ${msg.slice(0, 80)}`;
      }
      await sql`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                values (${wamid}, ${c.id}::uuid, 'saliente_api', 'text', ${mensajes[i]}, now())`;
      if (c.oportunidad_id) {
        await sql`select core.api_registrar_actividad(${sql.json({ oportunidad_id: c.oportunidad_id, tipo: "whatsapp", resultado: "seguimiento", nota: mensajes[i] } as any)}, ${AUTOR})`;
      }
    }
    await sql`update wa.conversaciones set ultima_salida = now() where id = ${c.id}::uuid`;
    await fin("enviado");
    return "seguimiento enviado";
  }
  // En borrador Felipe lo envía desde su WhatsApp (coexistencia): ahí no rige la ventana de 24 h de la API
  if (modo === "borrador") {
    await sql`update wa.borradores set estado = 'vencido', resuelto_en = now(), resuelto_por = 'reemplazado'
              where conversacion_id = ${c.id}::uuid and estado = 'pendiente'`;
    await sql`insert into wa.borradores (conversacion_id, mensajes, acciones)
              values (${c.id}::uuid, ${sql.json(mensajes as any)}, ${sql.json([{ herramienta: "seguimiento", input: { paso: s.canal, idea: s.idea }, resultado: { ok: true } }] as any)})`;
    await sql`select core.push(${"Seguimiento propuesto"}, ${nombre + " · revisa y envía desde Conversaciones"}, ${"#/conversaciones/" + c.id}, ${"wa_seg:" + s.id})`;
    await fin("enviado");
    return "seguimiento en borrador";
  }
  // Ventana cerrada (sin plantilla aprobada) o unidad en observar: queda como tarea con el texto listo
  await tarea(sql, c, `[Seguimiento] Escribir a ${nombre}`,
    `${ventanaAbierta ? "El asesor no está en modo activo para esta unidad." : "Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja escribirle sin plantilla aprobada."} Texto sugerido:\n\n${mensajes.join("\n\n")}`);
  await sql`select core.push(${"Seguimiento por enviar"}, ${nombre + " · texto listo en Tareas"}, '#/tareas', ${"wa_seg:" + s.id})`;
  await fin("omitido");
  return "tarea: seguimiento a mano";
}
