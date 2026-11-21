// Documentos que el asesor envía por WhatsApp: cotización de PPF por modelo (precios públicos de la planilla de
// Hiendcar en las dos calidades, sin columnas dealer ni costos) y cotización Carclass general.
// Estética de la marca Carclass, la misma del cotizador de Netlify (herramientas/cotizador-carclass): banda negra de
// 36 mm con los servicios en versalitas a la izquierda, logo blanco al centro y título y datos a la derecha; tabla con
// encabezados negros; totales en cajas gris/negro; pie con contacto y condiciones en mayúsculas.
// El PDF se arma con pdf-lib y se guarda en el bucket público «documentos» con una ruta no adivinable.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";

const NEGRO = rgb(0, 0, 0);
const TINTA = rgb(0.1, 0.1, 0.1);
const GRIS_OSC = rgb(0.29, 0.29, 0.29);   // #4a4a4a
const GRIS = rgb(0.47, 0.47, 0.47);
const GRIS_CLARO = rgb(0.74, 0.74, 0.74); // #bdbdbd
const LINEA = rgb(0.88, 0.88, 0.88);
const FONDO = rgb(0.957, 0.957, 0.957);   // #f4f4f4
const BLANCO = rgb(1, 1, 1);
const DORADO = rgb(0.639, 0.494, 0.173);  // #A37E2C
const LOGO_BLANCO = "https://app.carclass.cl/img/logo-blanco.png";

const A4: [number, number] = [595.28, 841.89];
const MM = 2.8346;
const M = 14 * MM; // margen lateral del cotizador (14 mm)

export interface FilaPpf { nombre: string; detalle: string; gloss: number | null; ultimate: number | null }
export interface PaquetePpf { nombre: string; detalle: string; precio: number }
export interface DatosPpf {
  numero: string;
  fecha: string;          // «21 de noviembre de 2026»
  vigencia: string;       // «28 de noviembre de 2026»
  cliente: string | null;
  vehiculo: string;       // como lo escribió el cliente o el modelo de la planilla
  filas: FilaPpf[];
  paquetes: PaquetePpf[];
  estimado: boolean;      // sin planilla del modelo: valores referenciales «desde»
}

const clp = (n: number) => "$" + Math.round(n).toLocaleString("es-CL").replace(/,/g, ".");

// pdf-lib con fuentes estándar solo dibuja WinAnsi: se reemplazan los caracteres que no existen ahí
const limpiar = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ·—–•]/g, "");

function partir(texto: string, font: PDFFont, size: number, ancho: number): string[] {
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

const cacheImg = new Map<string, Uint8Array>();
async function bajar(url: string): Promise<Uint8Array | null> {
  if (cacheImg.has(url)) return cacheImg.get(url)!;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    cacheImg.set(url, b);
    return b;
  } catch { return null; }
}

