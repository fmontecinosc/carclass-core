// index.ts
import Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import postgres from "npm:postgres@3.4.4";

// cerebro.ts
var MODELO_POR_DEFECTO = "claude-sonnet-5-5", PRECIOS = { input: 2, output: 10, cache_read: 0.1, cache_write: 2.5 };
function textoContexto(c) {
  return [
    "[Contexto del sistema — no lo escribió el cliente]",
    `Ahora (Chile): ${c.ahora}`,
    `Unidades activas: ${c.unidades_activas.join(", ") || "ninguna"}`,
    `Unidad asignada: ${c.unidad ?? "sin asignar"} · Etapa: ${c.etapa ?? "—"}`,
    `Nombre de WhatsApp: ${c.nombre ?? "—"}`,
    `Origen: ${c.origen}`,
    `Ficha: ${JSON.stringify(c.ficha ?? {})}`,
    `Ventana de 24 h abierta hasta: ${c.ventana_hasta ?? "—"}`,
    "[Fin del contexto]"
  ].join(`
`);
}
function conContexto(historial, ctx) {
  let h = [...historial], ult = h[h.length - 1];
  if (!ult || ult.role !== "user") throw new Error("El historial debe terminar en un mensaje del cliente");
  let bloques = typeof ult.content == "string" ? [{ type: "text", text: ult.content }] : [...ult.content];
  return h[h.length - 1] = { role: "user", content: [{ type: "text", text: ctx }, ...bloques] }, h;
}
function separarBurbujas(texto) {
  return texto.split(/\n\s*-{3,}\s*\n/).map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 3);
}
async function pensar(e) {
  let modelo = e.modelo ?? MODELO_POR_DEFECTO, max = e.maxIteraciones ?? 8, mensajes = conContexto(e.historial, textoContexto(e.contexto)), acciones = [], uso = { input: 0, output: 0, cache_read: 0, cache_write: 0, costo_usd: 0 }, stop = null, textoFinal = "", iter = 0;
  for (; iter < max; iter++) {
    let resp = await e.client.beta.messages.create({
      model: modelo,
      max_tokens: 4e3,
      betas: ["server-side-fallback-2026-07-01"],
      // Si el modelo declina por seguridad, la API reintenta con el modelo alternativo que corresponda
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: e.system, cache_control: { type: "ephemeral" } }],
      ...e.herramientas.length ? { tools: e.herramientas } : {},
      messages: mensajes
    }), u = resp.usage ?? {};
    if (uso.input += u.input_tokens ?? 0, uso.output += u.output_tokens ?? 0, uso.cache_read += u.cache_read_input_tokens ?? 0, uso.cache_write += u.cache_creation_input_tokens ?? 0, stop = resp.stop_reason ?? null, resp.stop_reason === "refusal") break;
    if (mensajes.push({ role: "assistant", content: resp.content }), resp.stop_reason === "pause_turn") continue;
    let llamadas = resp.content.filter((b) => b.type === "tool_use");
    if (llamadas.length === 0 || resp.stop_reason !== "tool_use") {
      textoFinal = resp.content.filter((b) => b.type === "text").map((b) => b.text).join(`
`).trim();
      break;
    }
    let resultados = [];
    for (let ll of llamadas) {
      let r = await e.ejecutar(ll.name, ll.input);
      acciones.push({ herramienta: ll.name, input: ll.input, resultado: r }), resultados.push({
        type: "tool_result",
        tool_use_id: ll.id,
        content: JSON.stringify(r.ok ? r.data ?? { ok: !0 } : { error: r.error }),
        ...r.ok ? {} : { is_error: !0 }
      });
    }
    mensajes.push({ role: "user", content: resultados });
  }
  uso.costo_usd = (uso.input * PRECIOS.input + uso.output * PRECIOS.output + uso.cache_read * PRECIOS.cache_read + uso.cache_write * PRECIOS.cache_write) / 1e6;
  let silencioso = acciones.some((a) => a.herramienta === "marcar_personal" && a.resultado.ok) || acciones.some((a) => a.herramienta === "traspasar_humano" && /posible personal/i.test(String(a.input?.motivo ?? "")));
  return {
    mensajes: silencioso || stop === "refusal" ? [] : separarBurbujas(textoFinal),
    acciones,
    silencioso,
    iteraciones: iter + 1,
    stop_reason: stop,
    uso: { ...uso, costo_usd: Math.round(uso.costo_usd * 1e5) / 1e5 },
    modelo
  };
}

// gcal.ts
function gcalConectado() {
  return !!(Deno.env.get("GCAL_SCRIPT_URL") && Deno.env.get("GCAL_SCRIPT_SECRET"));
}
async function llamar(accion, datos) {
  let url = Deno.env.get("GCAL_SCRIPT_URL"), r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    // Apps Script no exige preflight con text/plain
    body: JSON.stringify({ secreto: Deno.env.get("GCAL_SCRIPT_SECRET"), accion, ...datos }),
    redirect: "follow"
  }), txt = await r.text(), j;
  try {
    j = JSON.parse(txt);
  } catch {
    throw new Error(`Calendario: respuesta no válida (${r.status}) ${txt.slice(0, 120)}`);
  }
  if (!j.ok) throw new Error(`Calendario: ${j.error ?? "error"}`);
  return j;
}
async function ocupados(desde, hasta) {
  return (await llamar("ocupado", { desde: desde.toISOString(), hasta: hasta.toISOString() })).ocupados ?? [];
}
function libres(cupos, oc) {
  return cupos.filter((c) => {
    let a = new Date(c.inicio).getTime(), b = new Date(c.fin).getTime();
    return !oc.some((o) => new Date(o.inicio).getTime() < b && new Date(o.fin).getTime() > a);
  });
}

// nom.ts
var AUTOR = "Agente IA", HERRAMIENTAS_NOM = [
  {
    name: "nom_solicitar_tasacion",
    description: "NOM consignante: con los datos del auto, pide la tasación. Core busca comparables vigentes y Felipe la aprueba; el informe se envía solo por WhatsApp. Úsala una vez, cuando tengas marca, modelo, año y km.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string" },
        modelo: { type: "string" },
        version: { type: "string", description: "Versión o equipamiento si el cliente lo sabe (ej.: 2.0 R 2WD)." },
        anio: { type: "integer" },
        km: { type: "integer" },
        transmision: { type: "string", enum: ["manual", "automatica"] },
        combustible: { type: "string", enum: ["bencina", "diesel", "hibrido", "electrico"] },
        patente: { type: "string" },
        precio_esperado: { type: "integer", description: "Precio que espera el cliente, en pesos (solo uso interno)." },
        duenos: { type: "string", description: "Único dueño, segundo dueño, etc." },
        observaciones: { type: "string", description: "Prenda, papeles, choques, mantenciones, urgencia: lo que haya dicho." }
      },
      required: ["marca", "modelo", "anio", "km"],
      additionalProperties: !1
    }
  },
  {
    name: "nom_estado",
    description: "NOM consignante: en qué va la tasación (en investigación, en revisión, enviada) y la visita agendada, si hay.",
    input_schema: { type: "object", properties: {}, additionalProperties: !1 }
  },
  {
    name: "nom_proponer_visita",
    description: "NOM consignante con tasación ya enviada: devuelve 2 horarios libres para la visita de inspección y fotos en la oficina de Chicureo, la dirección, la duración, cómo se cobra el fee y qué debe traer el cliente.",
    input_schema: {
      type: "object",
      properties: {
        desde: { type: "string", description: "Opcional: fecha mínima YYYY-MM-DD que pidió el cliente." },
        preferencia: { type: "string", enum: ["manana", "tarde", "cualquiera"] }
      },
      additionalProperties: !1
    }
  },
  {
    name: "nom_reservar_visita",
    description: "Reserva el horario elegido (uno de los de nom_proponer_visita). Si había otra visita, la reemplaza.",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Fecha y hora local de Chile, formato YYYY-MM-DDTHH:MM." },
        nombre: { type: "string" },
        email: { type: "string", description: "Para enviarle la invitación del calendario (opcional)." }
      },
      required: ["inicio"],
      additionalProperties: !1
    }
  },
  {
    name: "nom_registrar_comprobante",
    description: "NOM: llegó el comprobante de transferencia del fee. Queda pendiente de validación por Felipe.",
    input_schema: { type: "object", properties: { monto: { type: "integer" }, nota: { type: "string" } }, additionalProperties: !1 }
  },
  {
    name: "nom_cancelar_visita",
    description: "NOM: el cliente cancela la visita (para reagendar usa nom_reservar_visita con el nuevo horario).",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"], additionalProperties: !1 }
  }
], NOM_SOLO_LECTURA = ["nom_estado", "nom_proponer_visita"];
function crearNom(sql2, conv, escribir) {
  let exigirNom = () => {
    if (conv.unidad !== "nom") throw new Error("Primero asigna la unidad NOM con asignar_unidad");
  }, estadoNom = async () => !escribir && conv.sim_nom ? (conv.sim_turno ?? 0) >= conv.sim_nom.desde_turno ? conv.sim_nom.estado : { tasacion: null, visita: null } : (await sql2`select core.api_nom_wa_estado(${conv.id}::uuid) as r`)[0].r, condiciones = async () => {
    let c = (await sql2`select valor from core.parametros where clave = 'nom.comision'`)[0]?.valor ?? {}, clp2 = (n) => "$" + Number(n).toLocaleString("es-CL");
    return {
      comision: c.pct_hasta_umbral ? `Si el auto se vende en menos de ${clp2(c.umbral_clp)}, la comisión es el ${c.pct_hasta_umbral}% del precio de venta, con un mínimo de ${clp2(c.minimo_clp)}. Desde ${clp2(c.umbral_clp)}, es ${clp2(c.fijo_desde_umbral_clp ?? 1e6)} o el ${String(c.pct_sobre_umbral).replace(".", ",")}% del precio de venta, lo que sea mayor. Todo con IVA incluido y solo se cobra si vendemos el auto.` : null,
      fee: c.como_decirlo_fee ?? null,
      exclusividad: "45 días, con renovación automática.",
      regla: "Informa la comisión solo si el cliente la pregunta. No la negocies: si pide condiciones distintas, traspasa. Para los $50.000 usa el texto de `fee` tal cual: nunca digas «fee de entrada» ni «no reembolsable» en el chat (eso queda en el contrato)."
    };
  };
  return {
    async nom_solicitar_tasacion(i) {
      return exigirNom(), escribir ? { ok: !0, data: { ...(await sql2`select core.api_nom_wa_solicitar_tasacion(${conv.id}::uuid, ${sql2.json(i)}, ${AUTOR}) as r`)[0].r, instruccion: "No des cifras. Di que revisas el mercado de hoy con avisos reales comparables y que le envías el informe por aquí, normalmente durante el día hábil." } } : { ok: !0, data: { simulado: !0, folio: "NOM-TAS-SIM", estado: "en_investigacion" } };
    },
    async nom_estado() {
      return { ok: !0, data: { ...await estadoNom(), condiciones: await condiciones() } };
    },
    async nom_proponer_visita(i) {
      exigirNom();
      let est = await estadoNom();
      if (!est?.tasacion || !["aprobada", "enviada"].includes(est.tasacion.estado))
        return { ok: !1, error: "La visita se agenda después de enviar el informe de tasación. Si aún no está, dile que se lo envías apenas esté listo." };
      let desde = i?.desde && /^\d{4}-\d{2}-\d{2}$/.test(i.desde) ? /* @__PURE__ */ new Date(`${i.desde}T00:00:00-03:00`) : /* @__PURE__ */ new Date(), base = desde > /* @__PURE__ */ new Date() ? desde : /* @__PURE__ */ new Date(), cupos = await sql2`select inicio, fin, texto, to_char(inicio at time zone 'America/Santiago', 'YYYY-MM-DD"T"HH24:MI') local
                             from nom.cupos(${base})`, calendario = "sin conexión (solo cupos de Core)";
      if (gcalConectado() && cupos.length)
        try {
          let oc = await ocupados(new Date(cupos[0].inicio), new Date(cupos[cupos.length - 1].fin));
          cupos = libres(cupos, oc), calendario = "cruzado con Google Calendar";
        } catch (e) {
          calendario = `no se pudo leer (${String(e?.message ?? e).slice(0, 80)})`;
        }
      i?.preferencia === "manana" && (cupos = cupos.filter((c) => Number(c.local.slice(11, 13)) < 13)), i?.preferencia === "tarde" && (cupos = cupos.filter((c) => Number(c.local.slice(11, 13)) >= 13));
      let opciones = [];
      for (let c of cupos) {
        if (opciones.length >= 2) break;
        opciones.length === 1 && opciones[0].inicio_local.slice(0, 10) === c.local.slice(0, 10) && cupos.some((x) => x.local.slice(0, 10) !== c.local.slice(0, 10)) || opciones.push({ inicio_local: c.local, texto: c.texto });
      }
      let [of, auto, tr] = await Promise.all([
        sql2`select valor from core.parametros where clave = 'nom.oficina'`,
        sql2`select valor from core.parametros where clave = 'nom.automatizacion'`,
        sql2`select valor - 'usos' as v from core.parametros where clave = 'nom.transferencia'`
      ]), o = of[0]?.valor ?? {}, a = auto[0]?.valor ?? {}, alAgendar = a.fee_momento === "al_agendar";
      return {
        ok: !0,
        data: {
          opciones,
          sin_cupo_cercano: opciones.length === 0,
          calendario,
          lugar: `${o.direccion}, ${o.sector}, ${o.comuna}`,
          duracion: "unas 2 horas",
          que_hacemos: "inspección completa (estética, mecánica y documentos) y fotos profesionales para la publicación",
          fee: {
            monto: a.fee_monto ?? 5e4,
            momento: alAgendar ? "al_agendar" : "en_visita",
            como_decirlo: alAgendar ? `Para reservar la hora se transfieren $${Number(a.fee_monto ?? 5e4).toLocaleString("es-CL")} por el servicio de inicio: inspección completa, fotos profesionales y publicación en los portales. Ese monto se descuenta de la comisión cuando vendemos tu auto.` : `El día de la visita se paga $${Number(a.fee_monto ?? 5e4).toLocaleString("es-CL")} por el servicio de inicio, por transferencia: inspección completa, fotos profesionales y publicación en los portales. Ese monto se descuenta de la comisión cuando vendemos tu auto.`
          },
          datos_transferencia: alAgendar ? tr[0]?.v ?? null : null,
          preparacion: o.preparacion_cliente ?? []
        }
      };
    },
    async nom_reservar_visita(i) {
      if (exigirNom(), !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(i.inicio ?? ""))) return { ok: !1, error: "Formato de inicio inválido (YYYY-MM-DDTHH:MM)" };
      if (!escribir) return { ok: !0, data: { simulado: !0, cuando: i.inicio, estado: "reservada" } };
      let r = (await sql2`select core.api_nom_wa_reservar_visita(${conv.id}::uuid, ${sql2.json({ inicio: i.inicio, nombre: i.nombre ?? null, email: i.email ?? null })}, ${AUTOR}) as r`)[0].r;
      return (i.nombre || i.email) && await sql2`update wa.conversaciones set ficha = ficha || ${sql2.json({ ...i.nombre ? { nombre: i.nombre } : {}, ...i.email ? { email: i.email } : {} })} where id = ${conv.id}::uuid`, { ok: !0, data: r };
    },
    async nom_registrar_comprobante(i) {
      if (exigirNom(), !escribir) return { ok: !0, data: { simulado: !0, estado: "pendiente de validación" } };
      let m = await sql2`select id from wa.mensajes where conversacion_id = ${conv.id}::uuid and direccion = 'entrante' and tipo in ('image','document') order by enviado_en desc limit 1`;
      return { ok: !0, data: (await sql2`select core.api_nom_wa_comprobante(${conv.id}::uuid, ${sql2.json({ monto: i?.monto ?? null, nota: i?.nota ?? null, mensaje_id: m[0]?.id ?? null })}, ${AUTOR}) as r`)[0].r };
    },
    async nom_cancelar_visita(i) {
      return exigirNom(), escribir ? { ok: !0, data: (await sql2`select core.api_nom_wa_cancelar_visita(${conv.id}::uuid, ${i.motivo ?? "cliente"}, ${AUTOR}) as r`)[0].r } : { ok: !0, data: { simulado: !0 } };
    }
  };
}

