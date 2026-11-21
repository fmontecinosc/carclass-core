// Documentos que el asesor envía por WhatsApp: hoy, la cotización de PPF por modelo (precios públicos de la
// planilla de Hiendcar en las dos calidades, con marca Carclass y sin columnas dealer ni costos).
// El PDF se arma con pdf-lib y se guarda en el bucket público «documentos» de Supabase con una ruta no adivinable.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const NEGRO = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.42, 0.42, 0.42);
const LINEA = rgb(0.85, 0.85, 0.85);
const FONDO = rgb(0.965, 0.965, 0.965);
const DORADO = rgb(0.639, 0.494, 0.173); // #A37E2C
const LOGO_URL = "https://app.carclass.cl/img/logo.png"; // publicado con la app Core

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
const limpiar = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ·—–•]/g, "");

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

let logoCache: Uint8Array | null = null;
async function logo(): Promise<Uint8Array | null> {
  if (logoCache) return logoCache;
  try {
    const r = await fetch(LOGO_URL);
    if (!r.ok) return null;
    logoCache = new Uint8Array(await r.arrayBuffer());
    return logoCache;
  } catch { return null; }
}

export async function pdfPpf(d: DatosPpf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Cotización PPF ${d.vehiculo} · Carclass`);
  doc.setAuthor("Carclass");
  const page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 44, W = 595.28 - 2 * M;
  let y = 841.89 - 40;
  const txt = (t: string, x: number, yy: number, size: number, font = reg, color = NEGRO) =>
    page.drawText(limpiar(t), { x, y: yy, size, font, color });
  const der = (t: string, xDer: number, yy: number, size: number, font = reg, color = NEGRO) =>
    txt(t, xDer - font.widthOfTextAtSize(limpiar(t), size), yy, size, font, color);

  // Encabezado: logo, marca y datos del documento
  const lb = await logo();
  if (lb) {
    try { const img = await doc.embedPng(lb); page.drawImage(img, { x: M, y: y - 62, width: 66, height: 66 }); } catch { /* sin logo */ }
  }
  txt("CARCLASS", M + 80, y - 22, 20, neg);
  txt("Protección y estética vehicular · Instalador oficial XPEL", M + 80, y - 38, 9, reg, GRIS);
  der("COTIZACIÓN PPF", M + W, y - 18, 13, neg);
  der(`N° ${d.numero}`, M + W, y - 34, 9, reg, GRIS);
  der(`Emitida el ${d.fecha}`, M + W, y - 46, 9, reg, GRIS);
  der(`Válida hasta el ${d.vigencia}`, M + W, y - 58, 9, reg, GRIS);
  y -= 78;
  page.drawRectangle({ x: M, y, width: W, height: 2, color: DORADO });
  y -= 26;

  // Cliente y vehículo
  const col2 = M + W / 2;
  txt("CLIENTE", M, y, 7.5, neg, GRIS); txt("VEHÍCULO", col2, y, 7.5, neg, GRIS);
  y -= 15;
  txt(d.cliente || "—", M, y, 11.5, neg);
  const veh = partir(d.vehiculo, neg, 11.5, W / 2);
  veh.forEach((l, i) => txt(l, col2, y - i * 14, 11.5, neg));
  y -= 14 * Math.max(1, veh.length) + 16;

  // Título y explicación
  txt("Protección de pintura (PPF) XPEL", M, y, 15, neg);
  y -= 16;
  for (const l of partir("Film transparente que absorbe piedras, gravilla y rayas, y protege la pintura original. Valores con IVA e instalación incluidos, según la plantilla del fabricante para este modelo.", reg, 9.5, W)) { txt(l, M, y, 9.5, reg, GRIS); y -= 13; }
  y -= 10;

  // Tabla: cobertura × calidad
  const c1 = W * 0.50, c2 = W * 0.25;
  const xG = M + c1, xU = M + c1 + c2;
  page.drawRectangle({ x: M, y: y - 34, width: W, height: 40, color: NEGRO });
  txt("COBERTURA", M + 10, y - 18, 8.5, neg, rgb(1, 1, 1));
  der("XPEL XTREME", xG + c2 - 10, y - 12, 8.5, neg, rgb(1, 1, 1));
  der("brillante · 7,1 mil", xG + c2 - 10, y - 25, 7.5, reg, rgb(0.8, 0.8, 0.8));
  der("XPEL ULTIMATE PLUS 8", xU + c2 - 10, y - 12, 8.5, neg, rgb(1, 1, 1));
  der("brillante · 7,6 mil", xU + c2 - 10, y - 25, 7.5, reg, rgb(0.8, 0.8, 0.8));
  y -= 34;
  for (const [i, f] of d.filas.entries()) {
    const det = partir(f.detalle, reg, 8.5, c1 - 20);
    const alto = 27 + det.length * 11;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO });
    txt(f.nombre, M + 10, y - 16, 10.5, neg);
    det.forEach((l, k) => txt(l, M + 10, y - 29 - k * 11, 8.5, reg, GRIS));
    const pre = d.estimado ? "desde " : "";
    der(f.gloss ? pre + clp(f.gloss) : "a cotizar", xG + c2 - 10, y - 18, 11, neg);
    der(f.ultimate ? pre + clp(f.ultimate) : "a cotizar", xU + c2 - 10, y - 18, 11, neg);
    y -= alto;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINEA });
  }
  y -= 22;

  // Paquetes Carclass con PPF
  if (d.paquetes.length) {
    txt("PAQUETES CARCLASS CON PPF XPEL XTREME", M, y, 8.5, neg, DORADO);
    y -= 8;
    for (const p of d.paquetes) {
      const det = partir(p.detalle, reg, 8.5, W - 130);
      const alto = 27 + det.length * 11;
      page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, borderColor: LINEA, borderWidth: 0.8, color: rgb(1, 1, 1) });
      txt(p.nombre, M + 10, y - 16, 10.5, neg);
      det.forEach((l, k) => txt(l, M + 10, y - 29 - k * 11, 8.5, reg, GRIS));
      der((d.estimado ? "desde " : "") + clp(p.precio), M + W - 10, y - 18, 11, neg);
      y -= alto + 6;
    }
    y -= 12;
  }

  // Condiciones
  txt("CONDICIONES", M, y, 8.5, neg, GRIS);
  y -= 14;
  const cond = [
    d.estimado
      ? "Valores referenciales: aún no tenemos la plantilla exacta de este modelo. Te confirmamos el valor final con el instalador antes de agendar."
      : "Valores sujetos a revisión del vehículo en la recepción.",
    "Para reservar se abonan $50.000, que se descuentan del total. Al recibir el auto se completa el 50% y el saldo se paga a la entrega.",
    "Recepción en nuestro taller del complejo industrial Alto Portezuelo, en Quilicura, o en nuestra oficina de Av. Puerta Oriente 361, oficina 409B, Chicureo, previa coordinación.",
    "Instalación por técnicos certificados XPEL, con control de calidad e informe fotográfico. Garantía según la línea elegida.",
  ];
  for (const c of cond) {
    const ls = partir(c, reg, 8.5, W - 12);
    page.drawCircle({ x: M + 3, y: y + 3, size: 1.6, color: DORADO });
    ls.forEach((l, k) => txt(l, M + 12, y - k * 11.5, 8.5, reg, NEGRO));
    y -= ls.length * 11.5 + 5;
  }

  // Pie
  page.drawLine({ start: { x: M, y: 52 }, end: { x: M + W, y: 52 }, thickness: 0.6, color: LINEA });
  txt("Carclass · +56 9 8670 4745 · carclass.cl · @carclass.cl", M, 38, 8.5, reg, GRIS);
  der("Responde por WhatsApp para reservar", M + W, 38, 8.5, neg, NEGRO);

  return await doc.save();
}

// Cotización Carclass (cerámico, láminas, paquetes, etc.): mismo formato que la de PPF, con líneas, neto, IVA y total
export interface LineaCot { nombre: string; descripcion?: string | null; cantidad: number; precio: number }
export interface DatosCot { numero: string; fecha: string; vigencia: string; cliente: string | null; vehiculo: string | null; lineas: LineaCot[]; total: number; notas?: string | null }

export async function pdfCotizacion(d: DatosCot): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Cotización ${d.numero} · Carclass`);
  doc.setAuthor("Carclass");
  const page: PDFPage = doc.addPage([595.28, 841.89]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 44, W = 595.28 - 2 * M;
  let y = 841.89 - 40;
  const txt = (t: string, x: number, yy: number, size: number, font = reg, color = NEGRO) =>
    page.drawText(limpiar(t), { x, y: yy, size, font, color });
  const der = (t: string, xDer: number, yy: number, size: number, font = reg, color = NEGRO) =>
    txt(t, xDer - font.widthOfTextAtSize(limpiar(t), size), yy, size, font, color);

  const lb = await logo();
  if (lb) { try { const img = await doc.embedPng(lb); page.drawImage(img, { x: M, y: y - 62, width: 66, height: 66 }); } catch { /* sin logo */ } }
  txt("CARCLASS", M + 80, y - 22, 20, neg);
  txt("Protección y estética vehicular · Instalador oficial XPEL", M + 80, y - 38, 9, reg, GRIS);
  der("COTIZACIÓN", M + W, y - 18, 13, neg);
  der(`N° ${d.numero}`, M + W, y - 34, 9, reg, GRIS);
  der(`Emitida el ${d.fecha}`, M + W, y - 46, 9, reg, GRIS);
  der(`Válida hasta el ${d.vigencia}`, M + W, y - 58, 9, reg, GRIS);
  y -= 78;
  page.drawRectangle({ x: M, y, width: W, height: 2, color: DORADO });
  y -= 26;
  const col2 = M + W / 2;
  txt("CLIENTE", M, y, 7.5, neg, GRIS); txt("VEHÍCULO", col2, y, 7.5, neg, GRIS);
  y -= 15;
  txt(d.cliente || "—", M, y, 11.5, neg);
  const veh = partir(d.vehiculo || "—", neg, 11.5, W / 2);
  veh.forEach((l, i) => txt(l, col2, y - i * 14, 11.5, neg));
  y -= 14 * Math.max(1, veh.length) + 22;

  // Tabla de servicios
  const cN = W * 0.56, cC = W * 0.10, cP = W * 0.17;
  page.drawRectangle({ x: M, y: y - 26, width: W, height: 26, color: NEGRO });
  const blanco = rgb(1, 1, 1);
  txt("SERVICIO", M + 10, y - 17, 8.5, neg, blanco);
  der("CANT.", M + cN + cC - 6, y - 17, 8.5, neg, blanco);
  der("PRECIO", M + cN + cC + cP - 6, y - 17, 8.5, neg, blanco);
  der("TOTAL", M + W - 10, y - 17, 8.5, neg, blanco);
  y -= 26;
  for (const [i, l] of d.lineas.entries()) {
    const det = l.descripcion ? partir(l.descripcion, reg, 8.5, cN - 20) : [];
    const alto = 27 + det.length * 11;
    if (i % 2 === 1) page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO });
    const nom = partir(l.nombre, neg, 10.5, cN - 20)[0] ?? l.nombre;
    txt(nom, M + 10, y - 16, 10.5, neg);
    det.forEach((t, k) => txt(t, M + 10, y - 29 - k * 11, 8.5, reg, GRIS));
    der(String(l.cantidad), M + cN + cC - 6, y - 16, 10, reg);
    der(clp(l.precio), M + cN + cC + cP - 6, y - 16, 10, reg);
    der(clp(l.precio * l.cantidad), M + W - 10, y - 16, 10.5, neg);
    y -= alto;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINEA });
  }
  // Totales (montos con IVA incluido)
  const neto = Math.round(d.total / 1.19);
  y -= 16;
  const fila = (k: string, v: string, grande = false) => {
    txt(k, M + W - 210, y, grande ? 11 : 9.5, grande ? neg : reg, grande ? NEGRO : GRIS);
    der(v, M + W - 10, y, grande ? 13 : 10, grande ? neg : reg);
    y -= grande ? 22 : 15;
  };
  fila("Neto", clp(neto)); fila("IVA 19%", clp(d.total - neto));
  page.drawLine({ start: { x: M + W - 210, y: y + 10 }, end: { x: M + W, y: y + 10 }, thickness: 0.8, color: DORADO });
  y -= 4;
  fila("TOTAL (IVA incluido)", clp(d.total), true);
  y -= 14;

  txt("CONDICIONES", M, y, 8.5, neg, GRIS);
  y -= 14;
  const cond = [
    ...(d.notas ? [d.notas] : []),
    "Valores con IVA incluido, sujetos a revisión del vehículo en la recepción.",
    "Para reservar se abonan $50.000, que se descuentan del total. Al recibir el auto se completa el 50% y el saldo se paga a la entrega.",
    "Recepción en nuestro taller del complejo industrial Alto Portezuelo, en Quilicura, o en nuestra oficina de Av. Puerta Oriente 361, oficina 409B, Chicureo, previa coordinación.",
    "Instalación por técnicos certificados XPEL, con control de calidad e informe fotográfico.",
  ];
  for (const c of cond) {
    const ls = partir(c, reg, 8.5, W - 12);
    page.drawCircle({ x: M + 3, y: y + 3, size: 1.6, color: DORADO });
    ls.forEach((l, k) => txt(l, M + 12, y - k * 11.5, 8.5, reg, NEGRO));
    y -= ls.length * 11.5 + 5;
  }
  page.drawLine({ start: { x: M, y: 52 }, end: { x: M + W, y: 52 }, thickness: 0.6, color: LINEA });
  txt("Carclass · +56 9 8670 4745 · carclass.cl · @carclass.cl", M, 38, 8.5, reg, GRIS);
  der("Responde por WhatsApp para reservar", M + W, 38, 8.5, neg, NEGRO);
  return await doc.save();
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
