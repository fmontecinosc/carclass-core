// nom-automata — trabajo de fondo del flujo NOM consignante (Fase 2). La invoca pg_cron cada minuto con x-agente-secret.
//  1. nom.tick(): libera cupos sin pago a tiempo y deja en cola los recordatorios del día anterior.
//  2. Envía los mensajes de nom.salientes (informe aprobado, confirmación, recordatorio) si la ventana de 24 h está abierta
//     y el asesor de NOM está en modo «activo». Si la ventana está cerrada, crea una tarea para Felipe con el texto listo.
//  3. Calendario: crea o borra el evento de cada visita en el Google Calendar de carclass.cl (si el puente está conectado).
//  4. Investigación de mercado por etapas: cada minuto avanza UNA llamada a Claude (pocas búsquedas y lecturas) y guarda
//     la conversación en nom.investigaciones; al terminar registra los avisos, calcula y avisa «Tasación lista para aprobar».
//  El informe aprobado sale en PDF (no link) aunque el asesor de NOM esté en «observar»: la aprobación de Felipe lo autoriza.
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import postgres from "npm:postgres@3.4.4";
import { enviarTexto, enviarDocumento, pausa } from "./kapso.ts";
import { gcalConectado, crearEvento, cancelarEvento } from "./gcal.ts";
import { pasoInvestigacion, limpiarAviso, type EstadoInv } from "./investigador.ts";
import { pdfInforme, subirInforme, nombreInforme } from "./informe.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 3, idle_timeout: 20 });
const AUTOR = "Agente IA";
const VERSION = "1.1.0";

function seguroIgual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const hoyChile = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
async function param(clave: string) { return (await sql`select valor from core.parametros where clave = ${clave}`)[0]?.valor ?? null; }

async function tarea(p: Record<string, unknown>) {
  await sql`select core.api_crear_tarea(${sql.json({ unidad: "nom", responsable: "Felipe", prioridad: "alta", vence: hoyChile(), ...p } as any)}, ${AUTOR})`;
}