// documentos.ts
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
var NEGRO = rgb(0.08, 0.08, 0.08), GRIS = rgb(0.42, 0.42, 0.42), LINEA = rgb(0.85, 0.85, 0.85), FONDO = rgb(0.965, 0.965, 0.965), DORADO = rgb(0.639, 0.494, 0.173), LOGO_URL = "https://app.carclass.cl/img/logo.png", clp = (n) => "$" + Math.round(n).toLocaleString("es-CL").replace(/,/g, "."), limpiar = (t) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ·—–•]/g, "");
function partir(texto, font, size, ancho) {
  let out = [];
  for (let parrafo of limpiar(texto).split(`
`)) {
    let linea = "";
    for (let w of parrafo.split(" ")) {
      let prueba = linea ? `${linea} ${w}` : w;
      font.widthOfTextAtSize(prueba, size) <= ancho ? linea = prueba : (linea && out.push(linea), linea = w);
    }
    out.push(linea);
  }
  return out;
}
var logoCache = null;
async function logo() {
  if (logoCache) return logoCache;
  try {
    let r = await fetch(LOGO_URL);
    return r.ok ? (logoCache = new Uint8Array(await r.arrayBuffer()), logoCache) : null;
  } catch {
    return null;
  }
}
async function pdfPpf(d) {
  let doc = await PDFDocument.create();
  doc.setTitle(`Cotización PPF ${d.vehiculo} · Carclass`), doc.setAuthor("Carclass");
  let page = doc.addPage([595.28, 841.89]), reg = await doc.embedFont(StandardFonts.Helvetica), neg = await doc.embedFont(StandardFonts.HelveticaBold), M = 44, W = 595.28 - 2 * M, y = 841.89 - 40, txt = (t, x, yy, size, font = reg, color = NEGRO) => page.drawText(limpiar(t), { x, y: yy, size, font, color }), der = (t, xDer, yy, size, font = reg, color = NEGRO) => txt(t, xDer - font.widthOfTextAtSize(limpiar(t), size), yy, size, font, color), lb = await logo();
  if (lb)
    try {
      let img = await doc.embedPng(lb);
      page.drawImage(img, { x: M, y: y - 62, width: 66, height: 66 });
    } catch {
    }
  txt("CARCLASS", M + 80, y - 22, 20, neg), txt("Protección y estética vehicular · Instalador oficial XPEL", M + 80, y - 38, 9, reg, GRIS), der("COTIZACIÓN PPF", M + W, y - 18, 13, neg), der(`N° ${d.numero}`, M + W, y - 34, 9, reg, GRIS), der(`Emitida el ${d.fecha}`, M + W, y - 46, 9, reg, GRIS), der(`Válida hasta el ${d.vigencia}`, M + W, y - 58, 9, reg, GRIS), y -= 78, page.drawRectangle({ x: M, y, width: W, height: 2, color: DORADO }), y -= 26;
  let col2 = M + W / 2;
  txt("CLIENTE", M, y, 7.5, neg, GRIS), txt("VEHÍCULO", col2, y, 7.5, neg, GRIS), y -= 15, txt(d.cliente || "—", M, y, 11.5, neg);
  let veh = partir(d.vehiculo, neg, 11.5, W / 2);
  veh.forEach((l, i) => txt(l, col2, y - i * 14, 11.5, neg)), y -= 14 * Math.max(1, veh.length) + 16, txt("Protección de pintura (PPF) XPEL", M, y, 15, neg), y -= 16;
  for (let l of partir("Film transparente que absorbe piedras, gravilla y rayas, y protege la pintura original. Valores con IVA e instalación incluidos, según la plantilla del fabricante para este modelo.", reg, 9.5, W))
    txt(l, M, y, 9.5, reg, GRIS), y -= 13;
  y -= 10;
  let c1 = W * 0.5, c2 = W * 0.25, xG = M + c1, xU = M + c1 + c2;
  page.drawRectangle({ x: M, y: y - 34, width: W, height: 40, color: NEGRO }), txt("COBERTURA", M + 10, y - 18, 8.5, neg, rgb(1, 1, 1)), der("XPEL XTREME", xG + c2 - 10, y - 12, 8.5, neg, rgb(1, 1, 1)), der("brillante · 7,1 mil", xG + c2 - 10, y - 25, 7.5, reg, rgb(0.8, 0.8, 0.8)), der("XPEL ULTIMATE PLUS 8", xU + c2 - 10, y - 12, 8.5, neg, rgb(1, 1, 1)), der("brillante · 7,6 mil", xU + c2 - 10, y - 25, 7.5, reg, rgb(0.8, 0.8, 0.8)), y -= 34;
  for (let [i, f] of d.filas.entries()) {
    let det = partir(f.detalle, reg, 8.5, c1 - 20), alto = 27 + det.length * 11;
    i % 2 === 1 && page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO }), txt(f.nombre, M + 10, y - 16, 10.5, neg), det.forEach((l, k) => txt(l, M + 10, y - 29 - k * 11, 8.5, reg, GRIS));
    let pre = d.estimado ? "desde " : "";
    der(f.gloss ? pre + clp(f.gloss) : "a cotizar", xG + c2 - 10, y - 18, 11, neg), der(f.ultimate ? pre + clp(f.ultimate) : "a cotizar", xU + c2 - 10, y - 18, 11, neg), y -= alto, page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINEA });
  }
  if (y -= 22, d.paquetes.length) {
    txt("PAQUETES CARCLASS CON PPF XPEL XTREME", M, y, 8.5, neg, DORADO), y -= 8;
    for (let p of d.paquetes) {
      let det = partir(p.detalle, reg, 8.5, W - 130), alto = 27 + det.length * 11;
      page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, borderColor: LINEA, borderWidth: 0.8, color: rgb(1, 1, 1) }), txt(p.nombre, M + 10, y - 16, 10.5, neg), det.forEach((l, k) => txt(l, M + 10, y - 29 - k * 11, 8.5, reg, GRIS)), der((d.estimado ? "desde " : "") + clp(p.precio), M + W - 10, y - 18, 11, neg), y -= alto + 6;
    }
    y -= 12;
  }
  txt("CONDICIONES", M, y, 8.5, neg, GRIS), y -= 14;
  let cond = [
    d.estimado ? "Valores referenciales: aún no tenemos la plantilla exacta de este modelo. Te confirmamos el valor final con el instalador antes de agendar." : "Valores sujetos a revisión del vehículo en la recepción.",
    "Para reservar se abonan $50.000, que se descuentan del total. Al recibir el auto se completa el 50% y el saldo se paga a la entrega.",
    "Recepción en nuestro taller del complejo industrial Alto Portezuelo, en Quilicura, o en nuestra oficina de Av. Puerta Oriente 361, oficina 409B, Chicureo, previa coordinación.",
    "Instalación por técnicos certificados XPEL, con control de calidad e informe fotográfico. Garantía según la línea elegida."
  ];
  for (let c of cond) {
    let ls = partir(c, reg, 8.5, W - 12);
    page.drawCircle({ x: M + 3, y: y + 3, size: 1.6, color: DORADO }), ls.forEach((l, k) => txt(l, M + 12, y - k * 11.5, 8.5, reg, NEGRO)), y -= ls.length * 11.5 + 5;
  }
  return page.drawLine({ start: { x: M, y: 52 }, end: { x: M + W, y: 52 }, thickness: 0.6, color: LINEA }), txt("Carclass · +56 9 8670 4745 · carclass.cl · @carclass.cl", M, 38, 8.5, reg, GRIS), der("Responde por WhatsApp para reservar", M + W, 38, 8.5, neg, NEGRO), await doc.save();
}
async function pdfCotizacion(d) {
  let doc = await PDFDocument.create();
  doc.setTitle(`Cotización ${d.numero} · Carclass`), doc.setAuthor("Carclass");
  let page = doc.addPage([595.28, 841.89]), reg = await doc.embedFont(StandardFonts.Helvetica), neg = await doc.embedFont(StandardFonts.HelveticaBold), M = 44, W = 595.28 - 2 * M, y = 841.89 - 40, txt = (t, x, yy, size, font = reg, color = NEGRO) => page.drawText(limpiar(t), { x, y: yy, size, font, color }), der = (t, xDer, yy, size, font = reg, color = NEGRO) => txt(t, xDer - font.widthOfTextAtSize(limpiar(t), size), yy, size, font, color), lb = await logo();
  if (lb)
    try {
      let img = await doc.embedPng(lb);
      page.drawImage(img, { x: M, y: y - 62, width: 66, height: 66 });
    } catch {
    }
  txt("CARCLASS", M + 80, y - 22, 20, neg), txt("Protección y estética vehicular · Instalador oficial XPEL", M + 80, y - 38, 9, reg, GRIS), der("COTIZACIÓN", M + W, y - 18, 13, neg), der(`N° ${d.numero}`, M + W, y - 34, 9, reg, GRIS), der(`Emitida el ${d.fecha}`, M + W, y - 46, 9, reg, GRIS), der(`Válida hasta el ${d.vigencia}`, M + W, y - 58, 9, reg, GRIS), y -= 78, page.drawRectangle({ x: M, y, width: W, height: 2, color: DORADO }), y -= 26;
  let col2 = M + W / 2;
  txt("CLIENTE", M, y, 7.5, neg, GRIS), txt("VEHÍCULO", col2, y, 7.5, neg, GRIS), y -= 15, txt(d.cliente || "—", M, y, 11.5, neg);
  let veh = partir(d.vehiculo || "—", neg, 11.5, W / 2);
  veh.forEach((l, i) => txt(l, col2, y - i * 14, 11.5, neg)), y -= 14 * Math.max(1, veh.length) + 22;
  let cN = W * 0.56, cC = W * 0.1, cP = W * 0.17;
  page.drawRectangle({ x: M, y: y - 26, width: W, height: 26, color: NEGRO });
  let blanco = rgb(1, 1, 1);
  txt("SERVICIO", M + 10, y - 17, 8.5, neg, blanco), der("CANT.", M + cN + cC - 6, y - 17, 8.5, neg, blanco), der("PRECIO", M + cN + cC + cP - 6, y - 17, 8.5, neg, blanco), der("TOTAL", M + W - 10, y - 17, 8.5, neg, blanco), y -= 26;
  for (let [i, l] of d.lineas.entries()) {
    let det = l.descripcion ? partir(l.descripcion, reg, 8.5, cN - 20) : [], alto = 27 + det.length * 11;
    i % 2 === 1 && page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO });
    let nom = partir(l.nombre, neg, 10.5, cN - 20)[0] ?? l.nombre;
    txt(nom, M + 10, y - 16, 10.5, neg), det.forEach((t, k) => txt(t, M + 10, y - 29 - k * 11, 8.5, reg, GRIS)), der(String(l.cantidad), M + cN + cC - 6, y - 16, 10, reg), der(clp(l.precio), M + cN + cC + cP - 6, y - 16, 10, reg), der(clp(l.precio * l.cantidad), M + W - 10, y - 16, 10.5, neg), y -= alto, page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINEA });
  }
  let neto = Math.round(d.total / 1.19);
  y -= 16;
  let fila = (k, v, grande = !1) => {
    txt(k, M + W - 210, y, grande ? 11 : 9.5, grande ? neg : reg, grande ? NEGRO : GRIS), der(v, M + W - 10, y, grande ? 13 : 10, grande ? neg : reg), y -= grande ? 22 : 15;
  };
  fila("Neto", clp(neto)), fila("IVA 19%", clp(d.total - neto)), page.drawLine({ start: { x: M + W - 210, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.8, color: DORADO }), y -= 4, fila("TOTAL (IVA incluido)", clp(d.total), !0), y -= 14, txt("CONDICIONES", M, y, 8.5, neg, GRIS), y -= 14;
  let cond = [
    ...d.notas ? [d.notas] : [],
    "Valores con IVA incluido, sujetos a revisión del vehículo en la recepción.",
    "Para reservar se abonan $50.000, que se descuentan del total. Al recibir el auto se completa el 50% y el saldo se paga a la entrega.",
    "Recepción en nuestro taller del complejo industrial Alto Portezuelo, en Quilicura, o en nuestra oficina de Av. Puerta Oriente 361, oficina 409B, Chicureo, previa coordinación.",
    "Instalación por técnicos certificados XPEL, con control de calidad e informe fotográfico."
  ];
  for (let c of cond) {
    let ls = partir(c, reg, 8.5, W - 12);
    page.drawCircle({ x: M + 3, y: y + 3, size: 1.6, color: DORADO }), ls.forEach((l, k) => txt(l, M + 12, y - k * 11.5, 8.5, reg, NEGRO)), y -= ls.length * 11.5 + 5;
  }
  return page.drawLine({ start: { x: M, y: 52 }, end: { x: M + W, y: 52 }, thickness: 0.6, color: LINEA }), txt("Carclass · +56 9 8670 4745 · carclass.cl · @carclass.cl", M, 38, 8.5, reg, GRIS), der("Responde por WhatsApp para reservar", M + W, 38, 8.5, neg, NEGRO), await doc.save();
}
async function subirDocumento(nombreArchivo2, bytes, carpeta = "ppf") {
  let base = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), ruta = `${carpeta}/${crypto.randomUUID().replace(/-/g, "")}/${nombreArchivo2}`, r = await fetch(`${base}/storage/v1/object/documentos/${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: new Blob([bytes], { type: "application/pdf" })
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/documentos/${ruta}`;
}
function nombreArchivo(vehiculo) {
  return `Cotizacion-PPF-${vehiculo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "vehiculo"}.pdf`;
}

