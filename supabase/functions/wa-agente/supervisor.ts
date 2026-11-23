// Supervisor del asesor: chat de Felipe con el asesor IA desde Core (Conversaciones → «Instrucciones al asesor»).
// Felipe da instrucciones o correcciones en lenguaje natural; el supervisor las ejecuta con herramientas:
// buscar y ver chats, programar un mensaje (seguimiento) a un cliente, dejar una instrucción en la ficha del chat
// (el asesor la lee en su contexto), cancelar seguimientos y agregar o quitar reglas generales que se suman al prompt.
// Solo el dueño puede usarlo (JWT de Supabase Auth + core.usuarios.rol = 'dueno').
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type postgres from "npm:postgres@3.4.4";

type Sql = ReturnType<typeof postgres>;
const TZ = "America/Santiago";
const MODELO = "claude-sonnet-5-5";

const SISTEMA = `Eres el asesor de WhatsApp del grupo Carclass (Carclass, NOM, Carwash.hf y BlackGPS) hablando con Felipe, el dueño, dentro de Carclass Core.
Felipe te da instrucciones o correcciones sobre clientes concretos o sobre cómo debes atender en general. Responde en español de Chile, breve y directo.

Cómo trabajar:
- Si la instrucción es sobre un cliente, primero ubica el chat con buscar_conversaciones (por nombre, teléfono, auto o tema) y, si hace falta, revisa los últimos mensajes con ver_conversacion. Si hay más de un candidato, pregunta cuál.
- Para escribirle al cliente usa programar_mensaje con la idea de lo que hay que decir (no el texto final): el mensaje lo redactas tú mismo al enviarlo, con el contexto del chat. Usa cuando="ahora" salvo que Felipe indique una hora. Recuerda que WhatsApp solo permite mensajes libres dentro de 24 h desde el último mensaje del cliente: si la ventana está cerrada o cerrará antes, dilo; el seguimiento quedará como tarea con el texto listo.
- Si Felipe te dice cómo actuar cuando el cliente responda o envíe algo, déjalo con anotar_instruccion en ese chat.
- Si es una regla para todos los clientes ("de ahora en adelante…", "cuando un cliente…"), usa agregar_regla con una redacción clara y operativa. Si contradice una regla anterior, quita la anterior.
- Nunca inventes precios, plazos ni datos: si faltan, pregúntale a Felipe.
- Al terminar, confirma en 1 a 3 líneas qué hiciste (cliente, cuándo sale el mensaje, qué quedó anotado). Sin markdown pesado.`;

const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "buscar_conversaciones",
    description: "Busca chats de WhatsApp por nombre, teléfono, auto o texto de la ficha. Devuelve hasta 8 con id, nombre, unidad, etapa, último mensaje y ventana de 24 h.",
    input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"], additionalProperties: false },
  },
  {
    name: "ver_conversacion",
    description: "Últimos 20 mensajes del chat, su ficha, seguimientos pendientes y ventana de 24 h.",
    input_schema: { type: "object", properties: { conversacion_id: { type: "string" } }, required: ["conversacion_id"], additionalProperties: false },
  },
  {
    name: "programar_mensaje",
    description: "Programa un mensaje del asesor al cliente (seguimiento). idea = qué decir y por qué; el asesor redacta el texto al enviarlo. cuando = 'ahora' o fecha y hora de Chile 'YYYY-MM-DD HH:MM'.",
    input_schema: {
      type: "object",
      properties: { conversacion_id: { type: "string" }, idea: { type: "string" }, cuando: { type: "string" } },
      required: ["conversacion_id", "idea", "cuando"], additionalProperties: false,
    },
  },
  {
    name: "anotar_instruccion",
    description: "Deja una instrucción de Felipe en la ficha del chat; el asesor la ve cada vez que atiende a ese cliente. Reemplaza la instrucción anterior del mismo chat.",
    input_schema: { type: "object", properties: { conversacion_id: { type: "string" }, instruccion: { type: "string" } }, required: ["conversacion_id", "instruccion"], additionalProperties: false },
  },
  {
    name: "cancelar_seguimientos",
    description: "Cancela los seguimientos pendientes de un chat.",
    input_schema: { type: "object", properties: { conversacion_id: { type: "string" } }, required: ["conversacion_id"], additionalProperties: false },
  },
  {
    name: "listar_reglas",
    description: "Reglas generales vigentes dadas por Felipe (se suman al prompt del asesor).",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "agregar_regla",
    description: "Agrega una regla general para atender a todos los clientes. Redáctala como instrucción clara.",
    input_schema: { type: "object", properties: { regla: { type: "string" } }, required: ["regla"], additionalProperties: false },
  },
  {
    name: "quitar_regla",
    description: "Quita una regla general por su número (de listar_reglas).",
    input_schema: { type: "object", properties: { numero: { type: "integer" } }, required: ["numero"], additionalProperties: false },
  },
];

const fmt = (d: Date | string | null) => d ? new Date(d).toLocaleString("es-CL", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }) : null;