// Contexto de dibujo de una página Carclass
interface Lienzo {
  doc: PDFDocument; page: PDFPage; reg: PDFFont; neg: PDFFont; W: number;
  txt: (t: string, x: number, y: number, size: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => void;
  der: (t: string, xDer: number, y: number, size: number, font?: PDFFont, color?: ReturnType<typeof rgb>) => void;
}

// Banda negra superior como el cotizador: servicios | logo | título y datos. Devuelve la y bajo la banda.
async function lienzoCarclass(titulo: string, servicios: string[], campos: [string, string][], tituloDoc: string): Promise<{ lz: Lienzo; y: number }> {
  const doc = await PDFDocument.create();
  doc.setTitle(tituloDoc);
  doc.setAuthor("Carclass");
  const page = doc.addPage(A4);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = A4[0] - 2 * M;
  const txt: Lienzo["txt"] = (t, x, y, size, font = reg, color = TINTA) => page.drawText(limpiar(t), { x, y, size, font, color });
  const der: Lienzo["der"] = (t, xDer, y, size, font = reg, color = TINTA) =>
    txt(t, xDer - font.widthOfTextAtSize(limpiar(t), size), y, size, font, color);
  const lz: Lienzo = { doc, page, reg, neg, W, txt, der };

  const alto = 36 * MM, top = A4[1];
  page.drawRectangle({ x: 0, y: top - alto, width: A4[0], height: alto, color: NEGRO });
  const cy = top - alto / 2;

  // Izquierda: hasta 4 servicios en versalitas
  const sv = servicios.slice(0, 4).map((s) => s.toUpperCase());
  const lh = 15;
  sv.forEach((s, i) => txt(s, M, cy + ((sv.length - 1) / 2 - i) * lh - 4.5, 12.5, neg, BLANCO));

  // Centro: logo blanco (si no carga, la palabra CARCLASS)
  let img: PDFImage | null = null;
  const lb = await bajar(LOGO_BLANCO);
  if (lb) { try { img = await doc.embedPng(lb); } catch { img = null; } }
  if (img) {
    const h = 24 * MM, w = h * (img.width / img.height);
    page.drawImage(img, { x: A4[0] / 2 - w / 2, y: cy - h / 2, width: w, height: h });
  } else {
    const t = "CARCLASS";
    txt(t, A4[0] / 2 - neg.widthOfTextAtSize(t, 20) / 2, cy - 7, 20, neg, BLANCO);
  }

  // Derecha: título y campos con subrayado gris como el cotizador
  const xD = A4[0] - M;
  const nC = campos.length;
  const bloque = 22 + nC * 14;
  let yy = cy + bloque / 2 - 16;
  der(titulo.toUpperCase(), xD, yy, 16, neg, BLANCO);
  yy -= 20;
  for (const [k, v] of campos) {
    const val = limpiar(v.toUpperCase());
    const wv = Math.max(neg.widthOfTextAtSize(val, 8), 100);
    der(val, xD, yy, 8, neg, BLANCO);
    page.drawLine({ start: { x: xD - wv, y: yy - 3 }, end: { x: xD, y: yy - 3 }, thickness: 0.6, color: rgb(0.33, 0.33, 0.33) });
    der(k.toUpperCase(), xD - wv - 6, yy, 8, reg, GRIS_CLARO);
    yy -= 14;
  }
  return { lz, y: top - alto - 10 * MM };
}

// Bloques de información a dos columnas (Cliente | Vehículo) con líneas punteadas, como .info-grid
function bloquesInfo(lz: Lienzo, y: number, izq: [string, [string, string][]], dch: [string, [string, string][]]): number {
  const { txt, der, neg, reg, page, W } = lz;
  const colW = (W - 22) / 2;
  let yMin = y;
  for (const [i, [titulo, filas]] of [izq, dch].entries()) {
    const x = M + i * (colW + 22);
    let yy = y;
    txt(titulo.toUpperCase(), x, yy, 7.5, neg, GRIS);
    yy -= 15;
    for (const [k, v] of filas) {
      txt(k, x, yy, 9.5, reg, GRIS);
      const vv = partir(v || "—", neg, 9.5, colW - reg.widthOfTextAtSize(k, 9.5) - 10)[0] ?? "—";
      der(vv, x + colW, yy, 9.5, neg, TINTA);
      for (let d = 0; d < colW; d += 3) page.drawLine({ start: { x: x + d, y: yy - 5 }, end: { x: x + d + 1, y: yy - 5 }, thickness: 0.5, color: LINEA });
      yy -= 17;
    }
    yMin = Math.min(yMin, yy);
  }
  return yMin - 10;
}

// Encabezado de tabla en celdas negras separadas (border-spacing 6px del cotizador)
function cabeceraTabla(lz: Lienzo, y: number, cols: { x: number; w: number; t: string; sub?: string; der?: boolean }[]): number {
  const alto = cols.some((c) => c.sub) ? 30 : 22;
  for (const c of cols) {
    lz.page.drawRectangle({ x: c.x, y: y - alto, width: c.w, height: alto, color: NEGRO });
    const yT = c.sub ? y - 12.5 : y - 14.5;
    if (c.der) lz.der(c.t, c.x + c.w - 9, yT, 8.5, lz.neg, BLANCO); else lz.txt(c.t, c.x + 9, yT, 8.5, lz.neg, BLANCO);
    if (c.sub) { if (c.der) lz.der(c.sub, c.x + c.w - 9, y - 24, 7, lz.reg, GRIS_CLARO); else lz.txt(c.sub, c.x + 9, y - 24, 7, lz.reg, GRIS_CLARO); }
  }
  return y - alto;
}

function tituloBloque(lz: Lienzo, y: number, t: string, color = GRIS_OSC): number {
  lz.page.drawLine({ start: { x: M, y: y + 12 }, end: { x: M + lz.W, y: y + 12 }, thickness: 0.6, color: LINEA });
  lz.txt(t.toUpperCase(), M, y - 2, 8.5, lz.neg, color);
  return y - 16;
}

// Caja de totales: etiqueta gris/negra a la izquierda, valor en caja blanca a la derecha
function filaTotal(lz: Lienzo, y: number, k: string, v: string, grande = false): number {
  const ancho = 270, x = M + lz.W - ancho, h = grande ? 30 : 25;
  lz.page.drawRectangle({ x, y: y - h, width: ancho / 2, height: h, color: grande ? NEGRO : GRIS_OSC });
  lz.page.drawRectangle({ x: x + ancho / 2, y: y - h, width: ancho / 2, height: h, color: BLANCO, borderColor: grande ? NEGRO : LINEA, borderWidth: 1.2 });
  lz.txt(k.toUpperCase(), x + 11, y - h / 2 - 3.5, 9, lz.neg, BLANCO);
  lz.der(v, x + ancho - 11, y - h / 2 - (grande ? 5.5 : 4.5), grande ? 15 : 12, lz.neg, TINTA);
  return y - h - 5;
}

// Pie del cotizador: contacto a la izquierda en mayúsculas, condiciones a la derecha
function pieCarclass(lz: Lienzo, yTope: number, condiciones: string[]) {
  const { txt, neg, reg, page, W } = lz;
  const colIzq = W * 0.4, xC = M + colIzq + 18, wC = W - colIzq - 18;
  const lineas = condiciones.map((c) => partir(c, reg, 7.8, wC - 10));
  const altoCond = 14 + lineas.reduce((s, l) => s + l.length * 10 + 4, 0);
  const contacto = ["+56 9 8670 4745", "carclass.cl · @carclass.cl", "76.898.699-1", "Protección y estética vehicular premium", "Oficina: Puerta Oriente 361, of. 409B, Chicureo", "Instalación: complejo Alto Portezuelo, Quilicura"];
  const alto = Math.max(altoCond, contacto.length * 11.5 + 4);
  const yBase = 14 * MM;
  let y = Math.min(yTope, yBase + alto);
  page.drawLine({ start: { x: M, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.6, color: LINEA });
  let yi = y - 4;
  for (const c of contacto) { txt(c.toUpperCase(), M, yi, 7.6, reg, TINTA); yi -= 11.5; }
  txt("CONDICIONES", xC, y - 4, 8.2, neg, TINTA);
  y -= 18;
  for (const ls of lineas) {
    page.drawCircle({ x: xC + 2.5, y: y + 2.6, size: 1.4, color: DORADO });
    ls.forEach((l, k) => txt(l, xC + 9, y - k * 10, 7.8, reg, rgb(0.2, 0.2, 0.2)));
    y -= ls.length * 10 + 4;
  }
}

const RECEPCION = "Recepción en el centro de instalación del complejo industrial Alto Portezuelo, en Quilicura, o en nuestra oficina en Puertas de Chicureo (Av. Puerta Oriente 361, oficina 409B), previa coordinación.";
const RESERVA = "Para reservar se abonan $50.000, que se descuentan del total. Al recibir el auto se completa el 50% y el saldo se paga a la entrega.";

export async function pdfPpf(d: DatosPpf): Promise<Uint8Array> {
  const servicios = ["PPF", ...(d.paquetes.length ? ["Sellado cerámico", "Láminas de seguridad"] : [])];
  const { lz, y: y0 } = await lienzoCarclass("Cotización PPF", servicios,
    [["N°", d.numero], ["Fecha", d.fecha], ["Válida hasta", d.vigencia]], `Cotización PPF ${d.vehiculo} · Carclass`);
  const { txt, der, reg, neg, page, W } = lz;
  let y = bloquesInfo(lz, y0, ["Cliente", [["Nombre", d.cliente || "—"]]], ["Vehículo", [["Modelo", d.vehiculo]]]);

  txt("Protección de pintura XPEL", M, y, 15, neg, TINTA);
  y -= 15;
  for (const l of partir("Film transparente que absorbe piedras, gravilla y rayas, y protege la pintura original. Valores con IVA e instalación incluidos, según la plantilla del fabricante para este modelo.", reg, 9.2, W)) { txt(l, M, y, 9.2, reg, GRIS); y -= 12.5; }
  y -= 8;

  const gap = 4.25, cW = W * 0.25;
  const x1 = M, w1 = W - 2 * cW - 2 * gap, xG = x1 + w1 + gap, xU = xG + cW + gap;
  y = cabeceraTabla(lz, y, [
    { x: x1, w: w1, t: "COBERTURA" },
    { x: xG, w: cW, t: "XPEL GLOSS", sub: "brillante · recomendada", der: true },
    { x: xU, w: cW, t: "XPEL ULTIMATE", sub: "Ultimate Plus 8 · línea superior", der: true },
  ]);
  for (const [i, f] of d.filas.entries()) {
    const det = partir(f.detalle, reg, 8.3, w1 - 20);
    const alto = 26 + det.length * 10.5;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO });
    txt(f.nombre, x1 + 9, y - 15, 10.5, neg);
    det.forEach((l, k) => txt(l, x1 + 9, y - 27 - k * 10.5, 8.3, reg, GRIS));
    const pre = d.estimado ? "desde " : "";
    der(f.gloss ? pre + clp(f.gloss) : "a cotizar", xG + cW - 9, y - 16, 11, neg);
    der(f.ultimate ? pre + clp(f.ultimate) : "a cotizar", xU + cW - 9, y - 16, 11, neg);
    y -= alto;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINEA });
  }
  y -= 26;

  if (d.paquetes.length) {
    y = tituloBloque(lz, y, "Paquetes Carclass con PPF XPEL Gloss", DORADO);
    for (const p of d.paquetes) {
      const det = partir(p.detalle, reg, 8.3, W - 150);
      const alto = 26 + det.length * 10.5;
      page.drawRectangle({ x: M, y: y - alto, width: 3, height: alto, color: DORADO });
      page.drawRectangle({ x: M + 3, y: y - alto, width: W - 3, height: alto, color: FONDO });
      txt(p.nombre, M + 13, y - 15, 10.5, neg);
      det.forEach((l, k) => txt(l, M + 13, y - 27 - k * 10.5, 8.3, reg, GRIS));
      der((d.estimado ? "desde " : "") + clp(p.precio), M + W - 11, y - 16, 12, neg);
      y -= alto + 6;
    }
    y -= 10;
  }

  pieCarclass(lz, y, [
    d.estimado
      ? "Valores referenciales: aún no tenemos la plantilla exacta de este modelo. Te confirmamos el valor final con el instalador antes de agendar."
      : "Valores con IVA incluido, sujetos a revisión del vehículo en la recepción.",
    RESERVA,
    RECEPCION,
    "Instalación por técnicos certificados XPEL, con control de calidad e informe fotográfico. Garantía según la línea elegida.",
  ]);
  return await lz.doc.save();
}

