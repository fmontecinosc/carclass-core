// Informe de tasación NOM en PDF para el cliente (Felipe 21-nov-2026: al cliente se le envía el documento, no links).
// Se arma SOLO con nom.payload_cliente (lista blanca): nunca costos, comisiones internas ni notas del tasador.
// Estética de la marca NOM, la misma del informe de la app (app/informe-tasacion.js, réplica del PDF de referencia
// de Felipe): banda negra de 25 mm con logo y folio, sobretítulo champagne, títulos serif, ficha en grilla, caja de
// evaluación, tarjetas grises, comparables numerados en dorado con enlace verde y pie en versalitas.
import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";

const K = rgb(0.063, 0.067, 0.067);      // #101111 banda
const INK = rgb(0.102, 0.106, 0.106);    // #1a1b1b
const MUT = rgb(0.42, 0.43, 0.427);      // #6b6e6d
const LINE = rgb(0.89, 0.894, 0.886);    // #e3e4e2
const CARD = rgb(0.965, 0.969, 0.965);   // #f6f7f6
const GOLD = rgb(0.706, 0.612, 0.369);   // #b49c5e champagne
const GREEN = rgb(0.082, 0.29, 0.227);   // #154a3a
const FOLIO_GRIS = rgb(0.604, 0.612, 0.608);
const PRE_BORDE = rgb(0.847, 0.78, 0.604), PRE_FONDO = rgb(0.984, 0.969, 0.925), PRE_TXT = rgb(0.427, 0.329, 0.075);
const BLANCO = rgb(1, 1, 1);
const LOGO_URL = "https://app.carclass.cl/img/nom-logo.png";

const A4: [number, number] = [595.28, 841.89];
const MM = 2.8346;
const MX = 11.5 * MM;
const W = A4[0] - 2 * MX;