async function leerReglas(sql: Sql): Promise<{ texto: string; desde: string }[]> {
  const r = await sql`select valor from wa.config where clave = 'agente_reglas_felipe'`;
  try { return JSON.parse(r[0]?.valor ?? "[]"); } catch { return []; }
}
async function guardarReglas(sql: Sql, reglas: { texto: string; desde: string }[]) {
  await sql`insert into wa.config (clave, valor) values ('agente_reglas_felipe', ${JSON.stringify(reglas)})
            on conflict (clave) do update set valor = excluded.valor`;
}

function ejecutor(sql: Sql) {
  return async (nombre: string, i: any): Promise<any> => {
    switch (nombre) {
      case "buscar_conversaciones": {
        const q = `%${String(i.texto ?? "").trim()}%`;
        const dig = String(i.texto ?? "").replace(/\D/g, "");
        const filas = await sql`
          select c.id, coalesce(nullif(c.ficha->>'nombre',''), c.nombre) nombre, c.telefono, c.unidad, c.estado, o.etapa,
                 c.ventana_hasta, (select texto from wa.mensajes m where m.conversacion_id = c.id order by enviado_en desc limit 1) ultimo
          from wa.conversaciones c left join crm.oportunidades o on o.id = c.oportunidad_id
          where c.estado in ('lead','sin_unidad','contacto')
            and (c.nombre ilike ${q} or c.ficha::text ilike ${q} or (${dig.length >= 6} and c.telefono_norm like ${"%" + dig.slice(-8) + "%"}))
          order by greatest(c.ultima_entrada, c.ultima_salida) desc nulls last limit 8`;
        return { ok: true, data: filas.map((f: any) => ({ ...f, ultimo: f.ultimo ? String(f.ultimo).slice(0, 140) : null, ventana_hasta: fmt(f.ventana_hasta), ventana_abierta: !!f.ventana_hasta && new Date(f.ventana_hasta) > new Date() })) };
      }
      case "ver_conversacion": {
        const c = (await sql`select id, nombre, telefono, unidad, estado, ficha, ventana_hasta, agente_activo from wa.conversaciones where id = ${i.conversacion_id}::uuid`)[0];
        if (!c) return { ok: false, error: "No existe ese chat" };
        const msgs = await sql`select * from (select direccion, texto, tipo, enviado_en from wa.mensajes where conversacion_id = ${c.id}::uuid order by enviado_en desc limit 20) t order by enviado_en`;
        const segs = await sql`select cuando, canal, idea from wa.seguimientos where conversacion_id = ${c.id}::uuid and estado = 'pendiente' order by cuando`;
        return { ok: true, data: {
          ...c, ventana_hasta: fmt(c.ventana_hasta), ventana_abierta: !!c.ventana_hasta && new Date(c.ventana_hasta) > new Date(),
          mensajes: msgs.map((m: any) => ({ de: m.direccion === "entrante" ? "cliente" : m.direccion === "saliente_app" ? "Felipe" : "asesor", cuando: fmt(m.enviado_en), texto: m.texto ? String(m.texto).slice(0, 400) : `[${m.tipo}]` })),
          seguimientos: segs.map((s: any) => ({ cuando: fmt(s.cuando), canal: s.canal, idea: s.idea })),
        } };
      }
      case "programar_mensaje": {
        const ahora = String(i.cuando ?? "ahora").trim().toLowerCase() === "ahora";
        const m = String(i.cuando ?? "").match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
        if (!ahora && !m) return { ok: false, error: "cuando debe ser 'ahora' o 'YYYY-MM-DD HH:MM' (hora de Chile)" };
        const r = ahora
          ? await sql`insert into wa.seguimientos (conversacion_id, cuando, canal, idea, estado) values (${i.conversacion_id}::uuid, now(), 'texto_libre', ${"Pedido de Felipe. " + i.idea}, 'pendiente') returning cuando`
          : await sql`insert into wa.seguimientos (conversacion_id, cuando, canal, idea, estado) values (${i.conversacion_id}::uuid, (${m![1] + " " + m![2]})::timestamp at time zone ${TZ}, 'texto_libre', ${"Pedido de Felipe. " + i.idea}, 'pendiente') returning cuando`;
        const c = (await sql`select ventana_hasta from wa.conversaciones where id = ${i.conversacion_id}::uuid`)[0];
        const abierta = c?.ventana_hasta && new Date(c.ventana_hasta) > new Date(r[0].cuando);
        return { ok: true, data: { sale: ahora ? "en menos de un minuto" : fmt(r[0].cuando), ventana_abierta_al_enviar: !!abierta,
          nota: abierta ? "Saldrá por WhatsApp si el asesor de esa línea está en modo activo (en borrador queda para que Felipe lo envíe)." : "La ventana de 24 h estará cerrada: quedará como tarea con el texto listo para enviarlo desde el teléfono." } };
      }
      case "anotar_instruccion": {
        const r = await sql`update wa.conversaciones set ficha = ficha || ${sql.json({ instruccion_felipe: `${i.instruccion} (Felipe, ${fmt(new Date())})` } as any)}, actualizado_en = now()
                            where id = ${i.conversacion_id}::uuid returning id`;
        return r.length ? { ok: true } : { ok: false, error: "No existe ese chat" };
      }
      case "cancelar_seguimientos": {
        const r = await sql`update wa.seguimientos set estado = 'cancelado' where conversacion_id = ${i.conversacion_id}::uuid and estado = 'pendiente' returning id`;
        return { ok: true, data: { cancelados: r.length } };
      }
      case "listar_reglas": {
        const reglas = await leerReglas(sql);
        return { ok: true, data: reglas.map((r, k) => ({ numero: k + 1, regla: r.texto, desde: r.desde })) };
      }
      case "agregar_regla": {
        const reglas = await leerReglas(sql);
        reglas.push({ texto: String(i.regla).trim(), desde: new Date().toISOString().slice(0, 10) });
        await guardarReglas(sql, reglas);
        return { ok: true, data: { numero: reglas.length, total: reglas.length } };
      }
      case "quitar_regla": {
        const reglas = await leerReglas(sql);
        const k = Number(i.numero) - 1;
        if (k < 0 || k >= reglas.length) return { ok: false, error: "No existe ese número" };
        const [q] = reglas.splice(k, 1);
        await guardarReglas(sql, reglas);
        return { ok: true, data: { quitada: q.texto } };
      }
    }
    return { ok: false, error: "Herramienta desconocida" };
  };
}