// Cotización Carclass (cerámico, láminas, paquetes, etc.): misma estética, con líneas, neto, IVA y total
export interface LineaCot { nombre: string; descripcion?: string | null; cantidad: number; precio: number }
export interface DatosCot { numero: string; fecha: string; vigencia: string; cliente: string | null; vehiculo: string | null; lineas: LineaCot[]; total: number; notas?: string | null }

// Servicios de la cabecera según lo cotizado (como headerLinesHtml del cotizador)
function serviciosDe(lineas: LineaCot[]): string[] {
  const s = new Set<string>();
  for (const l of lineas) {
    const n = l.nombre.toLowerCase(); // solo el nombre: la descripción menciona marcas e incluidos
    if (/protection pack/.test(n)) { s.add("PPF"); s.add("Sellado cerámico"); s.add("Láminas de seguridad"); continue; }
    if (/shield/.test(n)) { s.add("PPF"); s.add("Sellado cerámico"); continue; }
    if (/ppf|gloss|xtreme|ultimate|stealth|film/.test(n)) s.add("PPF");
    if (/cer[aá]mic/.test(n)) s.add("Sellado cerámico");
    if (/l[aá]min/.test(n)) s.add("Láminas de seguridad");
    if (/detail|pulid|interior/.test(n)) s.add("Detailing");
  }
  const orden = ["PPF", "Sellado cerámico", "Láminas de seguridad", "Detailing"];
  const r = orden.filter((o) => s.has(o));
  return r.length ? r : orden;
}