// herramientas.ts
var AUTOR2 = "Agente IA", TZ = "America/Santiago", HERRAMIENTAS = [
  {
    name: "asignar_unidad",
    description: "Asigna la unidad de negocio a la conversación y crea el lead en Carclass Core. Úsala apenas sepas la unidad si aún no está asignada.",
    input_schema: {
      type: "object",
      properties: {
        unidad: { type: "string", enum: ["carclass", "nom", "blackgps", "carwash"] },
        flujo: { type: "string", enum: ["consignante", "comprador"], description: "Solo para NOM." }
      },
      required: ["unidad"],
      additionalProperties: !1
    }
  },
  {
    name: "actualizar_ficha",
    description: "Guarda datos que dio el cliente (nombre, correo, marca, modelo, anio, patente, servicio_interes, comuna, uso, urgencia, notas). Llámala cada vez que aparezca un dato nuevo.",
    input_schema: {
      type: "object",
      properties: {
        campos: {
          type: "object",
          description: "Pares campo → valor. Campos sugeridos: nombre, email, marca, modelo, anio, patente, servicio_interes, comuna, uso, urgencia, notas.",
          additionalProperties: { type: ["string", "number", "boolean"] }
        }
      },
      required: ["campos"],
      additionalProperties: !1
    }
  },
  {
    name: "consultar_catalogo",
    description: "Catálogo vigente con precios con IVA. Devuelve si el precio es aproximado y si requiere validación humana. Úsala antes de mencionar cualquier precio que no sea PPF por modelo.",
    input_schema: {
      type: "object",
      properties: {
        unidad: { type: "string", enum: ["carclass", "nom", "carwash"] },
        codigo: { type: "string", description: "Opcional: código exacto (ej. protect_plus, ceramico_4, laminas_8)." }
      },
      required: ["unidad"],
      additionalProperties: !1
    }
  },
  {
    name: "consultar_ppf_modelo",
    description: "Precio público XPEL por modelo de auto (planillas del taller): kits de PPF en Gloss y Ultimate/Stealth, y los paquetes Shield y Protection Pack ya calculados. Úsala antes de dar cualquier precio de PPF o de esos paquetes.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string" },
        modelo: { type: "string" },
        anio: { type: "integer" }
      },
      required: ["marca", "modelo"],
      additionalProperties: !1
    }
  },
  {
    name: "enviar_cotizacion_ppf",
    description: "Arma y envía al cliente el PDF de cotización de PPF de su modelo: kit frontal completo y completo exterior en XPEL Xtreme y Ultimate Plus 8 (precios públicos de la planilla del taller), más Shield y Protection Pack. Solo si consultar_ppf_modelo encontró planilla. El documento se envía solo después de tu mensaje.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string" },
        modelo: { type: "string" },
        anio: { type: "integer" },
        incluir_reducido: { type: "boolean", description: "Solo si el cliente pidió el kit frontal reducido." }
      },
      required: ["marca", "modelo"],
      additionalProperties: !1
    }
  },
  {
    name: "consultar_stock_nom",
    description: "Autos disponibles en NOM (marca, modelo, año, km, precio publicado). Nunca menciones autos que no salgan de aquí.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Texto libre: marca, modelo o tipo." },
        precio_max: { type: "integer" }
      },
      additionalProperties: !1
    }
  },
  {
    name: "crear_cotizacion",
    description: "Crea (o actualiza, si ya hay una abierta en esta conversación) la cotización de Carclass en Core con los ítems y precios que ya obtuviste de las herramientas. Genera el PDF de la cotización, que se envía al cliente por WhatsApp después de tu mensaje. Devuelve número y vigencia.",
    input_schema: {
      type: "object",
      properties: {
        vehiculo: { type: "string", description: "Marca, modelo y año." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              codigo: { type: "string" },
              descripcion: { type: "string" },
              precio: { type: "integer", description: "CLP con IVA." },
              cantidad: { type: "integer" }
            },
            required: ["descripcion", "precio"],
            additionalProperties: !1
          }
        },
        notas: { type: "string" }
      },
      required: ["items"],
      additionalProperties: !1
    }
  },
  {
    name: "proponer_horarios",
    description: "Devuelve 2 horarios con cupo para recibir el auto, los lugares de recepción, plazos aproximados, política de retiro, condiciones de pago y datos de transferencia. Úsala antes de ofrecer fechas o explicar el pago.",
    input_schema: {
      type: "object",
      properties: {
        servicio: { type: "string", enum: ["ceramico", "ppf_frontal", "laminas", "ppf_total", "otro"] },
        lugar: { type: "string", enum: ["taller", "chicureo"], description: "Por defecto taller." },
        desde: { type: "string", description: "Opcional: fecha mínima YYYY-MM-DD que pidió el cliente." }
      },
      required: ["servicio"],
      additionalProperties: !1
    }
  },
  {
    name: "reservar_cita",
    description: "Reserva el horario elegido (uno de los que entregó proponer_horarios) después de recibir el comprobante de la reserva.",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Fecha y hora local de Chile, formato YYYY-MM-DDTHH:MM." },
        servicio: { type: "string", enum: ["ceramico", "ppf_frontal", "laminas", "ppf_total", "otro"] },
        lugar: { type: "string", enum: ["taller", "chicureo", "retiro"] },
        email_cliente: { type: "string" }
      },
      required: ["inicio", "servicio", "lugar"],
      additionalProperties: !1
    }
  },
  {
    name: "registrar_comprobante",
    description: "Registra que llegó un comprobante de transferencia (queda pendiente de validación por Felipe).",
    input_schema: {
      type: "object",
      properties: { monto: { type: "integer" }, nota: { type: "string" } },
      additionalProperties: !1
    }
  },
  {
    name: "programar_seguimiento",
    description: "Programa los seguimientos según el plan de la unidad (Carclass: 23 h, día 3, día 7, día 10 se marca perdida; BlackGPS: día 1, 4, 10 y 21). Úsala al enviar una cotización, cuando el cliente pide tiempo o, en BlackGPS, cuando la conversación queda en pausa.",
    input_schema: {
      type: "object",
      properties: { idea: { type: "string", description: "Qué aporte nuevo conviene en el seguimiento." } },
      required: ["idea"],
      additionalProperties: !1
    }
  },
  {
    name: "traspasar_humano",
    description: "Pasa el caso a Felipe: crea una tarea con la nota y pausa al agente 12 h en esta conversación.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        nota: { type: "string", description: "[Lead caliente] Nombre · auto · qué quiere · qué ofrecí · qué falta para cerrar" },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] }
      },
      required: ["motivo", "nota"],
      additionalProperties: !1
    }
  },
  {
    name: "marcar_personal",
    description: "El chat es personal (no de negocio): se marca como personal, se borra el contenido guardado y no se responde.",
    input_schema: { type: "object", properties: {}, additionalProperties: !1 }
  },
  {
    name: "descartar",
    description: "Cierra el lead como perdido con un motivo de la lista fija.",
    input_schema: {
      type: "object",
      properties: {
        motivo_codigo: { type: "string", enum: ["precio", "competencia", "sin_respuesta", "fuera_zona", "no_califica", "desistio", "datos_erroneos", "duplicado", "otro"] },
        nota: { type: "string" }
      },
      required: ["motivo_codigo"],
      additionalProperties: !1
    }
  },
  // NOM consignante (Fase 2): tasación, visita en Chicureo y fee
  ...HERRAMIENTAS_NOM
], norm = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim(), ALIAS = { mercedes: "mb", benz: "", volkswagen: "vw", chevrolet: "chevy" };
function normModelo(t) {
  return norm(t.replace(/mercedes[- ]benz/gi, "mercedes")).split(" ").map((w) => w in ALIAS ? ALIAS[w] : w).filter(Boolean).join(" ");
}
async function parametro(sql2, clave2) {
  return (await sql2`select valor from core.parametros where clave = ${clave2}`)[0]?.valor ?? null;
}
var redondearMil = (n) => Math.round(n / 1e3) * 1e3;
function partesChile(d) {
  let f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hour12: !1 }), p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value])), dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { fecha: `${p.year}-${p.month}-${p.day}`, dow: dias[p.weekday], hora: Number(p.hour) };
}
function instanteChile(fecha, hhmm) {
  let guess = /* @__PURE__ */ new Date(`${fecha}T${hhmm}:00Z`), m = (new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" }).formatToParts(guess).find((x) => x.type === "timeZoneName")?.value ?? "GMT-3").match(/GMT([+-]\d+)(?::(\d+))?/), horas = m ? Number(m[1]) : -3, mins = m && m[2] ? Number(m[2]) * Math.sign(horas) : 0;
  return new Date(guess.getTime() - (horas * 60 + mins) * 6e4);
}
function sumarDias(fecha, n) {
  let d = /* @__PURE__ */ new Date(`${fecha}T12:00:00Z`);
  return d.setUTCDate(d.getUTCDate() + n), d.toISOString().slice(0, 10);
}
function textoFecha(d) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}
function crearEjecutor(o) {
  let { sql: sql2, conv } = o, simular2 = !!o.simular, ahora = o.ahora ?? /* @__PURE__ */ new Date(), escribir = !simular2;
  async function moverEtapa(etapa, extra = {}) {
    if (!escribir || !conv.oportunidad_id) return;
    let prox = sumarDias(partesChile(ahora).fecha, 1);
    await sql2`select core.api_mover_etapa(${sql2.json({ oportunidad_id: conv.oportunidad_id, etapa, proxima_fecha: prox, ...extra })}, ${AUTOR2})`;
  }
  let impl = {
    async asignar_unidad(i) {
      if (conv.unidad && conv.oportunidad_id) return { ok: !0, data: { ya_asignada: conv.unidad } };
      if (!escribir)
        return conv.unidad = i.unidad, { ok: !0, data: { simulado: !0, unidad: i.unidad } };
      let res = (await sql2`select wa.asignar_unidad(${conv.id}::uuid, ${i.unidad}, ${i.flujo ?? null}, ${AUTOR2}) as r`)[0].r;
      return conv.unidad = i.unidad, conv.flujo = i.flujo ?? null, conv.oportunidad_id = res?.oportunidad_id ?? conv.oportunidad_id, conv.empresa_id = res?.cliente_id ?? conv.empresa_id, { ok: !0, data: { unidad: i.unidad, lead_creado: !0 } };
    },
    async actualizar_ficha(i) {
      let campos = i.campos ?? {};
      return conv.ficha = { ...conv.ficha, ...campos }, escribir ? (await sql2`update wa.conversaciones set ficha = ficha || ${sql2.json(campos)},
                  nombre = coalesce(nombre, ${campos.nombre ?? null}), actualizado_en = now()
                where id = ${conv.id}::uuid`, conv.empresa_id && typeof campos.email == "string" && await sql2`update crm.empresas set email = coalesce(email, ${campos.email}) where id = ${conv.empresa_id}::uuid`, conv.empresa_id && typeof campos.comuna == "string" && await sql2`update crm.empresas set comuna = coalesce(comuna, ${campos.comuna}) where id = ${conv.empresa_id}::uuid`, conv.oportunidad_id && (await sql2`select etapa from crm.oportunidades where id = ${conv.oportunidad_id}::uuid`)[0]?.etapa === "nuevo" && await moverEtapa("calificando", { proxima_accion: "Calificar y recomendar" }), { ok: !0 }) : { ok: !0, data: { simulado: !0 } };
    },
    async consultar_catalogo(i) {
      let filas = await sql2`
        select codigo, nombre, tipo, descripcion, precio, aproximado, requiere_humano
        from crm.catalogo
        where activo and unidad = ${i.unidad} and (${i.codigo ?? null}::text is null or codigo = ${i.codigo ?? null})
        order by orden`, enlaces = await parametro(sql2, "carclass.enlaces");
      return { ok: !0, data: { moneda: "CLP con IVA", items: filas.map((f) => ({ ...f, enlace: enlaces?.por_codigo?.[f.codigo] ?? null })) } };
    },
    async consultar_ppf_modelo(i) {
      let crudas = normModelo(`${i.marca} ${i.modelo}`).split(" ").filter((w) => w.length > 0), palabras = [];
      for (let w of crudas) {
        let prev = palabras[palabras.length - 1];
        prev && /^\d{1,3}[a-z]?$/.test(w) && /[a-z]$/.test(prev) ? palabras[palabras.length - 1] = prev + w : palabras.push(w);
      }
      let buscar = (ws) => sql2`
        select modelo, modelo_norm, fecha_planilla, material, kit, precio_publico, drive_file_id
        from crm.ppf_modelos
        where not es_pieza
          and not exists (select 1 from unnest(${ws}::text[]) w where position(w in replace(modelo_norm, ' ', '')) = 0)
        order by fecha_planilla desc nulls last`, exactas = (fs, ws) => fs.filter((f) => {
        let t = String(f.modelo_norm).split(" "), set = /* @__PURE__ */ new Set([...t, ...t.slice(1).map((x, k) => t[k] + x)]);
        return ws.every((w) => set.has(w));
      }), afinar = (fs, ws) => {
        let e = exactas(fs, ws);
        return e.length ? e : fs;
      }, filas = afinar(await buscar(palabras), palabras);
      filas.length === 0 && palabras.length > 1 && (filas = afinar(await buscar(palabras.slice(1)), palabras.slice(1)));
      let cat = await sql2`select codigo, precio from crm.catalogo where activo and unidad = 'carclass' and codigo in ('ceramico_4','laminas','laminas_8','ppf_frontal','ppf_frontal_reducido','shield','protection_pack')`, precio = (c) => Number(cat.find((x) => x.codigo === c)?.precio ?? 0);
      if (filas.length === 0) {
        let marca = normModelo(String(i.marca ?? "")).split(" ")[0] ?? "", med = marca ? await sql2`
          select percentile_cont(0.5) within group (order by precio_publico)::int kit5, count(*)::int n
          from crm.ppf_modelos where not es_pieza and material = 'gloss' and kit = 'kit_frontal_5' and precio_publico > 0
            and split_part(modelo_norm, ' ', 1) = ${marca} and fecha_planilla >= current_date - interval '3 years'` : [], kit5 = med[0]?.n >= 2 ? redondearMil(Number(med[0].kit5)) : precio("ppf_frontal"), cer42 = precio("ceramico_4"), lam42 = precio("laminas"), vehiculo = [i.marca, i.modelo, i.anio].filter(Boolean).join(" ");
        if (escribir) {
          let titulo = `[PPF] Pedir planilla a Hiendcar · ${vehiculo}`;
          (await sql2`select 1 from ops.tareas where titulo = ${titulo} and estado in ('pendiente','en_curso') limit 1`.catch(() => [])).length === 0 && await sql2`select core.api_crear_tarea(${sql2.json({
            titulo,
            descripcion: `El cliente ${conv.nombre ?? conv.telefono_norm ?? ""} pidió PPF para un ${vehiculo} y no hay planilla de ese modelo. El asesor le dio un valor estimado; pide la planilla a Hiendcar y confirma el valor al cliente.`,
            unidad: "carclass",
            responsable: "Felipe",
            vence: partesChile(ahora).fecha,
            prioridad: "alta",
            oportunidad_id: conv.oportunidad_id,
            empresa_id: conv.empresa_id
          })}, ${AUTOR2})`;
        }
        return {
          ok: !0,
          data: {
            encontrado: !1,
            instruccion: "No tenemos la planilla de este modelo. Da el kit frontal como valor estimado («aproximadamente» o «desde»), di que confirmas el valor exacto con el taller y le escribes apenas lo tengas, y sigue la conversación (no traspases ni envíes PDF). Ya quedó la tarea para pedir la planilla.",
            estimado: {
              base: med[0]?.n >= 2 ? `mediana de ${med[0].n} planillas de la misma marca` : "valor referencial del catálogo",
              ppf_kit_frontal_xtreme: kit5,
              carclass_shield: redondearMil((kit5 + cer42) * 0.95),
              carclass_protection_pack_laminas_4_micras: redondearMil((kit5 + cer42 + lam42) * 0.95)
            }
          }
        };
      }
      let porArchivo = /* @__PURE__ */ new Map();
      for (let f of filas) {
        let k = f.drive_file_id;
        porArchivo.has(k) || porArchivo.set(k, []), porArchivo.get(k).push(f);
      }
      let candidatos = [...porArchivo.values()], elegido = candidatos[0];
      if (i.anio) {
        let conAnio = candidatos.find((c) => String(c[0].modelo).includes(String(i.anio)));
        conAnio && (elegido = conAnio);
      }
      let kit = (mat, k) => Number(elegido.find((f) => f.material === mat && f.kit === k)?.precio_publico ?? 0) || null, kit5g = kit("gloss", "kit_frontal_5"), desc = 0.95, cer4 = precio("ceramico_4"), lam4 = precio("laminas");
      return {
        ok: !0,
        data: {
          encontrado: !0,
          modelo_planilla: elegido[0].modelo,
          otros_modelos_parecidos: candidatos.length > 1 ? candidatos.filter((c) => c !== elegido).map((c) => c[0].modelo).slice(0, 4) : [],
          moneda: "CLP con IVA, instalación incluida",
          xpel_gloss: { kit_frontal_reducido: kit("gloss", "kit_frontal_reducido"), kit_frontal_5_piezas: kit5g, completo_exterior_wpf: kit("gloss", "completo_wpf") },
          xpel_ultimate_o_stealth_solo_si_lo_pide: { kit_frontal_reducido: kit("ultimate_stealth", "kit_frontal_reducido"), kit_frontal_5_piezas: kit("ultimate_stealth", "kit_frontal_5"), completo_exterior_wpf: kit("ultimate_stealth", "completo_wpf") },
          paquetes: kit5g ? {
            carclass_shield: redondearMil((kit5g + cer4) * desc),
            carclass_protection_pack_laminas_4_micras: redondearMil((kit5g + cer4 + lam4) * desc),
            nota: "Paquetes con su descuento ya incluido. Sin descuentos adicionales."
          } : null,
          ppf_total: "El PPF total es el completo exterior de esta planilla (va en el PDF): da ese valor si lo piden, sujeto a revisión del auto en la recepción. No traspases por eso."
        }
      };
    },
    async enviar_cotizacion_ppf(i) {
      let d = (await impl.consultar_ppf_modelo(i))?.data;
      if (!d?.encontrado) return { ok: !1, error: "No hay planilla de este modelo: da el valor estimado de consultar_ppf_modelo en el texto, sin PDF." };
      let g = d.xpel_gloss, u = d.xpel_ultimate_o_stealth_solo_si_lo_pide, filas = [
        ...i.incluir_reducido ? [{ nombre: "Kit frontal reducido", detalle: "Parachoques delantero y focos, con capó y guardabarros parciales.", gloss: g.kit_frontal_reducido, ultimate: u.kit_frontal_reducido }] : [],
        { nombre: "Kit frontal completo", detalle: "Capó, guardabarros, espejos, parachoques y focos delanteros.", gloss: g.kit_frontal_5_piezas, ultimate: u.kit_frontal_5_piezas },
        { nombre: "Completo exterior", detalle: "Todas las piezas pintadas del auto.", gloss: g.completo_exterior_wpf, ultimate: u.completo_exterior_wpf }
      ].filter((f) => f.gloss || f.ultimate), pq = d.paquetes, paquetes = pq ? [
        { nombre: "Carclass Shield", detalle: "Kit frontal completo + sellado cerámico 4 años con corrección de pintura e informe técnico.", precio: pq.carclass_shield },
        { nombre: "Carclass Protection Pack", detalle: "Shield + láminas de seguridad 4 micras, en una sola visita.", precio: pq.carclass_protection_pack_laminas_4_micras }
      ] : [], vehiculo = [i.marca, i.modelo, i.anio].filter(Boolean).join(" "), archivo = nombreArchivo(vehiculo), enviados = conv.ppf_enviados ??= /* @__PURE__ */ new Set();
      if (enviados.has(archivo) || escribir && (await sql2`
        select 1 from wa.mensajes where conversacion_id = ${conv.id}::uuid and tipo = 'document'
          and texto like ${"[Documento] " + archivo + "%"} and enviado_en > now() - interval '7 days' limit 1`).length > 0) return { ok: !0, data: { ya_enviado: !0, instruccion: "Este PDF ya se le envió al cliente: no lo menciones como nuevo ni lo reenvíes." } };
      enviados.add(archivo);
      let hoy = partesChile(ahora).fecha, vig = sumarDias(hoy, 7), larga = (f) => new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(/* @__PURE__ */ new Date(`${f}T12:00:00Z`)), resumen = { vehiculo, modelo_planilla: d.modelo_planilla, kit_frontal: { xtreme: g.kit_frontal_5_piezas, ultimate_plus_8: u.kit_frontal_5_piezas }, completo_exterior: { xtreme: g.completo_exterior_wpf, ultimate_plus_8: u.completo_exterior_wpf }, paquetes: pq };
      if (!escribir) return { ok: !0, data: { simulado: !0, documento: nombreArchivo(vehiculo), resumen, instruccion: "El PDF se envía después de tu mensaje. No repitas en el texto toda la tabla: menciona el kit frontal recomendado y di que en el documento van las dos calidades y los paquetes." } };
      let numero = `CC-PPF-${hoy.replace(/-/g, "").slice(2)}-${String(Math.floor(Math.random() * 900) + 100)}`, bytes = await pdfPpf({ numero, fecha: larga(hoy), vigencia: larga(vig), cliente: conv.ficha?.nombre ?? conv.nombre, vehiculo, filas, paquetes, estimado: !1 }), url = await subirDocumento(nombreArchivo(vehiculo), bytes);
      return conv.oportunidad_id && await sql2`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                  values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'whatsapp', 'enviado', ${`Cotización PPF ${numero} (${vehiculo}, planilla «${d.modelo_planilla}»): ${url}`}, ${AUTOR2})`, {
        ok: !0,
        data: {
          documento: { url, nombre: nombreArchivo(vehiculo), numero },
          resumen,
          instruccion: "El PDF se envía después de tu mensaje. No repitas en el texto toda la tabla: menciona el kit frontal recomendado y di que en el documento van las dos calidades y los paquetes."
        }
      };
    },
    async consultar_stock_nom(i) {
      let consulta = (b2) => sql2`
        select marca, modelo, version, anio, km, precio_publicado
        from ops.vehiculos
        where estado = 'disponible' and coalesce(precio_publicado, 0) > 0
          and (${b2}::text is null or lower(marca || ' ' || modelo || ' ' || coalesce(version, '')) like ${b2})
          and (${i.precio_max ?? null}::bigint is null or precio_publicado <= ${i.precio_max ?? null})
        order by precio_publicado`, b = i.busqueda ? `%${norm(String(i.busqueda))}%` : null, filas = await consulta(b), nota;
      return filas.length === 0 && b && (filas = await consulta(null), nota = "La búsqueda por texto no calzó; estos son todos los autos disponibles dentro del presupuesto. Revisa tú cuáles corresponden a lo que pide (por ejemplo, Corolla Cross y Outlander son SUV)."), { ok: !0, data: { autos: filas, ...nota ? { nota } : {} } };
    },
    async crear_cotizacion(i) {
      let items = (i.items ?? []).map((x) => ({ ...x, cantidad: x.cantidad ?? 1 }));
      if (items.length === 0) return { ok: !1, error: "Sin ítems" };
      let total = items.reduce((s, x) => s + Number(x.precio) * Number(x.cantidad), 0), vigencia = sumarDias(partesChile(ahora).fecha, 7), INSTR = "El PDF de la cotización se envía solo, después de tu mensaje. Di en una línea que le envías la cotización con el total y la vigencia de 7 días; nunca pegues links ni copies el detalle completo.";
      if (!escribir) return { ok: !0, data: { simulado: !0, numero: "CC-2611-SIM", total, vigencia, documento_simulado: "Cotizacion-CC-2611-SIM.pdf", instruccion: INSTR } };
      let cods = items.map((x) => x.codigo).filter(Boolean), cat = cods.length ? await sql2`select codigo, nombre, descripcion from crm.catalogo where unidad = 'carclass' and codigo = any(${cods})` : [], lineas = items.map((x) => {
        let c = cat.find((k) => k.codigo === x.codigo);
        return { codigo: x.codigo ?? null, nombre: c?.nombre ?? x.descripcion, descripcion: c ? x.descripcion : null, cantidad: Number(x.cantidad), precio: Number(x.precio) };
      }), itemsJson = { v: 2, lineas, auto: i.vehiculo ?? null, origen: "asesor" }, estado = o.modo === "activo" ? "enviada" : "borrador", abierta = conv.oportunidad_id ? await sql2`
        select id, numero, token from crm.cotizaciones
        where oportunidad_id = ${conv.oportunidad_id}::uuid and unidad = 'carclass' and estado in ('borrador','enviada','vista')
          and fecha >= ${partesChile(ahora).fecha}::date - 7
        order by creado_en desc limit 1` : [], id, numero, token;
      if (abierta.length)
        ({ id, numero, token } = abierta[0]), await sql2`update crm.cotizaciones set items = ${sql2.json(itemsJson)}, total = ${total}, neto = ${Math.round(total / 1.19)},
                    vigencia = ${vigencia}::date, notas = ${i.notas ?? null}, token = coalesce(token, ${crypto.randomUUID().replace(/-/g, "")}),
                    estado = case when estado = 'vista' then 'vista' else ${estado} end,
                    enviada_en = case when ${estado} = 'enviada' then coalesce(enviada_en, now()) else enviada_en end
                  where id = ${id}::uuid`, token = token ?? (await sql2`select token from crm.cotizaciones where id = ${id}::uuid`)[0].token;
      else {
        let yymm = partesChile(ahora).fecha.slice(2, 7).replace("-", ""), n = await sql2`select count(*)::int + 1 n from crm.cotizaciones where unidad = 'carclass' and date_trunc('month', fecha) = date_trunc('month', ${partesChile(ahora).fecha}::date)`;
        numero = `CC-${yymm}-${String(n[0].n).padStart(3, "0")}`, token = crypto.randomUUID().replace(/-/g, ""), id = (await sql2`
          insert into crm.cotizaciones (oportunidad_id, empresa_id, unidad, numero, fecha, vigencia, items, total, neto, estado, token, creado_por, notas, enviada_en)
          values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'carclass', ${numero}, ${partesChile(ahora).fecha}::date, ${vigencia}::date,
                  ${sql2.json(itemsJson)}, ${total}, ${Math.round(total / 1.19)}, ${estado}, ${token}, ${AUTOR2}, ${i.notas ?? null},
                  ${estado === "enviada" ? sql2`now()` : null})
          returning id`)[0].id;
      }
      await moverEtapa("cotizado", { monto_estimado: total, proxima_accion: `Seguimiento de cotización ${numero}` });
      let larga = (f) => new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(/* @__PURE__ */ new Date(`${f}T12:00:00Z`)), bytes = await pdfCotizacion({
        numero,
        fecha: larga(partesChile(ahora).fecha),
        vigencia: larga(vigencia),
        cliente: conv.ficha?.nombre ?? conv.nombre,
        vehiculo: i.vehiculo ?? null,
        lineas: lineas.map((l) => ({ nombre: l.nombre, descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio })),
        total,
        notas: i.notas ?? null
      }), archivo = `Cotizacion-${numero}.pdf`, url = await subirDocumento(archivo, bytes, "cotizaciones");
      return await sql2`update crm.cotizaciones set pdf_url = ${url} where id = ${id}::uuid`, {
        ok: !0,
        data: { numero, total, vigencia, cotizacion_id: id, actualizada: abierta.length > 0, documento: { url, nombre: archivo, numero }, instruccion: INSTR }
      };
    },
    async proponer_horarios(i) {
      let [recepcion, cupos, plazos, retiro, transferencia] = await Promise.all([
        parametro(sql2, "carclass.recepcion"),
        parametro(sql2, "carclass.cupos"),
        parametro(sql2, "carclass.plazos"),
        parametro(sql2, "carclass.retiro"),
        parametro(sql2, "carclass.transferencia")
      ]), servicio = i.servicio, hoy = partesChile(ahora), anticipacion = Number(cupos?.anticipacion_dias ?? 3), fecha = sumarDias(hoy.fecha, anticipacion + (hoy.hora >= 16 ? 1 : 0));
      i.desde && /^\d{4}-\d{2}-\d{2}$/.test(i.desde) && i.desde > fecha && (fecha = i.desde);
      let citas = await sql2`select inicio, servicio from wa.citas where estado in ('reservada','confirmada') and inicio >= now() - interval '7 days' and inicio < now() + interval '40 days'`, semanaDe = (f) => {
        let dow = ((/* @__PURE__ */ new Date(`${f}T12:00:00Z`)).getUTCDay() + 6) % 7;
        return sumarDias(f, -dow);
      }, usadosSemana = (f, s) => citas.filter((c) => c.servicio === s && semanaDe(partesChile(new Date(c.inicio)).fecha) === semanaDe(f)).length, usadosDia = (f, s) => citas.filter((c) => c.servicio === s && partesChile(new Date(c.inicio)).fecha === f).length, tope = (s, f) => s === "ceramico" ? usadosSemana(f, "ceramico") < Number(cupos?.ceramico_semana ?? 2) : s === "ppf_frontal" ? usadosSemana(f, "ppf_frontal") < Number(cupos?.ppf_frontal_semana ?? 2) : s === "laminas" ? usadosDia(f, "laminas") < Number(cupos?.laminas_dia ?? 1) : !0, opciones = [];
      for (let k = 0; k < 30 && opciones.length < 2; k++) {
        let f = sumarDias(fecha, k), dow = (/* @__PURE__ */ new Date(`${f}T12:00:00Z`)).getUTCDay();
        if (dow === 0 || dow === 6 || !tope(servicio, f)) continue;
        let horas = dow === 5 ? ["10:00", "14:00"] : ["10:00", "15:00"];
        for (let h of horas) {
          if (opciones.length >= 2) break;
          let inst = instanteChile(f, h);
          citas.some((c) => Math.abs(new Date(c.inicio).getTime() - inst.getTime()) < 60 * 6e4) || opciones.length === 1 && opciones[0].inicio_local.startsWith(f) || opciones.push({ inicio_local: `${f}T${h}`, texto: textoFecha(inst) });
        }
      }
      let lugares = (recepcion?.lugares ?? []).map((l) => ({ codigo: l.codigo, como_decirlo: l.como_decirlo ?? `${l.nombre}, ${l.direccion}`, direccion: l.direccion, nota: l.nota })), datos = transferencia ? {
        titular: transferencia.titular,
        rut: transferencia.rut,
        banco: transferencia.banco,
        tipo_cuenta: transferencia.tipo_cuenta,
        numero_cuenta: transferencia.numero_cuenta,
        correo_comprobante: transferencia.correo_comprobante
      } : null;
      return {
        ok: !0,
        data: {
          opciones,
          sin_cupo_cercano: opciones.length === 0,
          lugar_preferido: recepcion?.preferido ?? "taller",
          lugares,
          horario_recepcion: recepcion?.horario,
          plazos_aproximados_dias: plazos ? { ceramico: plazos.ceramico, ppf_frontal: plazos.ppf_frontal, ppf_total: plazos.ppf_total, laminas: plazos.laminas, nota: "aproximados, según el vehículo" } : null,
          // La condición de costo del retiro es interna: el asesor la aplica, pero nunca la menciona al cliente
          retiro: retiro ? { zonas: retiro.zonas ?? retiro.comunas_sin_costo, regla_interna: retiro.regla_agente, como_decirlo: retiro.como_decirlo ?? null } : null,
          pago: transferencia?.pago ?? null,
          datos_transferencia: datos,
          regla: recepcion?.regla_cliente ?? "Con clientes de Carclass nunca menciones NOM: di «nuestra oficina»."
        }
      };
    },
    async reservar_cita(i) {
      let m = String(i.inicio).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (!m) return { ok: !1, error: "Formato de inicio inválido (YYYY-MM-DDTHH:MM)" };
      let inst = instanteChile(m[1], m[2]);
      if (inst.getTime() < ahora.getTime()) return { ok: !1, error: "La fecha ya pasó" };
      let lugar = ((await parametro(sql2, "carclass.recepcion"))?.lugares ?? []).find((l) => l.codigo === i.lugar);
      return escribir ? (await sql2`select 1 from wa.citas where estado in ('reservada','confirmada') and abs(extract(epoch from (inicio - ${inst}))) < 3600`).length ? { ok: !1, error: "Ese horario ya no está disponible: vuelve a llamar a proponer_horarios." } : (await sql2`insert into wa.citas (conversacion_id, oportunidad_id, unidad, tipo, servicio, inicio, lugar, email_cliente)
                values (${conv.id}::uuid, ${conv.oportunidad_id}::uuid, 'carclass', ${i.lugar === "retiro" ? "retiro" : "recepcion"}, ${i.servicio},
                        ${inst}, ${lugar?.direccion ?? i.lugar}, ${i.email_cliente ?? null})`, await sql2`select core.api_crear_tarea(${sql2.json({
        titulo: `[WhatsApp] Cita ${textoFecha(inst)} · ${conv.nombre ?? conv.telefono_norm ?? ""}`,
        descripcion: `Servicio: ${i.servicio} · Lugar: ${lugar?.direccion ?? i.lugar} · Correo: ${i.email_cliente ?? "—"}. Crear el evento en el calendario e invitar al cliente; confirmar con Hiendcar.`,
        unidad: "carclass",
        responsable: "Felipe",
        vence: partesChile(ahora).fecha,
        prioridad: "alta",
        oportunidad_id: conv.oportunidad_id,
        empresa_id: conv.empresa_id
      })}, ${AUTOR2})`, await moverEtapa("agendado", { proxima_accion: "Recepción del vehículo", proxima_fecha: m[1] }), { ok: !0, data: { inicio: textoFecha(inst), lugar: lugar?.como_decirlo ?? i.lugar, estado: "reservada, pendiente de validar la transferencia" } }) : { ok: !0, data: { simulado: !0, inicio: textoFecha(inst), lugar: lugar?.como_decirlo ?? i.lugar, estado: "reservada, pendiente de validar la transferencia" } };
    },
    async registrar_comprobante(i) {
      if (!escribir) return { ok: !0, data: { simulado: !0, estado: "pendiente de validación" } };
      let media = await sql2`select id, tipo from wa.mensajes where conversacion_id = ${conv.id}::uuid and direccion = 'entrante' and tipo in ('image','document') order by enviado_en desc limit 1`;
      return await sql2`select core.api_crear_tarea(${sql2.json({
        titulo: `[WhatsApp] Validar reserva ${i.monto ? "$" + Number(i.monto).toLocaleString("es-CL") : "$50.000"} · ${conv.nombre ?? conv.telefono_norm ?? ""}`,
        descripcion: `Comprobante recibido por WhatsApp (mensaje ${media[0]?.id ?? "?"}). ${i.nota ?? ""}`.trim(),
        unidad: "carclass",
        responsable: "Felipe",
        vence: partesChile(ahora).fecha,
        prioridad: "alta",
        oportunidad_id: conv.oportunidad_id,
        empresa_id: conv.empresa_id
      })}, ${AUTOR2})`, conv.oportunidad_id && await sql2`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                  values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'whatsapp', 'comprobante', 'Comprobante de reserva recibido (pendiente de validación)', ${AUTOR2})`, { ok: !0, data: { estado: "pendiente de validación" } };
    },
    async programar_seguimiento(i) {
      let pasos = (await parametro(sql2, `${conv.unidad ?? "carclass"}.seguimiento`) ?? await parametro(sql2, "carclass.seguimiento"))?.pasos ?? [];
      if (!escribir) return { ok: !0, data: { simulado: !0, pasos: pasos.length } };
      await sql2`update wa.seguimientos set estado = 'cancelado' where conversacion_id = ${conv.id}::uuid and estado = 'pendiente'`;
      for (let p of pasos) {
        let n = parseInt(String(p.a)), ms = String(p.a).endsWith("h") ? n * 36e5 : n * 864e5, canal = p.accion === "marcar_perdida" ? "marcar_perdida" : p.canal;
        await sql2`insert into wa.seguimientos (conversacion_id, cuando, canal, plantilla, idea)
                  values (${conv.id}::uuid, ${new Date(ahora.getTime() + ms)}, ${canal}, ${p.plantilla ?? null}, ${i.idea})`;
      }
      return { ok: !0, data: { programados: pasos.map((p) => p.a) } };
    },
    async traspasar_humano(i) {
      return escribir ? (await sql2`select core.api_crear_tarea(${sql2.json({
        titulo: `[WhatsApp] ${i.motivo} · ${conv.nombre ?? conv.telefono_norm ?? ""}`,
        descripcion: i.nota,
        unidad: conv.unidad ?? "grupo",
        responsable: "Felipe",
        vence: partesChile(ahora).fecha,
        prioridad: i.prioridad ?? "alta",
        oportunidad_id: conv.oportunidad_id,
        empresa_id: conv.empresa_id
      })}, ${AUTOR2})`, await sql2`update wa.conversaciones set agente_pausado_hasta = now() + interval '12 hours' where id = ${conv.id}::uuid`, conv.oportunidad_id && await sql2`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                  values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'nota', 'traspaso', ${`${i.motivo}: ${i.nota}`}, ${AUTOR2})`, { ok: !0, data: { traspasado: !0, agente_pausado_horas: 12 } }) : { ok: !0, data: { simulado: !0 } };
    },
    async marcar_personal() {
      return escribir ? (await sql2`update wa.conversaciones set estado = 'personal', ficha = '{}'::jsonb, actualizado_en = now() where id = ${conv.id}::uuid`, await sql2`delete from wa.mensajes where conversacion_id = ${conv.id}::uuid`, await sql2`delete from wa.borradores where conversacion_id = ${conv.id}::uuid`, conv.telefono_norm && await sql2`insert into wa.contactos_personales (telefono_norm, nombre, origen, tipo) values (${conv.telefono_norm}, ${conv.nombre}, 'manual', 'personal')
                  on conflict (telefono_norm) do nothing`, { ok: !0, data: { personal: !0 } }) : { ok: !0, data: { simulado: !0 } };
    },
    async descartar(i) {
      return !escribir || o.modo !== "activo" ? { ok: !0, data: { diferido: !simular2, simulado: simular2, nota: "Se aplica cuando Felipe aprueba." } } : conv.oportunidad_id ? (await sql2`select core.api_mover_etapa(${sql2.json({ oportunidad_id: conv.oportunidad_id, estado: "perdida", motivo_codigo: i.motivo_codigo, motivo: i.nota ?? i.motivo_codigo })}, ${AUTOR2})`, { ok: !0 }) : { ok: !1, error: "Sin oportunidad" };
    }
  };
  return Object.assign(impl, crearNom(sql2, conv, escribir)), async function(nombre, input) {
    let f = impl[nombre];
    if (!f) return { ok: !1, error: `Herramienta desconocida: ${nombre}` };
    if (o.modo === "observar" && !simular2 && !["asignar_unidad", "actualizar_ficha", "consultar_catalogo", "consultar_ppf_modelo", "consultar_stock_nom", "traspasar_humano", "marcar_personal", ...NOM_SOLO_LECTURA].includes(nombre))
      return { ok: !1, error: "Modo observar: esta acción no está habilitada; traspasa a Felipe." };
    try {
      return await f(input ?? {});
    } catch (e) {
      return { ok: !1, error: String(e?.message ?? e).slice(0, 300) };
    }
  };
}