// Valida el JWT del usuario con Supabase Auth y exige rol dueño
async function dueno(sql: Sql, req: Request): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const base = Deno.env.get("SUPABASE_URL")!;
  const r = await fetch(`${base}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "" } });
  if (!r.ok) return null;
  const u = await r.json();
  const ok = await sql`select 1 from core.usuarios where user_id = ${u.id}::uuid and activo and rol = 'dueno'`;
  return ok.length ? u.id : null;
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };

export async function supervisor(sql: Sql, client: Anthropic, req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "content-type": "application/json" } });
  const uid = await dueno(sql, req);
  if (!uid) return json({ ok: false, error: "Solo el dueño puede dar instrucciones al asesor" }, 401);
  const body = await req.json().catch(() => ({}));
  const texto = String(body?.texto ?? "").trim();
  if (!texto) return json({ ok: false, error: "Escribe una instrucción" }, 400);

  await sql`insert into wa.supervisor_mensajes (user_id, rol, texto) values (${uid}::uuid, 'felipe', ${texto})`;
  // Historial reciente (últimas 16 intervenciones) para que entienda «ese cliente», «lo mismo para…»
  const hist = await sql`select * from (select rol, texto, creado_en from wa.supervisor_mensajes where user_id = ${uid}::uuid order by creado_en desc limit 16) t order by creado_en`;
  const mensajes: any[] = [];
  for (const h of hist as any[]) {
    const role = h.rol === "felipe" ? "user" : "assistant";
    if (mensajes.length && mensajes[mensajes.length - 1].role === role) mensajes[mensajes.length - 1].content += "\n" + h.texto;
    else mensajes.push({ role, content: h.texto });
  }
  while (mensajes.length && mensajes[0].role !== "user") mensajes.shift();
  const ultimo = mensajes[mensajes.length - 1];
  ultimo.content = `[Ahora en Chile: ${new Date().toLocaleString("es-CL", { timeZone: TZ, dateStyle: "full", timeStyle: "short" })}]\n${ultimo.content}`;

  const ejecutar = ejecutor(sql);
  const acciones: any[] = [];
  let respuesta = "";
  for (let k = 0; k < 8; k++) {
    const r = await client.messages.create({ model: MODELO, max_tokens: 1500, system: SISTEMA, tools: HERRAMIENTAS, messages: mensajes } as any) as any;
    mensajes.push({ role: "assistant", content: r.content });
    const llamadas = r.content.filter((b: any) => b.type === "tool_use");
    if (r.stop_reason !== "tool_use" || !llamadas.length) {
      respuesta = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
      break;
    }
    const res: any[] = [];
    for (const ll of llamadas) {
      let out: any;
      try { out = await ejecutar(ll.name, ll.input); } catch (e) { out = { ok: false, error: String((e as any)?.message ?? e).slice(0, 200) }; }
      acciones.push({ herramienta: ll.name, input: ll.input, ok: !!out.ok });
      res.push({ type: "tool_result", tool_use_id: ll.id, content: JSON.stringify(out.ok ? (out.data ?? { ok: true }) : { error: out.error }), ...(out.ok ? {} : { is_error: true }) });
    }
    mensajes.push({ role: "user", content: res });
  }
  if (!respuesta) respuesta = "No alcancé a terminar. ¿Me lo repites con más detalle?";
  await sql`insert into wa.supervisor_mensajes (user_id, rol, texto, acciones) values (${uid}::uuid, 'asesor', ${respuesta}, ${sql.json(acciones as any)})`;
  return json({ ok: true, respuesta, acciones });
}