export async function pdfCotizacion(d: DatosCot): Promise<Uint8Array> {
  const { lz, y: y0 } = await lienzoCarclass("Cotización", serviciosDe(d.lineas),
    [["N°", d.numero], ["Fecha", d.fecha], ["Válida hasta", d.vigencia]], `Cotización ${d.numero} · Carclass`);
  const { txt, der, reg, neg, page, W } = lz;
  let y = bloquesInfo(lz, y0, ["Cliente", [["Nombre", d.cliente || "—"]]], ["Vehículo", [["Modelo", d.vehiculo || "—"]]]);

  const gap = 4.25, wC = 46, wP = 88, wT = 92;
  const wN = W - wC - wP - wT - 3 * gap;
  const xN = M, xC = xN + wN + gap, xP = xC + wC + gap, xT = xP + wP + gap;
  y = cabeceraTabla(lz, y, [
    { x: xN, w: wN, t: "SERVICIO" }, { x: xC, w: wC, t: "CANT.", der: true },
    { x: xP, w: wP, t: "PRECIO", der: true }, { x: xT, w: wT, t: "TOTAL", der: true },
  ]);
  for (const [i, l] of d.lineas.entries()) {
    const det = l.descripcion ? partir(l.descripcion, reg, 8.3, wN - 20).slice(0, 4) : [];
    const alto = 26 + det.length * 10.5;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO });
    txt(partir(l.nombre, neg, 10.5, wN - 18)[0] ?? l.nombre, xN + 9, y - 15, 10.5, neg);
    det.forEach((t, k) => txt(t, xN + 9, y - 27 - k * 10.5, 8.3, reg, GRIS));
    der(String(l.cantidad), xC + wC - 9, y - 15, 10, reg);
    der(clp(l.precio), xP + wP - 9, y - 15, 10, reg);
    der(clp(l.precio * l.cantidad), xT + wT - 9, y - 15, 10.5, neg);
    y -= alto;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINEA });
  }

  // Totales (montos con IVA incluido)
  const neto = Math.round(d.total / 1.19);
  y -= 18;
  y = filaTotal(lz, y, "Neto", clp(neto));
  y = filaTotal(lz, y, "IVA 19%", clp(d.total - neto));
  y = filaTotal(lz, y, "Total", clp(d.total), true);
  der("Valores en pesos chilenos con IVA incluido", M + W, y - 6, 7.8, reg, GRIS);
  y -= 30;

  pieCarclass(lz, y, [
    ...(d.notas ? [d.notas] : []),
    "Valores sujetos a revisión del vehículo en la recepción.",
    RESERVA,
    RECEPCION,
    "Instalación por técnicos certificados XPEL, con control de calidad e informe fotográfico.",
  ]);
  return await lz.doc.save();
}

// Sube el PDF al bucket público «documentos» y devuelve su URL. La ruta lleva un token aleatorio.
export async function subirDocumento(nombreArchivo: string, bytes: Uint8Array, carpeta = "ppf"): Promise<string> {
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ruta = `${carpeta}/${crypto.randomUUID().replace(/-/g, "")}/${nombreArchivo}`;
  const r = await fetch(`${base}/storage/v1/object/documentos/${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: new Blob([bytes as BlobPart], { type: "application/pdf" }),
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/documentos/${ruta}`;
}

// Nombre de archivo legible y seguro: «Cotizacion-PPF-BMW-X3-2024.pdf»
export function nombreArchivo(vehiculo: string): string {
  const s = vehiculo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `Cotizacion-PPF-${s || "vehiculo"}.pdf`;
}