// prompt.ts
var cache = null;
async function promptSistema(sql2) {
  if (cache && Date.now() - cache.at < 3e5) return cache.texto;
  let texto = (await sql2`select valor from wa.config where clave = 'agente_prompt'`)[0]?.valor;
  if (!texto || texto.length < 1e3) throw new Error("Falta el prompt del agente en wa.config (agente_prompt)");
  return cache = { at: Date.now(), texto }, texto;
}

// kapso.ts
var BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";
function clave() {
  let k = Deno.env.get("KAPSO_API_KEY");
  if (!k) throw new Error("Falta el secreto KAPSO_API_KEY");
  return k.trim();
}
async function enviarTexto(phoneNumberId, para, texto) {
  let r = await fetch(`${BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": clave(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para.replace(/^\+/, ""), type: "text", text: { body: texto, preview_url: !1 } })
  }), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Kapso ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  return { wamid: j?.messages?.[0]?.id ?? null };
}
async function enviarDocumento(phoneNumberId, para, link, nombre, caption) {
  let r = await fetch(`${BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": clave(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para.replace(/^\+/, ""), type: "document", document: { link, filename: nombre, ...caption ? { caption } : {} } })
  }), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Kapso ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  return { wamid: j?.messages?.[0]?.id ?? null };
}
async function descargarMedia(mediaId) {
  try {
    let meta = await fetch(`${BASE}/${mediaId}`, { headers: { "X-API-Key": clave() } });
    if (!meta.ok) return null;
    let info = await meta.json();
    if (!info?.url) return null;
    let bin = await fetch(info.url, { headers: { "X-API-Key": clave() } });
    if (!bin.ok) return null;
    let buf = new Uint8Array(await bin.arrayBuffer());
    if (buf.byteLength > 45e5) return null;
    let s = "";
    for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768));
    return { base64: btoa(s), mime: String(info.mime_type ?? bin.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
  } catch {
    return null;
  }
}
var pausa = (min = 2e3, max = 4e3) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