// ---------------------------------------------------------------------------------------------
// 2. Mensajes salientes
// ---------------------------------------------------------------------------------------------
async function enviarSalientes(): Promise<string[]> {
  const out: string[] = [];
  const modo = (await sql`select wa.modo_agente('nom') as m`)[0].m as string;
  const pend = await sql`
    select s.*, c.wa_usuario, c.telefono, c.ventana_hasta, c.phone_number_id, c.oportunidad_id, c.empresa_id, c.nombre
    from nom.salientes s join wa.conversaciones c on c.id = s.conversacion_id
    where s.estado = 'pendiente' order by s.creado_en limit 5`;
  if (pend.length === 0) return out;
  const pnidDefecto = (await sql`select valor from wa.config where clave = 'phone_number_id'`)[0]?.valor;
  for (const s of pend as any[]) {
    const textos: string[] = s.mensajes;
    // La aprobación de Felipe autoriza el envío del informe aunque el asesor de NOM esté en observar o borrador
    const autorizado = modo === "activo" || (s.tipo === "tasacion_aprobada" && modo !== "apagado");
    if (!autorizado) {
      await sql`update nom.salientes set estado = 'retenido', error = ${"asesor NOM en modo " + modo} where id = ${s.id}`;
      await tarea({
        titulo: `[NOM] Enviar a mano · ${s.nombre ?? s.telefono} · ${s.tipo.replace(/_/g, " ")}`,
        descripcion: `El asesor de NOM no está en modo activo, así que no lo envié. Texto listo para copiar:\n\n${textos.join("\n\n")}`,
        oportunidad_id: s.oportunidad_id, empresa_id: s.empresa_id,
      });
      out.push(`retenido ${s.tipo}`);
      continue;
    }
    if (!s.ventana_hasta || new Date(s.ventana_hasta) <= new Date()) {
      await sql`update nom.salientes set estado = 'sin_ventana' where id = ${s.id}`;
      await tarea({
        titulo: `[NOM] Ventana de WhatsApp cerrada · ${s.nombre ?? s.telefono} · ${s.tipo.replace(/_/g, " ")}`,
        descripcion: `Pasaron más de 24 h desde el último mensaje del cliente y WhatsApp no permite escribirle sin plantilla aprobada. Envíalo tú desde el teléfono:\n\n${textos.join("\n\n")}`,
        oportunidad_id: s.oportunidad_id, empresa_id: s.empresa_id,
      });
      await sql`select core.push(${"Mensaje NOM por enviar a mano"}, ${(s.nombre ?? s.telefono) + " · ventana de 24 h cerrada"}, '#/tareas', ${"nom_sal:" + s.id})`;
      out.push(`sin_ventana ${s.tipo}`);
      continue;
    }
    try {
      // Informe de tasación en PDF (se arma antes de enviar el texto: si falla, no sale nada y se reintenta)
      let pdf: { url: string; nombre: string } | null = null;
      if (s.tipo === "tasacion_aprobada") {
        const payload = (await sql`select nom.payload_cliente(${s.referencia}::uuid) as p`)[0].p;
        const nombre = nombreInforme(payload);
        const of = await param("nom.oficina");
        const wa = (await param("whatsapp.unidades"))?.nom?.numero ?? null;
        pdf = { url: await subirInforme(nombre, await pdfInforme(payload, { whatsapp: wa ?? undefined, agenda_url: of?.agenda_url ?? null })), nombre };
      }
      for (let i = 0; i < textos.length; i++) {
        if (i > 0) await pausa(1500, 3000);
        const { wamid } = await enviarTexto(s.phone_number_id || pnidDefecto, s.wa_usuario, textos[i]);
        await sql`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                  values (${wamid}, ${s.conversacion_id}, 'saliente_api', 'text', ${textos[i]}, now())`;
        if (i === 0 && pdf) {
          await pausa(1500, 2500);
          const d = await enviarDocumento(s.phone_number_id || pnidDefecto, s.wa_usuario, pdf.url, pdf.nombre);
          await sql`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                    values (${d.wamid}, ${s.conversacion_id}, 'saliente_api', 'document', ${`[Documento] ${pdf.nombre} · ${pdf.url}`}, now())`;
        }
      }
      await sql.begin(async (tx: any) => {
        await tx`select set_config('core.autor', ${AUTOR}, true)`;
        await tx`update nom.salientes set estado = 'enviado', enviado_en = now(), intentos = intentos + 1 where id = ${s.id}`;
        await tx`update wa.conversaciones set ultima_salida = now() where id = ${s.conversacion_id}`;
        if (s.tipo === "tasacion_aprobada") await tx`select nom.registrar_envio(${s.referencia}, 'whatsapp_api', ${s.telefono ?? s.wa_usuario}, 'Envío automático tras la aprobación')`;
        else if (s.oportunidad_id) {
          await tx`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                   values (${s.oportunidad_id}, ${s.empresa_id}, 'whatsapp', 'enviado', ${textos.join("\n\n")}, ${AUTOR})`;
        }
      });
      out.push(`enviado ${s.tipo}`);
    } catch (e) {
      const msg = String((e as any)?.message ?? e).slice(0, 400);
      const r = await sql`update nom.salientes set intentos = intentos + 1, error = ${msg},
                            estado = case when intentos + 1 >= 3 then 'error' else 'pendiente' end
                          where id = ${s.id} returning estado`;
      if (r[0]?.estado === "error") {
        await tarea({ titulo: `[NOM] No se pudo enviar por WhatsApp · ${s.nombre ?? s.telefono}`, descripcion: `${msg}\n\nTexto:\n${textos.join("\n\n")}`, oportunidad_id: s.oportunidad_id, empresa_id: s.empresa_id });
      }
      out.push(`error ${s.tipo}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 3. Calendario
// ---------------------------------------------------------------------------------------------
async function sincronizarCalendario(): Promise<string[]> {
  const out: string[] = [];
  const of = await param("nom.oficina");
  const nuevas = await sql`select * from nom.visitas where gcal_estado = 'pendiente' and estado in ('pendiente_pago','reservada','confirmada') order by inicio limit 5`;
  for (const v of nuevas as any[]) {
    if (!gcalConectado()) {
      await sql`update nom.visitas set gcal_estado = 'sin_conexion' where id = ${v.id}`;
      await tarea({
        titulo: `[NOM] Agendar en Google Calendar · visita ${v.nombre ?? ""}`.trim(),
        descripcion: `Visita NOM ${new Date(v.inicio).toLocaleString("es-CL", { timeZone: "America/Santiago" })} (2 h) · ${v.vehiculo ?? ""} · ${v.telefono ?? ""} · ${v.email ?? "sin correo"}. El calendario aún no está conectado a Core.`,
        oportunidad_id: v.oportunidad_id, empresa_id: v.empresa_id,
      });
      out.push("visita sin calendario");
      continue;
    }
    try {
      const id = await crearEvento({
        titulo: `NOM · Inspección y fotos · ${v.nombre ?? "Cliente"} · ${v.vehiculo ?? ""}`.trim(),
        inicio: new Date(v.inicio).toISOString(), fin: new Date(v.fin).toISOString(),
        descripcion: [`Cliente: ${v.nombre ?? "—"} · ${v.telefono ?? ""}`, `Auto: ${v.vehiculo ?? "—"}`,
          `Fee: $${Number(v.fee_monto).toLocaleString("es-CL")} (${v.fee_momento === "al_agendar" ? "al agendar" : "en la visita"}) · estado ${v.fee_estado}`,
          "Agendado por el asesor de WhatsApp (Carclass Core)."].join("\n"),
        ubicacion: `${of?.direccion ?? ""}, ${of?.sector ?? "Chicureo"}, ${of?.comuna ?? "Colina"}`,
        invitado: v.email,
      });
      await sql`update nom.visitas set gcal_estado = 'creado', gcal_event_id = ${id}, gcal_error = null where id = ${v.id}`;
      out.push("evento creado");
    } catch (e) {
      await sql`update nom.visitas set gcal_estado = 'error', gcal_error = ${String((e as any)?.message ?? e).slice(0, 300)} where id = ${v.id}`;
      out.push("evento con error");
    }
  }
  if (gcalConectado()) {
    const canc = await sql`select id, gcal_event_id from nom.visitas where estado = 'cancelada' and gcal_estado = 'creado' and gcal_event_id is not null limit 5`;
    for (const v of canc as any[]) {
      try { await cancelarEvento(v.gcal_event_id); await sql`update nom.visitas set gcal_estado = 'cancelado' where id = ${v.id}`; out.push("evento borrado"); }
      catch (e) { await sql`update nom.visitas set gcal_error = ${String((e as any)?.message ?? e).slice(0, 300)} where id = ${v.id}`; }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 4. Investigación de mercado
// ---------------------------------------------------------------------------------------------
async function tomarInvestigacion() {
  // Un paso a la vez; el bloqueo cubre la duración de una llamada (los fallos suman intentos en el catch)
  const r = await sql`
    update nom.investigaciones set estado = 'en_curso', bloqueado_hasta = now() + interval '6 minutes', error = null
    where id = (select id from nom.investigaciones
                where (estado = 'pendiente' or (estado = 'en_curso' and bloqueado_hasta < now())) and intentos < 3
                  and coalesce(bloqueado_hasta, '-infinity') < now()
                order by creado_en limit 1 for update skip locked)
    returning *`;
  return r[0] ?? null;
}

async function correrInvestigacion(inv: any, silencio = false) {
  const t = (await sql`select * from nom.tasaciones where id = ${inv.tasacion_id}`)[0] as any;
  try {
    const cfg = await param("nom.automatizacion");
    const modelo = cfg?.investigacion_modelo ?? "claude-sonnet-5-5";
    const client = new Anthropic({ maxRetries: 1, timeout: 240_000 });
    const paso = await pasoInvestigacion(client, modelo, {
      marca: t.marca, modelo: t.modelo, version: t.version, anio: t.anio, km: t.km,
      transmision: t.transmision, combustible: t.combustible, traccion: t.traccion,
    }, {
      maxBusquedas: Number(cfg?.investigacion_max_busquedas ?? 8), maxLecturas: Number(cfg?.investigacion_max_lecturas ?? 12),
      porEtapa: Number(cfg?.investigacion_por_etapa ?? 4), maxVueltas: Number(cfg?.investigacion_max_vueltas ?? 8),
    }, (inv.conversacion as EstadoInv) ?? null);

    if (!paso.terminado) {
      await sql`update nom.investigaciones set estado = 'pendiente', bloqueado_hasta = null, conversacion = ${sql.json(paso.estado as any)},
                  vueltas = ${paso.estado.vueltas}, costo_usd = ${paso.costo_usd} where id = ${inv.id}`;
      return;
    }
    const hallazgo = paso.hallazgo!, uso = paso.estado.uso, costo_usd = paso.costo_usd;
    const avisos = (hallazgo.avisos ?? []).map(limpiarAviso).filter(Boolean) as any[];
    // Una búsqueda registrada por portal, con sus avisos
    const porPortal = new Map<string, any[]>();
    for (const a of avisos) { if (!porPortal.has(a.portal)) porPortal.set(a.portal, []); porPortal.get(a.portal)!.push(a); }
    for (const b of hallazgo.busquedas ?? []) if (!porPortal.has(b.portal)) porPortal.set(b.portal, []);
    for (const [portal, lista] of porPortal) {
      const b = (hallazgo.busquedas ?? []).find((x) => x.portal === portal);
      await sql`select core.api_nom_registrar_mercado(${t.id}::uuid, ${sql.json({
        portal, consulta: b?.consulta ?? `${t.marca} ${t.modelo} ${t.anio}`, url_busqueda: b?.url_busqueda ?? null,
        resultados_n: b?.resultados_n ?? lista.length, notas: "Investigación automática (nom-automata)", avisos: lista,
      } as any)}, ${AUTOR})`;
    }
    await sql`select core.api_nom_tasacion_actualizar(${t.id}::uuid, ${sql.json({
      resumen_comercial: hallazgo.resumen_comercial ?? null,
      comercialidad: Math.min(5, Math.max(1, Number(hallazgo.comercialidad) || 3)),
      comercialidad_txt: hallazgo.comercialidad_txt ?? null,
      analisis_comparables: hallazgo.analisis_comparables ?? null,
    } as any)}, ${AUTOR})`;
    const calc = (await sql`select core.api_nom_tasacion_calcular(${t.id}::uuid, ${AUTOR}) as r`)[0].r as any;
    const validos = avisos.filter((a) => a.verificacion === "verificado_activo").length;
    await sql`update nom.investigaciones set estado = 'lista', terminado_en = now(), costo_usd = ${costo_usd}, bloqueado_hasta = null,
                vueltas = ${paso.estado.vueltas}, conversacion = null,
                resultado = ${sql.json({ uso, avisos: avisos.length, verificados: validos, notas_internas: hallazgo.notas_internas ?? null } as any)}
              where id = ${inv.id}`;
    if (silencio) return; // pruebas: sin aviso ni tarea
    const pub = calc?.precio_publicacion ? `publicación $${Number(calc.precio_publicacion).toLocaleString("es-CL")}` : "sin precio (revisar)";
    await sql`select core.push(${"Tasación lista para aprobar"},
      ${`${t.marca} ${t.modelo} ${t.anio} · ${pub} · ${avisos.length} avisos, ${validos} verificados${calc?.tipo === "pre_estimacion" ? " · pre-estimación" : ""}`},
      ${"#/tasacion/" + t.id}, ${"nom_tas:" + t.id})`;
    await tarea({
      titulo: `[NOM] Aprobar tasación ${t.folio} · ${t.marca} ${t.modelo} ${t.anio}`,
      descripcion: `Investigación lista (${avisos.length} avisos, ${validos} verificados, costo USD ${costo_usd}). ${hallazgo.notas_internas ?? ""}\nAl aprobarla, el informe en PDF sale solo por WhatsApp al cliente (si la tasación vino de WhatsApp).`,
      oportunidad_id: t.oportunidad_id, empresa_id: t.empresa_id,
    });
  } catch (e) {
    const msg = String((e as any)?.message ?? e).slice(0, 500);
    const r = await sql`update nom.investigaciones set intentos = intentos + 1, estado = case when intentos + 1 >= 3 then 'error' else 'pendiente' end,
                          error = ${msg}, bloqueado_hasta = now() + interval '2 minutes' where id = ${inv.id} returning estado`;
    if (r[0]?.estado === "error") {
      await tarea({ titulo: `[NOM] Investigación de mercado falló · ${t?.folio ?? ""}`, descripcion: `Tres intentos fallidos. Último error: ${msg}. Tasa a mano desde Core o con Claude.`, oportunidad_id: t?.oportunidad_id, empresa_id: t?.empresa_id });
      await sql`select core.push('Tasación NOM sin investigación', ${msg.slice(0, 120)}, ${"#/tasacion/" + inv.tasacion_id}, ${"nom_inv_err:" + inv.id})`;
    }
  }
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
    const sec = (await sql`select valor from wa.config where clave = 'agente_secret'`)[0]?.valor ?? "";
    if (!seguroIgual(req.headers.get("x-agente-secret") ?? "", sec)) return new Response("No autorizado", { status: 401 });
    const body = await req.json().catch(() => ({}));

    const tick = (await sql`select nom.tick() as r`)[0].r;
    const salientes = await enviarSalientes();
    const calendario = await sincronizarCalendario();

    let investigacion: string | null = null;
    const inv = await tomarInvestigacion();
    if (inv) {
      investigacion = `en curso ${inv.tasacion_id}`;
      const trabajo = correrInvestigacion(inv, !!body?.silencio);
      // En producción corre en segundo plano; con {"esperar": true} (pruebas) se espera el resultado
      if (body?.esperar) { await trabajo; investigacion = `terminada ${inv.tasacion_id}`; }
      else (globalThis as any).EdgeRuntime?.waitUntil?.(trabajo);
    }
    return new Response(JSON.stringify({ ok: true, version: VERSION, tick, salientes, calendario, investigacion, calendario_conectado: gcalConectado() }),
      { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String((e as any)?.message ?? e).slice(0, 300) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