const clp = (n: unknown) => (n == null || n === "" || Number.isNaN(Number(n))) ? "—" : "$" + Math.round(Number(n)).toLocaleString("es-CL").replace(/,/g, ".");
const mmill = (n: unknown) => (n == null) ? "—" : "$" + (Math.round(Number(n) / 1e5) / 10).toFixed(1).replace(".", ",") + "M";
const kmTxt = (n: unknown) => (n == null || n === "") ? null : Math.round(Number(n)).toLocaleString("es-CL").replace(/,/g, ".") + " km";
const limpiar = (t: unknown) => String(t ?? "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ·—–•\n]/g, "");
const TZ = "America/Santiago";
const fecha = (iso: unknown) => {
  if (!iso) return null;
  const s = String(iso);
  return new Date(s.length === 10 ? `${s}T12:00:00Z` : s);
};
const fechaLarga = (iso: unknown) => { const d = fecha(iso); return d ? new Intl.DateTimeFormat("es-CL", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" }).format(d) : "—"; };
const fechaHora = (iso: unknown) => { const d = fecha(iso); return d ? new Intl.DateTimeFormat("es-CL", { timeZone: TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(d) + " h" : "—"; };
const rango = (a: unknown, b: unknown, f: (n: unknown) => string) => (a == null && b == null) ? "—" : (a === b || b == null) ? f(a) : `${f(a)} - ${f(b)}`;
const juntar = (...xs: unknown[]) => xs.filter((x) => x != null && String(x).trim() !== "").map(String).join("  ·  ");
const PORTAL: Record<string, string> = { chileautos: "Chileautos", mercadolibre: "Mercado Libre", yapo: "Yapo", automotora: "sitio de la automotora" };
const portalTxt = (p: unknown) => PORTAL[String(p ?? "").toLowerCase()] ?? (p ? String(p) : "el portal");
const NIVEL: Record<number, string> = { 5: "MUY ALTA COMERCIALIDAD", 4: "BUENA COMERCIALIDAD", 3: "COMERCIALIDAD MEDIA", 2: "COMERCIALIDAD ACOTADA", 1: "BAJA COMERCIALIDAD" };

function partir(texto: unknown, font: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of limpiar(texto).split("\n")) {
    let linea = "";
    for (const w of parrafo.split(" ")) {
      const prueba = linea ? `${linea} ${w}` : w;
      if (font.widthOfTextAtSize(prueba, size) <= ancho) linea = prueba;
      else { if (linea) out.push(linea); linea = w; }
    }
    out.push(linea);
  }
  return out;
}

let logoCache: Uint8Array | null = null;
async function logo(): Promise<Uint8Array | null> {
  if (logoCache) return logoCache;
  try { const r = await fetch(LOGO_URL); if (!r.ok) return null; logoCache = new Uint8Array(await r.arrayBuffer()); return logoCache; } catch { return null; }
}

// Rectángulo redondeado (y = borde superior, en coordenadas PDF)
function rr(page: PDFPage, x: number, yTop: number, w: number, h: number, r: number, o: { fill?: ReturnType<typeof rgb>; border?: ReturnType<typeof rgb>; bw?: number }) {
  const p = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
  page.drawSvgPath(p, { x, y: yTop, color: o.fill, borderColor: o.border, borderWidth: o.border ? (o.bw ?? 0.8) : 0 });
}

function enlace(doc: PDFDocument, page: PDFPage, url: string, x1: number, y1: number, x2: number, y2: number) {
  const annot = doc.context.register(doc.context.obj({
    Type: "Annot", Subtype: "Link", Rect: [x1, y1, x2, y2], Border: [0, 0, 0],
    A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
  }));
  page.node.addAnnot(annot);
}

// Opciones del llamador: número de WhatsApp de NOM (solo dígitos) y, si existe, una página de citas de Google Calendar
export interface OpcionesInforme { whatsapp?: string; agenda_url?: string | null }

export async function pdfInforme(p: any, op: OpcionesInforme = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const v = p.vehiculo ?? {}, val = p.valores ?? {}, tx = p.textos ?? {}, cq = p.consulta ?? {};
  const pre = p.tipo === "pre_estimacion";
  doc.setTitle(`Informe de tasación ${p.folio} · Nor-Oriente Motors`);
  doc.setAuthor("Nor-Oriente Motors");
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansB = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifB = await doc.embedFont(StandardFonts.TimesRomanBold);
  let img: PDFImage | null = null;
  const lb = await logo();
  if (lb) { try { img = await doc.embedPng(lb); } catch { img = null; } }

  let page!: PDFPage;
  let y = 0;
  const txt = (t: unknown, x: number, yy: number, size: number, font = sans, color = INK) => page.drawText(limpiar(t), { x, y: yy, size, font, color });
  const der = (t: unknown, xd: number, yy: number, size: number, font = sans, color = INK) => txt(t, xd - font.widthOfTextAtSize(limpiar(t), size), yy, size, font, color);
  const espaciado = (t: string, x: number, yy: number, size: number, font: PDFFont, color: ReturnType<typeof rgb>, sp: number) => {
    let xx = x; for (const ch of limpiar(t)) { page.drawText(ch, { x: xx, y: yy, size, font, color }); xx += font.widthOfTextAtSize(ch, size) + sp; } return xx;
  };
  const anchoEsp = (t: string, size: number, font: PDFFont, sp: number) => [...limpiar(t)].reduce((s, ch) => s + font.widthOfTextAtSize(ch, size) + sp, 0);

  const nuevaPagina = () => {
    page = doc.addPage(A4);
    const h = 25 * MM, top = A4[1];
    page.drawRectangle({ x: 0, y: top - h, width: A4[0], height: h, color: K });
    if (img) {
      const ih = 15 * MM, iw = ih * (img.width / img.height);
      page.drawImage(img, { x: MX, y: top - h / 2 - ih / 2, width: iw, height: ih });
    } else {
      espaciado("NOM  |  NOR-ORIENTE MOTORS", MX, top - h / 2 - 4, 11, sansB, BLANCO, 1.2);
    }
    y = top - h - 9.5 * MM;
  };
  const foliosBanda: PDFPage[] = [];
  const espacioPie = 22 * MM;
  const cabe = (alto: number) => y - alto > espacioPie;

  const over = (t: string) => { espaciado(t.toUpperCase(), MX, y - 8, 8, sansB, GOLD, 0.5); y -= 8 + 3.5 * MM; };
  const t1 = (t: string, size = 25.5) => { for (const l of partir(t, serif, size, W)) { txt(l, MX, y - size * 0.8, size, serif, INK); y -= size * 1.08; } };
  const t2 = (t: string) => { y -= 0.6 * MM; for (const l of partir(t, serif, 15.5, W)) { txt(l, MX, y - 12.5, 15.5, serif, INK); y -= 15.5 * 1.2; } y -= 1.8 * MM; };
  const sub = (t: string, color = MUT, size = 8.2) => { for (const l of partir(t, sans, size, W)) { txt(l, MX, y - size, size, sans, color); y -= size * 1.45; } };
  const h3 = (t: string, mt = 6 * MM) => {
    y -= mt;
    espaciado(t.toUpperCase(), MX, y - 8.4, 8.4, sansB, INK, 0.25);
    y -= 8.4 + 2.2 * MM + 2;
    page.drawLine({ start: { x: MX, y }, end: { x: MX + W, y }, thickness: 0.8, color: LINE });
  };
  const parrafo = (t: string, size = 9, color = INK, mt = 2.6 * MM) => {
    y -= mt;
    for (const l of partir(t, sans, size, W)) { if (!cabe(size * 1.45)) { nuevaPagina(); } txt(l, MX, y - size, size, sans, color); y -= size * 1.45; }
  };

  // ───────── Página 1 · Tasación de mercado ─────────
  nuevaPagina(); foliosBanda.push(page);
  const titulo = [v.marca, v.modelo,
    v.version ? String(v.version).replace(/\b\d\.\d\s*[a-z]*\b/i, "").replace(/\b4x[24]\b|\b\d+p\b/gi, "").replace(/\s+/g, " ").trim() : null,
    v.anio].filter(Boolean).join(" ");
  over(`Nor-Oriente Motors · ${pre ? "Pre-estimación de valor" : "Informe de tasación"}`);
  t1(pre ? "Pre-estimación de mercado" : "Tasación de mercado");
  t2(titulo);
  sub(`Valor comercial orientativo  ·  ${p.ciudad ?? "Santiago"}  ·  ${fechaLarga(p.emitido_en)}`);

  h3("Antecedentes del vehículo");
  const ficha: [string, string | null][] = [
    ["Marca / modelo", juntar(v.marca, v.modelo)],
    ["Versión", v.version ?? "Por confirmar"],
    ["Año / combustible", juntar(v.anio, v.combustible)],
    ["Transmisión / kilometraje", juntar(v.transmision, kmTxt(v.km))],
    ["Propietarios / llaves", juntar(v.duenos, v.llaves) || "Por informar"],
    [v.patente ? "Color / patente" : "Color / tracción", v.patente ? juntar(v.color, v.patente) : juntar(v.color, v.traccion)],
  ];
  const gapF = 12 * MM, colF = (W - gapF) / 2;
  for (let i = 0; i < ficha.length; i += 2) {
    const fila = ficha.slice(i, i + 2);
    let altoFila = 0;
    const alturas = fila.map(([, val]) => partir(val || "—", sansB, 10, colF).length);
    altoFila = 3.6 * MM + 7.2 + 1 * MM + Math.max(...alturas) * 12.5 + 2.6 * MM;
    fila.forEach(([k, val], j) => {
      const x = MX + j * (colF + gapF);
      espaciado(k.toUpperCase(), x, y - 3.6 * MM - 7.2, 7.2, sans, MUT, 0.3);
      partir(val || "—", sansB, 10, colF).forEach((l, n) => txt(l, x, y - 3.6 * MM - 7.2 - 1 * MM - 10 - n * 12.5, 10, sansB, INK));
      page.drawLine({ start: { x, y: y - altoFila }, end: { x: x + colF, y: y - altoFila }, thickness: 0.8, color: LINE });
    });
    y -= altoFila;
  }

  const nivel = val.comercialidad ? `${val.comercialidad_txt && String(val.comercialidad_txt).length < 34 ? val.comercialidad_txt : NIVEL[val.comercialidad] ?? "COMERCIALIDAD"} · ${val.comercialidad}/5` : null;
  const resumen = tx.resumen ?? (val.comercialidad_txt && String(val.comercialidad_txt).length >= 34 ? val.comercialidad_txt : null);
  if (nivel || resumen) {
    const lin = resumen ? partir(resumen, sans, 8, W - 10 * MM) : [];
    const alto = 4 * MM + 7.6 + (nivel ? 0.8 * MM + 16 + 1.4 * MM : 0) + lin.length * 11.5 + 4 * MM;
    y -= 6 * MM;
    rr(page, MX, y, W, alto, 2.4 * MM, { border: K, bw: 1.2 });
    let yy = y - 4 * MM - 7.6;
    espaciado("EVALUACIÓN COMERCIAL", MX + 5 * MM, yy, 7.6, sans, GOLD, 0.3);
    if (nivel) { yy -= 0.8 * MM + 15; txt(nivel.toUpperCase(), MX + 5 * MM, yy, 16, serifB, INK); yy -= 1.4 * MM; }
    for (const l of lin) { yy -= 11.5; txt(l, MX + 5 * MM, yy + 2, 8, sans, MUT); }
    y -= alto;
  }

  if (pre) {
    const t = "La muestra de avisos comparables o la identificación de la versión todavía no permiten una tasación plenamente respaldada; los valores son orientativos y se confirmarán con más antecedentes o con la revisión del vehículo.";
    const lin = partir(t, sans, 8, W - 8 * MM);
    const alto = 2.6 * MM * 2 + (lin.length + 1) * 11;
    y -= 4 * MM;
    rr(page, MX, y, W, alto, 2 * MM, { fill: PRE_FONDO, border: PRE_BORDE });
    espaciado("PRE-ESTIMACIÓN SUJETA A ESTUDIO", MX + 4 * MM, y - 2.6 * MM - 8, 8, sansB, PRE_TXT, 0.3);
    lin.forEach((l, i) => txt(l, MX + 4 * MM, y - 2.6 * MM - 8 - (i + 1) * 11, 8, sans, PRE_TXT));
    y -= alto;
  }

  h3("Valorización y precio de publicación");
  const cards: [string, string][] = [
    ["Rango de oferta comparable", rango(val.rango_oferta?.[0], val.rango_oferta?.[1], mmill)],
    ["Publicación sugerida", clp(val.precio_publicacion)],
    ["Venta esperada estimada", rango(val.cierre?.[0], val.cierre?.[1], mmill)],
    [val.comercialidad ? "Comercialidad" : "Valor comercial estimado", val.comercialidad ? `${val.comercialidad} / 5` : clp(val.valor_comercial)],
  ];
  const gapC = 3.2 * MM, colC = (W - gapC) / 2, altoC = 4 * MM + 7.2 + 3 * MM + 18.5 + 5 * MM;
  y -= 4 * MM;
  cards.forEach(([k, val2], i) => {
    const x = MX + (i % 2) * (colC + gapC), yt = y - Math.floor(i / 2) * (altoC + gapC);
    rr(page, x, yt, colC, altoC, 2 * MM, { fill: CARD, border: LINE });
    espaciado(k.toUpperCase(), x + 4.5 * MM, yt - 4 * MM - 7.2, 7.2, sans, MUT, 0.3);
    let tam = 18.5; while (tam > 11 && sansB.widthOfTextAtSize(limpiar(val2), tam) > colC - 9 * MM) tam -= 0.5;
    txt(val2, x + 4.5 * MM, yt - 4 * MM - 7.2 - 3 * MM - tam * 0.95, tam, sansB, INK);
  });
  y -= 2 * altoC + gapC;

  h3("Criterios de tasación");
  parrafo(tx.criterios ?? `La recomendación considera año, versión ${v.version ?? ""}, kilometraje declarado, referencias comparables publicadas y atributos informados. El valor final depende del estado estético, mecánico, documental y de la demanda al momento de comercializar.`);
  parrafo("Tasación orientativa basada en avisos disponibles a la fecha; no equivale a inspección técnica ni garantiza el precio o plazo de venta.", 7.6, MUT, 5 * MM);

  // ───────── Página 2 · Respaldo de mercado ─────────
  nuevaPagina(); foliosBanda.push(page);
  const comps: any[] = Array.isArray(p.comparables) ? p.comparables : [];
  const compacto = comps.length > 3;
  over("Nor-Oriente Motors · Respaldo de mercado");
  t1("Comparables de mercado", compacto ? 22 : 25.5);
  y -= 1.5 * MM;
  sub(`${[v.marca, v.modelo, v.version].filter(Boolean).join(" ")}  ·  avisos de ${cq.cobertura ?? "la Región Metropolitana"}`, INK, 9.6);
  y -= 1.2 * MM;
  const fuentes = cq.fuentes ? String(cq.fuentes).split(/,\s*/).map(portalTxt).join(", ") : "portales de avisos";
  sub(`Fecha de consulta: ${fechaHora(cq.en)}  ·  Fuente: ${fuentes}`);

  h3("Avisos de referencia", compacto ? 4.5 * MM : 6 * MM);
  y -= compacto ? 2.6 * MM : 3.5 * MM;
  const padV = compacto ? 2.6 * MM : 4.2 * MM, gapK = compacto ? 2 * MM : 3 * MM;
  const xN = MX + 4.5 * MM, xT = xN + 11 * MM, xP = MX + W - 4.5 * MM;
  if (!comps.length) parrafo("Sin avisos comparables seleccionados.");
  comps.forEach((c, i) => {
    const precio = clp(c.precio);
    const anchoT = xP - sansB.widthOfTextAtSize(precio, 12) - 6 * MM - xT;
    const tituloC = c.titulo ?? [v.modelo, c.version, c.anio].filter(Boolean).join(" ");
    const tLin = partir(tituloC, sansB, 11, anchoT - (c.financiamiento ? 120 : 0));
    const d1 = juntar(kmTxt(c.km), c.ubicacion);
    const d2 = c.diferencias ? partir(c.diferencias, sans, 7.8, anchoT) : [];
    const conLink = typeof c.url === "string" && /^https?:\/\//.test(c.url);
    const alto = padV + tLin.length * 13 + (d1 ? 11 : 0) + d2.length * 10.5 + (conLink ? 13 : 0) + padV - 2;
    if (!cabe(alto + gapK)) { nuevaPagina(); foliosBanda.push(page); }
    rr(page, MX, y, W, alto, 2 * MM, { border: LINE });
    let yy = y - padV - 9.5;
    txt(String(i + 1).padStart(2, "0"), xN, yy, 9.6, sans, GOLD);
    der(precio, xP, yy - 0.5, 12, sansB, INK);
    tLin.forEach((l, k) => { txt(l, xT, yy - k * 13, 11, sansB, INK); });
    if (c.financiamiento) {
      const ult = tLin[tLin.length - 1] ?? "", xx = xT + sansB.widthOfTextAtSize(ult, 11) + 2 * MM, yTag = yy - (tLin.length - 1) * 13;
      const tag = "PRECIO CON FINANCIAMIENTO", tw = sansB.widthOfTextAtSize(tag, 6.8) + 2.4 * MM;
      rr(page, xx, yTag + 8.5, tw, 11, 1 * MM, { border: PRE_BORDE, bw: 0.7 });
      txt(tag, xx + 1.2 * MM, yTag + 0.8, 6.8, sansB, rgb(0.541, 0.427, 0.122));
    }
    yy -= (tLin.length - 1) * 13;
    if (d1) { yy -= 11; txt(d1, xT, yy, 7.8, sans, MUT); }
    for (const l of d2) { yy -= 10.5; txt(l, xT, yy, 7.8, sans, MUT); }
    if (conLink) {
      yy -= 13;
      const lt = `VER AVISO EN ${portalTxt(c.portal).toUpperCase()}`;
      const ancho = anchoEsp(lt, 7.6, sansB, 0.25);
      espaciado(lt, xT, yy, 7.6, sansB, GREEN, 0.25);
      page.drawLine({ start: { x: xT, y: yy - 1.6 }, end: { x: xT + ancho, y: yy - 1.6 }, thickness: 0.7, color: GREEN });
      enlace(doc, page, c.url, xT, yy - 3, xT + ancho, yy + 8);
    }
    y -= alto + gapK;
  });

  if (!cabe(80)) { nuevaPagina(); foliosBanda.push(page); }
  h3("Análisis de las referencias", compacto ? 4.5 * MM : 6 * MM);
  parrafo(tx.analisis ?? "Los valores de los avisos muestran el rango de oferta de vehículos cercanos en versión y equipamiento, con diferencias de año y kilometraje. Son precios publicados, no operaciones de venta confirmadas, y algunos pueden depender de financiamiento.");

  // Recuadro final: publicación sugerida y venta esperada
  const altoFin = 4.5 * MM * 2 + 7.2 + 3 * MM + 18.5;
  if (!cabe(altoFin + 60)) { nuevaPagina(); foliosBanda.push(page); }
  y -= compacto ? 3.5 * MM : 5 * MM;
  rr(page, MX, y, W, altoFin, 2 * MM, { fill: CARD, border: LINE });
  const colFin = (W - 10 * MM - 4 * MM) / 2;
  espaciado("PRECIO SUGERIDO DE PUBLICACIÓN", MX + 5 * MM, y - 4.5 * MM - 7.2, 7.2, sans, GOLD, 0.3);
  txt(clp(val.precio_publicacion), MX + 5 * MM, y - 4.5 * MM - 7.2 - 3 * MM - 17, 18.5, sansB, INK);
  const xF2 = MX + 5 * MM + colFin + 4 * MM;
  espaciado("VENTA ESPERADA ESTIMADA", xF2, y - 4.5 * MM - 7.2, 7.2, sans, INK, 0.3);
  txt(rango(val.cierre?.[0], val.cierre?.[1], clp), xF2, y - 4.5 * MM - 7.2 - 3 * MM - 14, 10.8, sansB, GREEN);
  y -= altoFin;

  parrafo(`Alcance: ${tx.alcance ?? "los antecedentes de propietarios, kilometraje y llaves fueron informados por el propietario, no verificados en inspección NOM. Los valores suponen una unidad sin daños estructurales, limitaciones de dominio ni reparaciones importantes pendientes."}`, 7.6, MUT, compacto ? 3 * MM : 5 * MM);
  parrafo(`Los avisos y precios pueden modificarse o dejar de estar disponibles con posterioridad a la fecha de consulta.${p.vigencia_hasta ? ` Referencia vigente hasta el ${fechaLarga(p.vigencia_hasta)}.` : ""}`, 7.6, MUT, 2.5 * MM);
  // Siguiente paso: botón que abre WhatsApp con el mensaje listo para agendar la visita (el asesor la reserva y crea
  // el evento en Google Calendar); si hay página de citas, un segundo botón directo al calendario.
  {
    const auto = [v.marca, v.modelo, v.anio].filter(Boolean).join(" ");
    const wa = (op.whatsapp ?? "56986704745").replace(/\D/g, "");
    const msg = `Hola, quiero reservar la inspección y sesión de fotos para consignar mi ${auto}${p.folio ? ` (informe ${p.folio})` : ""}.`;
    const urlWa = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    const texto = `${pre ? "Confirmamos el valor con la inspección completa del vehículo" : "Inspección completa y sesión de fotos profesionales para la publicación"}, en unas 2 horas. En tu casa (Chicureo, Lo Barnechea y Chicauma) o en nuestra oficina en Puertas de Chicureo.`;
    const altoBtn = 22, anchoBtn = 212, gapB = 4;
    const botones: [string, string, ReturnType<typeof rgb>][] = [["RESERVAR INSPECCIÓN Y SESIÓN DE FOTOS", urlWa, GREEN]];
    if (op.agenda_url && /^https:\/\//.test(op.agenda_url)) botones.push(["ELEGIR HORARIO EN EL CALENDARIO", op.agenda_url, K]);
    const anchoTxt = W - 10 * MM - anchoBtn - 6 * MM;
    const lin = partir(texto, sans, 8, anchoTxt);
    const altoBtns = botones.length * altoBtn + (botones.length - 1) * gapB;
    const alto = 3.5 * MM * 2 + Math.max(8.2 + 4 + lin.length * 10.5, altoBtns);
    // Este recuadro puede usar el espacio hasta justo sobre el pie (la línea del pie está a ~14 mm)
    if (y - alto - 3.5 * MM < 16 * MM) { nuevaPagina(); foliosBanda.push(page); }
    y -= 3.5 * MM;
    rr(page, MX, y, W, alto, 2 * MM, { fill: CARD, border: LINE });
    espaciado("SIGUIENTE PASO", MX + 5 * MM, y - 3.5 * MM - 7.4, 7.4, sansB, GOLD, 0.4);
    lin.forEach((l, i) => txt(l, MX + 5 * MM, y - 3.5 * MM - 7.4 - 12 - i * 10.5, 8, sans, INK));
    const xB = MX + W - 5 * MM - anchoBtn;
    let yB = y - alto / 2 + altoBtns / 2;
    for (const [etiqueta, url, fondo] of botones) {
      rr(page, xB, yB, anchoBtn, altoBtn, 3 * MM, { fill: fondo });
      const w = anchoEsp(etiqueta, 7.4, sansB, 0.35);
      espaciado(etiqueta, xB + anchoBtn / 2 - w / 2, yB - altoBtn / 2 - 2.6, 7.4, sansB, BLANCO, 0.35);
      enlace(doc, page, url, xB, yB - altoBtn, xB + anchoBtn, yB);
      yB -= altoBtn + gapB;
    }
    y -= alto;
  }

  // Folio en la banda y pie en todas las páginas
  const pags = doc.getPages(), total = pags.length;
  pags.forEach((pg, i) => {
    page = pg;
    const h = 25 * MM, top = A4[1], xd = A4[0] - 11 * MM;
    const folio = `${p.folio ?? ""}${p.version > 1 ? ` · v${p.version}` : ""}`;
    const s1 = `INFORME PARA CLIENTE | ${String(i + 1).padStart(2, "0")}`;
    espaciado(folio, xd - anchoEsp(folio, 8.2, sans, 0.33), top - h / 2 + 2, 8.2, sans, BLANCO, 0.33);
    espaciado(s1, xd - anchoEsp(s1, 7.6, sans, 0.45), top - h / 2 - 10, 7.6, sans, FOLIO_GRIS, 0.45);
    const yPie = 6.5 * MM + 4;
    pg.drawLine({ start: { x: MX, y: yPie + 7 + 3.2 * MM }, end: { x: MX + W, y: yPie + 7 + 3.2 * MM }, thickness: 0.8, color: LINE });
    const xx = espaciado("NOM", MX, yPie, 7, sansB, INK, 0.28);
    espaciado(` | NOR-ORIENTE MOTORS  ·  ${pre ? "PRE-ESTIMACIÓN COMERCIAL REFERENCIAL" : "TASACIÓN COMERCIAL REFERENCIAL"}`, xx, yPie, 7, sans, rgb(0.294, 0.306, 0.302), 0.28);
    const pt = `PÁGINA ${i + 1} / ${total}`;
    espaciado(pt, MX + W - anchoEsp(pt, 7, sans, 0.28), yPie, 7, sans, rgb(0.294, 0.306, 0.302), 0.28);
  });
  return await doc.save();
}

export async function subirInforme(nombre: string, bytes: Uint8Array): Promise<string> {
  const base = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ruta = `tasaciones/${crypto.randomUUID().replace(/-/g, "")}/${encodeURIComponent(nombre)}`;
  const r = await fetch(`${base}/storage/v1/object/documentos/${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: new Blob([bytes as BlobPart], { type: "application/pdf" }),
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/documentos/${ruta}`;
}

// Nombre del PDF (Felipe 22-nov): «Tasacion Q5 Claudio P.pdf», sin marca, sin año, sin tildes, ~40 caracteres
export const nombreInforme = (p: any, cliente?: string | null) => {
  const limpio = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ñ/gi, "n").replace(/[^A-Za-z0-9 -]+/g, " ").replace(/\s+/g, " ").trim();
  const modelo = limpio(String(p.vehiculo?.modelo ?? "")).split(" ")[0] ?? "";
  const w = limpio(cliente ?? "").split(" ").filter((x) => x && !/^\d+$/.test(x));
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase();
  const SEG = new Set(["jose", "pablo", "carlos", "ignacio", "ignacia", "paz", "jesus", "luis", "miguel", "antonio", "francisco", "javier", "javiera", "andres", "fernanda", "teresa", "elena", "isabel", "eugenia", "cristina", "angel", "de", "del"]);
  let k = 1; while (k < w.length - 1 && SEG.has(w[k].toLowerCase())) k++;
  const cli = w.length > 1 ? `${cap(w[0]).slice(0, 10)} ${w[k].charAt(0).toUpperCase()}` : w.length ? cap(w[0]).slice(0, 10) : "";
  const base = ["Tasacion", modelo.slice(0, 12), cli].filter(Boolean).join(" ");
  return `${base.slice(0, 40).trim() || "Tasacion " + (p.folio ?? "")}.pdf`;
};