// seguimientos.ts
var AUTOR3 = "Agente IA", TZ2 = "America/Santiago", fechaChile = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ2 }).format(d), ahoraChile = () => new Intl.DateTimeFormat("es-CL", { timeZone: TZ2, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(/* @__PURE__ */ new Date());
async function historialTexto(sql2, convId) {
  let filas = await sql2`
    select * from (select direccion, tipo, texto, enviado_en from wa.mensajes
                   where conversacion_id = ${convId}::uuid order by enviado_en desc limit 30) t
    order by enviado_en asc`, out = [];
  for (let f of filas) {
    let rol = f.direccion === "entrante" ? "user" : "assistant", texto = f.texto ? String(f.texto) : `[${f.tipo}]`, prev = out[out.length - 1];
    prev && prev.role === rol ? prev.content.push({ type: "text", text: texto }) : out.push({ role: rol, content: [{ type: "text", text: texto }] });
  }
  for (; out.length && out[0].role !== "user"; ) out.shift();
  return out;
}
function instruccion(s, horas) {
  return [
    "[Instrucción interna de seguimiento — no la escribió el cliente]",
    `El cliente no ha respondido desde nuestro último mensaje (hace unas ${horas} horas).`,
    "Escribe UN mensaje breve de seguimiento (1 a 3 líneas, una sola burbuja), cálido y sin presión, que aporte algo nuevo.",
    s.idea ? `Idea para aportar: ${s.idea}` : "",
    "Nunca preguntes «¿viste la cotización?» ni repitas la cotización completa. No prometas enviar fotos ni nada que no puedas mandar ahora mismo; si aún no compartiste la página web del servicio, puedes compartirla.",
    "No uses herramientas. Si ya no corresponde escribir (por ejemplo, el cliente dijo que no le interesa o pidió que no lo contacten), responde exactamente: OMITIR"
  ].filter(Boolean).join(`
`);
}
async function tarea(sql2, c, titulo, descripcion) {
  await sql2`select core.api_crear_tarea(${sql2.json({
    titulo,
    descripcion,
    unidad: c.unidad ?? "carclass",
    responsable: "Felipe",
    prioridad: "media",
    vence: fechaChile(/* @__PURE__ */ new Date()),
    oportunidad_id: c.oportunidad_id ?? null,
    empresa_id: c.empresa_id ?? null
  })}, ${AUTOR3})`;
}
async function procesarSeguimientos(sql2, client2, cfg, system) {
  let lote = await sql2`
    update wa.seguimientos s set cuando = now() + interval '10 minutes'
    where s.id in (select id from wa.seguimientos where estado = 'pendiente' and cuando <= now()
                   order by cuando limit 3 for update skip locked)
    returning s.*`, out = [];
  for (let s of lote)
    try {
      out.push(await uno(sql2, client2, cfg, system, s));
    } catch (e) {
      out.push(`seguimiento error: ${String(e?.message ?? e).slice(0, 120)}`);
    }
  return out;
}
async function uno(sql2, client2, cfg, system, s) {
  let fin = (estado) => sql2`update wa.seguimientos set estado = ${estado} where id = ${s.id}`, c = (await sql2`
    select c.*, o.etapa, o.estado as op_estado from wa.conversaciones c
    left join crm.oportunidades o on o.id = c.oportunidad_id where c.id = ${s.conversacion_id}::uuid`)[0];
  if (!c || !["lead", "sin_unidad"].includes(c.estado))
    return await fin("cancelado"), "cancelado: conversación cerrada";
  if (c.agente_activo === !1)
    return await fin("cancelado"), "cancelado: tomada por humano";
  if (c.op_estado && c.op_estado !== "abierta")
    return await fin("cancelado"), `cancelado: oportunidad ${c.op_estado}`;
  if ((await sql2`select 1 from wa.mensajes where conversacion_id = ${c.id}::uuid and direccion = 'entrante' and enviado_en > ${s.creado_en} limit 1`).length)
    return await sql2`update wa.seguimientos set estado = 'cancelado' where conversacion_id = ${c.id}::uuid and estado = 'pendiente'`, await fin("cancelado"), "cancelado: el cliente respondió";
  if (c.agente_pausado_hasta && new Date(c.agente_pausado_hasta) > /* @__PURE__ */ new Date())
    return await sql2`update wa.seguimientos set cuando = ${new Date(new Date(c.agente_pausado_hasta).getTime() + 5 * 6e4)} where id = ${s.id}`, "pospuesto: pausa";
  let modo = (await sql2`select wa.modo_agente(${c.unidad ?? "carclass"}) as m`)[0].m;
  if (modo === "apagado")
    return await fin("cancelado"), "cancelado: asesor apagado";
  let nombre = c.nombre ?? c.telefono_norm ?? "cliente";
  if (s.canal === "marcar_perdida")
    return modo === "activo" && c.oportunidad_id ? (await sql2`select core.api_mover_etapa(${sql2.json({ oportunidad_id: c.oportunidad_id, estado: "perdida", motivo_codigo: "sin_respuesta", motivo: "Sin respuesta tras los seguimientos" })}, ${AUTOR3})`, await fin("enviado"), "perdida: sin respuesta") : (await tarea(sql2, c, `[Seguimiento] Cerrar como perdida · ${nombre}`, "No respondió después de los seguimientos. Si corresponde, márcala como perdida (sin respuesta)."), await fin("omitido"), "tarea: cerrar perdida");
  let hist = await historialTexto(sql2, c.id), ultSalida = c.ultima_salida ? new Date(c.ultima_salida) : new Date(s.creado_en), horas = Math.max(1, Math.round((Date.now() - ultSalida.getTime()) / 36e5)), instr = { type: "text", text: instruccion(s, horas) }, ult = hist[hist.length - 1];
  ult && ult.role === "user" ? ult.content.push(instr) : hist.push({ role: "user", content: [instr] });
  let activas = ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && !["apagado", "observar"].includes(cfg[`agente_modo_${u}`])), salida = await pensar({
    client: client2,
    modelo: cfg.agente_modelo || void 0,
    system,
    herramientas: [],
    historial: hist,
    contexto: {
      ahora: ahoraChile(),
      modo,
      unidades_activas: activas,
      unidad: c.unidad,
      etapa: c.etapa ?? null,
      nombre: c.nombre,
      ficha: c.ficha ?? {},
      origen: "Seguimiento programado",
      ventana_hasta: c.ventana_hasta ? new Date(c.ventana_hasta).toLocaleString("es-CL", { timeZone: TZ2 }) : null
    },
    ejecutar: async () => ({ ok: !1, error: "Sin herramientas en un seguimiento" }),
    maxIteraciones: 2
  });
  await sql2`insert into wa.agente_log (conversacion_id, modelo, modo, tokens_in, tokens_out, cache_read, cache_write, costo_usd, iteraciones, herramientas, stop_reason)
            values (${c.id}::uuid, ${salida.modelo}, ${"seguimiento:" + modo}, ${salida.uso.input}, ${salida.uso.output}, ${salida.uso.cache_read},
                    ${salida.uso.cache_write}, ${salida.uso.costo_usd}, ${salida.iteraciones}, ${[]}, ${salida.stop_reason})`;
  let mensajes = salida.mensajes.filter((m) => m.trim().toUpperCase() !== "OMITIR");
  if (mensajes.length === 0)
    return await fin("omitido"), "omitido por el asesor";
  let ventanaAbierta = c.ventana_hasta && new Date(c.ventana_hasta).getTime() > Date.now() + 6e4;
  if (modo === "activo" && ventanaAbierta) {
    let pnid = c.phone_number_id || cfg.phone_number_id;
    for (let i = 0; i < mensajes.length; i++) {
      i > 0 && await pausa();
      let { wamid } = await enviarTexto(pnid, c.wa_usuario, mensajes[i]);
      await sql2`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                values (${wamid}, ${c.id}::uuid, 'saliente_api', 'text', ${mensajes[i]}, now())`, c.oportunidad_id && await sql2`select core.api_registrar_actividad(${sql2.json({ oportunidad_id: c.oportunidad_id, tipo: "whatsapp", resultado: "seguimiento", nota: mensajes[i] })}, ${AUTOR3})`;
    }
    return await sql2`update wa.conversaciones set ultima_salida = now() where id = ${c.id}::uuid`, await fin("enviado"), "seguimiento enviado";
  }
  return modo === "borrador" ? (await sql2`update wa.borradores set estado = 'vencido', resuelto_en = now(), resuelto_por = 'reemplazado'
              where conversacion_id = ${c.id}::uuid and estado = 'pendiente'`, await sql2`insert into wa.borradores (conversacion_id, mensajes, acciones)
              values (${c.id}::uuid, ${sql2.json(mensajes)}, ${sql2.json([{ herramienta: "seguimiento", input: { paso: s.canal, idea: s.idea }, resultado: { ok: !0 } }])})`, await sql2`select core.push(${"Seguimiento propuesto"}, ${nombre + " · revisa y envía desde Conversaciones"}, ${"#/conversaciones/" + c.id}, ${"wa_seg:" + s.id})`, await fin("enviado"), "seguimiento en borrador") : (await tarea(
    sql2,
    c,
    `[Seguimiento] Escribir a ${nombre}`,
    `${ventanaAbierta ? "El asesor no está en modo activo para esta unidad." : "Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp no deja escribirle sin plantilla aprobada."} Texto sugerido:

${mensajes.join(`

`)}`
  ), await sql2`select core.push(${"Seguimiento por enviar"}, ${nombre + " · texto listo en Tareas"}, '#/tareas', ${"wa_seg:" + s.id})`, await fin("omitido"), "tarea: seguimiento a mano");
}

// simular.ts
var TZ3 = "America/Santiago", ahoraChile2 = () => new Intl.DateTimeFormat("es-CL", { timeZone: TZ3, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(/* @__PURE__ */ new Date());
async function correr(sql2, client2, lote, e, cfg, system) {
  let transcripcion = [], acciones = [], costo = 0;
  try {
    let conv = {
      id: crypto.randomUUID(),
      estado: e.unidad ? "lead" : "sin_unidad",
      unidad: e.unidad ?? null,
      flujo: null,
      oportunidad_id: null,
      empresa_id: null,
      nombre: e.nombre ?? null,
      telefono_norm: null,
      ficha: {}
    }, sim = conv;
    e.sim_nom && (sim.sim_nom = e.sim_nom), sim.sim_turno = 0;
    let activas = e.activas ?? ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && !["apagado", "observar"].includes(cfg[`agente_modo_${u}`])), historial = [];
    for (let msg of e.turnos) {
      sim.sim_turno += 1, historial.push({ role: "user", content: [{ type: "text", text: msg }] }), transcripcion.push({ rol: "cliente", texto: msg });
      let contexto = {
        ahora: ahoraChile2(),
        modo: "activo",
        unidades_activas: activas,
        unidad: conv.unidad,
        etapa: null,
        nombre: conv.nombre,
        ficha: conv.ficha ?? {},
        origen: e.origen ?? "WhatsApp directo",
        ventana_hasta: new Date(Date.now() + 864e5).toLocaleString("es-CL", { timeZone: TZ3 })
      }, salida = await pensar({
        client: client2,
        modelo: cfg.agente_modelo || MODELO_POR_DEFECTO,
        system,
        herramientas: HERRAMIENTAS,
        historial,
        contexto,
        ejecutar: crearEjecutor({ sql: sql2, conv, modo: "activo", simular: !0 })
      });
      costo += salida.uso.costo_usd;
      for (let a of salida.acciones) acciones.push({ turno: transcripcion.length, ...a });
      let texto = salida.silencioso ? "[el asesor no responde: lo trata como chat personal]" : salida.mensajes.join(`
---
`) || "[sin respuesta]";
      transcripcion.push({ rol: "asesor", texto }), historial.push({ role: "assistant", content: [{ type: "text", text: texto }] });
    }
    await sql2`insert into qa.simulaciones (lote, escenario, titulo, esperado, transcripcion, acciones, costo_usd)
              values (${lote}, ${e.id}, ${e.titulo ?? null}, ${e.esperado ?? null}, ${sql2.json(transcripcion)}, ${sql2.json(acciones)}, ${costo})`;
  } catch (err) {
    await sql2`insert into qa.simulaciones (lote, escenario, titulo, esperado, transcripcion, acciones, costo_usd, error)
              values (${lote}, ${e.id}, ${e.titulo ?? null}, ${e.esperado ?? null}, ${sql2.json(transcripcion)}, ${sql2.json(acciones)}, ${costo}, ${String(err?.message ?? err)})`;
  }
}
async function simular(sql2, client2, cfg, req) {
  let body = await req.json().catch(() => null), escenarios = (body?.escenarios ?? []).filter((e) => e?.id && Array.isArray(e.turnos) && e.turnos.length).slice(0, 12);
  if (!escenarios.length) return Response.json({ ok: !1, error: "sin escenarios" }, { status: 400 });
  let lote = body?.lote ?? (/* @__PURE__ */ new Date()).toISOString(), system;
  if (body?.prompt_clave) {
    if (!/^agente_prompt[a-z_]*$/.test(body.prompt_clave) || !cfg[body.prompt_clave] || cfg[body.prompt_clave].length < 1e3)
      return Response.json({ ok: !1, error: "prompt_clave inválida o vacía" }, { status: 400 });
    system = cfg[body.prompt_clave];
  } else system = await promptSistema(sql2);
  return EdgeRuntime.waitUntil(Promise.all(escenarios.map((e) => correr(sql2, client2, lote, e, cfg, system)))), Response.json({ ok: !0, lote, escenarios: escenarios.length }, { status: 202 });
}

// index.ts
var sql = postgres(Deno.env.get("SUPABASE_DB_URL"), { prepare: !1, max: 3, idle_timeout: 20 }), client = new Anthropic({ maxRetries: 2, timeout: 9e4 }), TZ4 = "America/Santiago", UNIDADES_AGENTE = /* @__PURE__ */ new Set(["carclass", "nom", "blackgps", "carwash"]), MAX_INTENTOS = 3;
async function config() {
  let rows = await sql`select clave, valor from wa.config`;
  return Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
}
function seguroIgual(a, b) {
  if (!a || a.length !== b.length) return !1;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
var ahoraChile3 = () => new Intl.DateTimeFormat("es-CL", { timeZone: TZ4, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(/* @__PURE__ */ new Date());
async function armarHistorial(convId) {
  let filas = await sql`
    select * from (
      select direccion, tipo, texto, media, enviado_en from wa.mensajes
      where conversacion_id = ${convId}::uuid order by enviado_en desc limit 30
    ) t order by enviado_en asc`;
  if (filas.length === 0 || filas[filas.length - 1].direccion !== "entrante") return null;
  let inicioUltimo = filas.length - 1;
  for (; inicioUltimo > 0 && filas[inicioUltimo - 1].direccion === "entrante"; ) inicioUltimo--;
  let out = [];
  for (let i = 0; i < filas.length; i++) {
    let f = filas[i], rol = f.direccion === "entrante" ? "user" : "assistant", bloques = [];
    rol === "assistant" && f.direccion === "saliente_app" && bloques.push({ type: "text", text: "[Felipe respondió desde su celular]" });
    let esUltimo = i >= inicioUltimo;
    if (rol === "user" && esUltimo && f.media?.id && (f.tipo === "image" || f.tipo === "document" && String(f.media?.mime_type ?? "").includes("pdf"))) {
      let m = await descargarMedia(String(f.media.id));
      m && f.tipo === "image" && /^image\/(jpeg|png|gif|webp)$/.test(m.mime) ? bloques.push({ type: "image", source: { type: "base64", media_type: m.mime, data: m.base64 } }) : m && m.mime === "application/pdf" ? bloques.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: m.base64 } }) : bloques.push({ type: "text", text: `[${f.tipo} recibido: no se pudo abrir]` });
    } else f.tipo && !["text", "button", "interactive"].includes(f.tipo) && !f.texto && bloques.push({ type: "text", text: f.tipo === "audio" ? "[audio sin transcripción]" : `[${f.tipo}]` });
    if (f.texto && bloques.push({ type: "text", text: String(f.texto) }), bloques.length === 0) continue;
    let prev = out[out.length - 1];
    prev && prev.role === rol ? prev.content.push(...bloques) : out.push({ role: rol, content: bloques });
  }
  for (; out.length && out[0].role !== "user"; ) out.shift();
  return out.length ? out : null;
}
async function procesar(convId, desde, cfg) {
  let t0 = Date.now(), c = (await sql`
    select c.*, o.etapa from wa.conversaciones c left join crm.oportunidades o on o.id = c.oportunidad_id
    where c.id = ${convId}::uuid`)[0], quitar = async (motivo) => (await sql`delete from wa.cola_agente where conversacion_id = ${convId}::uuid
              and abs(extract(epoch from (procesar_desde - ${desde}::timestamptz))) < 0.002`, motivo);
  if (!c) return quitar("no existe");
  if (!["sin_unidad", "lead"].includes(c.estado)) return quitar(`estado ${c.estado}`);
  if (c.unidad && !UNIDADES_AGENTE.has(c.unidad)) return quitar(`unidad ${c.unidad}`);
  if (c.agente_activo === !1) return quitar("tomada por humano");
  if (c.agente_pausado_hasta && new Date(c.agente_pausado_hasta) > /* @__PURE__ */ new Date()) return quitar("pausado");
  if (!c.ventana_hasta || new Date(c.ventana_hasta) <= /* @__PURE__ */ new Date()) return quitar("ventana de 24 h cerrada");
  let modo = (await sql`select wa.modo_agente(${c.unidad ?? "carclass"}) as m`)[0].m;
  if (modo === "apagado") return quitar("apagado");
  let historial = await armarHistorial(convId);
  if (!historial) return quitar("nada que responder");
  let activas = ["carclass", "nom", "blackgps"].filter((u) => cfg[`agente_modo_${u}`] && cfg[`agente_modo_${u}`] !== "apagado" && cfg[`agente_modo_${u}`] !== "observar"), ref = c.referral ?? null, contexto = {
    ahora: ahoraChile3(),
    modo,
    unidades_activas: activas,
    unidad: c.unidad,
    etapa: c.etapa ?? null,
    nombre: c.nombre,
    ficha: c.ficha ?? {},
    origen: ref ? `Anuncio clic a WhatsApp${ref.headline ? ` · «${ref.headline}»` : ""}${ref.body ? ` · ${String(ref.body).slice(0, 200)}` : ""}` : "WhatsApp directo",
    ventana_hasta: c.ventana_hasta ? new Date(c.ventana_hasta).toLocaleString("es-CL", { timeZone: TZ4 }) : null
  }, conv = {
    id: c.id,
    estado: c.estado,
    unidad: c.unidad,
    flujo: c.flujo,
    oportunidad_id: c.oportunidad_id,
    empresa_id: c.empresa_id,
    nombre: c.nombre,
    telefono_norm: c.telefono_norm,
    ficha: c.ficha ?? {}
  }, salida = await pensar({
    client,
    modelo: cfg.agente_modelo || MODELO_POR_DEFECTO,
    system: await promptSistema(sql),
    herramientas: HERRAMIENTAS,
    historial,
    contexto,
    ejecutar: crearEjecutor({ sql, conv, modo })
  });
  if (await sql`update wa.borradores set estado = 'vencido', resuelto_en = now(), resuelto_por = 'reemplazado'
            where conversacion_id = ${convId}::uuid and estado = 'pendiente'`, !salida.silencioso && salida.mensajes.length > 0)
    if (modo === "activo") {
      let pnid = c.phone_number_id || cfg.phone_number_id;
      for (let i = 0; i < salida.mensajes.length; i++) {
        i > 0 && await pausa();
        let texto = salida.mensajes[i], { wamid } = await enviarTexto(pnid, c.wa_usuario, texto);
        await sql`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                  values (${wamid}, ${convId}::uuid, 'saliente_api', 'text', ${texto}, now())`, c.oportunidad_id && await sql`select core.api_registrar_actividad(${sql.json({ oportunidad_id: c.oportunidad_id, tipo: "whatsapp", resultado: "enviado", nota: texto })}, 'Agente IA')`;
      }
      let docs = /* @__PURE__ */ new Map();
      for (let a of salida.acciones) {
        let d = a.resultado?.data?.documento;
        a.resultado?.ok && d?.url && docs.set(d.nombre, d);
      }
      for (let doc of docs.values()) {
        await pausa(1500, 2500);
        try {
          let { wamid } = await enviarDocumento(pnid, c.wa_usuario, doc.url, doc.nombre);
          await sql`insert into wa.mensajes (wamid, conversacion_id, direccion, tipo, texto, enviado_en)
                    values (${wamid}, ${convId}::uuid, 'saliente_api', 'document', ${`[Documento] ${doc.nombre} · ${doc.url}`}, now())`;
        } catch (e) {
          await sql`select core.api_crear_tarea(${sql.json({
            titulo: `[WhatsApp] Enviar PDF a ${c.nombre ?? c.telefono_norm ?? ""}`,
            descripcion: `El asesor no pudo enviar ${doc.nombre}. Envíalo a mano: ${doc.url} · Error: ${String(e?.message ?? e).slice(0, 200)}`,
            unidad: c.unidad ?? "carclass",
            responsable: "Felipe",
            prioridad: "alta",
            oportunidad_id: c.oportunidad_id ?? null,
            empresa_id: c.empresa_id ?? null
          })}, 'Agente IA')`;
        }
      }
      await sql`update wa.conversaciones set ultima_salida = now() where id = ${convId}::uuid`;
    } else modo === "borrador" && await sql`insert into wa.borradores (conversacion_id, mensajes, acciones)
                values (${convId}::uuid, ${sql.json(salida.mensajes)}, ${sql.json(salida.acciones)})`;
  return await sql`insert into wa.agente_log (conversacion_id, modelo, modo, tokens_in, tokens_out, cache_read, cache_write, costo_usd, latencia_ms, iteraciones, herramientas, stop_reason)
            values (${convId}::uuid, ${salida.modelo}, ${modo}, ${salida.uso.input}, ${salida.uso.output}, ${salida.uso.cache_read}, ${salida.uso.cache_write},
                    ${salida.uso.costo_usd}, ${Date.now() - t0}, ${salida.iteraciones}, ${salida.acciones.map((a) => a.herramienta)}, ${salida.stop_reason})`, await quitar("ok"), `ok · ${modo} · ${salida.mensajes.length} burbujas · ${salida.acciones.length} acciones`;
}
async function manejarError(convId, intentos, err) {
  let msg = String(err?.message ?? err).slice(0, 500);
  if (await sql`insert into wa.agente_log (conversacion_id, error) values (${convId}::uuid, ${msg})`, intentos >= MAX_INTENTOS) {
    let c = (await sql`select nombre, telefono_norm, unidad, oportunidad_id, empresa_id from wa.conversaciones where id = ${convId}::uuid`)[0] ?? {};
    await sql`select core.api_crear_tarea(${sql.json({
      titulo: `[WhatsApp] Error de sistema · ${c.nombre ?? c.telefono_norm ?? convId}`,
      descripcion: `El agente falló ${intentos} veces y dejó de intentar. Responde tú esta conversación. Último error: ${msg}`,
      unidad: c.unidad ?? "grupo",
      responsable: "Felipe",
      prioridad: "alta",
      oportunidad_id: c.oportunidad_id ?? null,
      empresa_id: c.empresa_id ?? null
    })}, 'Agente IA')`, await sql`delete from wa.cola_agente where conversacion_id = ${convId}::uuid`;
  } else
    await sql`update wa.cola_agente set bloqueado_hasta = now() + interval '1 minute', ultimo_error = ${msg} where conversacion_id = ${convId}::uuid`;
}
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
    let cfg = await config();
    if (!seguroIgual(req.headers.get("x-agente-secret") ?? "", cfg.agente_secret ?? "")) return new Response("No autorizado", { status: 401 });
    if (new URL(req.url).pathname.endsWith("/simular")) return await simular(sql, client, cfg, req);
    let tomados = await sql`select * from wa.tomar_cola(3)`, resultados = [];
    for (let t of tomados)
      try {
        resultados.push(await procesar(t.conversacion_id, t.procesar_desde, cfg));
      } catch (e) {
        await manejarError(t.conversacion_id, t.intentos, e), resultados.push("error");
      }
    let seguimientos = [];
    try {
      seguimientos = await procesarSeguimientos(sql, client, cfg, await promptSistema(sql));
    } catch (e) {
      seguimientos = [`error: ${String(e?.message ?? e).slice(0, 120)}`];
    }
    return new Response(JSON.stringify({ ok: !0, procesados: resultados, seguimientos }), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ ok: !1 }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
