// Informe de tasación NOM en PDF para el cliente (Felipe 21-nov-2026: al cliente se le envía el documento, no links).
// Se arma SOLO con nom.payload_cliente (lista blanca): nunca costos, comisiones internas ni notas del tasador.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "npm:pdf-lib@1.17.1";

const NEGRO = rgb(0.08, 0.08, 0.08);
const GRIS = rgb(0.42, 0.42, 0.42);
const LINEA = rgb(0.85, 0.85, 0.85);
const FONDO = rgb(0.965, 0.965, 0.965);
const ACENTO = rgb(0.0, 0.376, 0.224); // verde #006039
const LOGO_URL = "https://app.carclass.cl/img/nom-logo.png";

const clp = (n: unknown) => (n == null || Number.isNaN(Number(n))) ? "—" : "$" + Math.round(Number(n)).toLocaleString("es-CL").replace(/,/g, ".");
const miles = (n: unknown) => (n == null) ? "—" : Math.round(Number(n)).toLocaleString("es-CL").replace(/,/g, ".");
const limpiar = (t: string) => String(t ?? "").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E -ÿ·—–•\n]/g, "");
const fechaLarga = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(String(iso).length === 10 ? `${iso}T12:00:00Z` : String(iso));
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", year: "numeric" }).format(d);
};

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
  try { const r = await fetch(LOGO_URL); if (!r.ok) return null; logoCache = new Uint8Array(await r.arrayBuffer()); return logoCache; } catch { return null; }
}

export async function pdfInforme(p: any): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const v = p.vehiculo ?? {}, val = p.valores ?? {}, tx = p.textos ?? {}, cons = p.consulta ?? {};
  const auto = [v.marca, v.modelo, v.version, v.anio].filter(Boolean).join(" ");
  doc.setTitle(`Informe de tasación ${p.folio} · Nor-Oriente Motors`);
  doc.setAuthor("Nor-Oriente Motors");
  let page: PDFPage = doc.addPage([595.28, 841.89]);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const neg = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 44, W = 595.28 - 2 * M;
  let y = 841.89 - 40;
  const txt = (t: string, x: number, yy: number, size: number, font = reg, color = NEGRO) => page.drawText(limpiar(t), { x, y: yy, size, font, color });
  const der = (t: string, xd: number, yy: number, size: number, font = reg, color = NEGRO) => txt(t, xd - font.widthOfTextAtSize(limpiar(t), size), yy, size, font, color);
  const nuevaPagina = () => { page = doc.addPage([595.28, 841.89]); y = 841.89 - 50; };
  const asegurar = (alto: number) => { if (y - alto < 70) nuevaPagina(); };
  const parrafo = (t: string, size = 9.5, color = NEGRO) => { for (const l of partir(t, reg, size, W)) { asegurar(14); txt(l, M, y, size, reg, color); y -= size + 4; } };
  const titulo = (t: string) => { asegurar(30); y -= 8; txt(t.toUpperCase(), M, y, 8.5, neg, ACENTO); y -= 14; };

  // Encabezado
  const lb = await logo();
  if (lb) { try { const img = await doc.embedPng(lb); const h = 46, w = img.width * (h / img.height); page.drawImage(img, { x: M, y: y - h + 4, width: Math.min(w, 150), height: h }); } catch { /* sin logo */ } }
  der(p.tipo === "pre_estimacion" ? "PRE-ESTIMACIÓN DE VALOR" : "INFORME DE TASACIÓN", M + W, y - 12, 13, neg);
  der(`Folio ${p.folio}${p.version > 1 ? ` · versión ${p.version}` : ""}`, M + W, y - 27, 9, reg, GRIS);
  der(`Emitido el ${fechaLarga(p.emitido_en)}`, M + W, y - 39, 9, reg, GRIS);
  der(`Vigente hasta el ${fechaLarga(p.vigencia_hasta)}`, M + W, y - 51, 9, reg, GRIS);
  y -= 66;
  page.drawRectangle({ x: M, y, width: W, height: 2, color: ACENTO });
  y -= 24;

  // Vehículo
  txt("VEHÍCULO", M, y, 7.5, neg, GRIS); y -= 16;
  for (const l of partir(auto, neg, 14, W)) { txt(l, M, y, 14, neg); y -= 17; }
  const ficha = [v.km != null ? `${miles(v.km)} km` : null, v.transmision, v.combustible, v.traccion, v.color, v.duenos, v.patente].filter(Boolean).join(" · ");
  if (ficha) { txt(ficha, M, y, 9.5, reg, GRIS); y -= 16; }
  y -= 8;

  // Valores
  const caja = (x: number, w: number, etiqueta: string, valor: string, grande = false) => {
    page.drawRectangle({ x, y: y - 52, width: w, height: 52, color: grande ? ACENTO : FONDO });
    txt(etiqueta, x + 10, y - 16, 8, neg, grande ? rgb(1, 1, 1) : GRIS);
    // El valor se achica hasta caber en la caja (los rangos son largos)
    let tam = grande ? 17 : 13;
    while (tam > 8 && neg.widthOfTextAtSize(limpiar(valor), tam) > w - 20) tam -= 0.5;
    txt(valor, x + 10, y - 38, tam, neg, grande ? rgb(1, 1, 1) : NEGRO);
  };
  const g = 8, cw = (W - 2 * g) / 3;
  caja(M, cw, "PRECIO SUGERIDO DE PUBLICACIÓN", clp(val.precio_publicacion), true);
  caja(M + cw + g, cw, "RANGO ESPERADO DE CIERRE", val.cierre?.[0] ? `${clp(val.cierre[0])} – ${clp(val.cierre[1])}` : "—");
  caja(M + 2 * (cw + g), cw, "OFERTA COMPARABLE HOY", val.rango_oferta?.[0] ? `${clp(val.rango_oferta[0])} – ${clp(val.rango_oferta[1])}` : "—");
  y -= 66;
  if (val.comercialidad) { txt(`Comercialidad: ${val.comercialidad} de 5${val.comercialidad_txt ? " · " + val.comercialidad_txt : ""}`, M, y, 9, reg, GRIS); y -= 14; }

  if (tx.resumen) { titulo("Mercado hoy"); parrafo(tx.resumen); }
  if (tx.analisis) { titulo("Cómo llegamos al valor"); parrafo(tx.analisis, 9); }

  // Comparables
  const comps: any[] = Array.isArray(p.comparables) ? p.comparables : [];
  if (comps.length) {
    titulo(`Avisos comparables vigentes (${comps.length})`);
    asegurar(24);
    page.drawRectangle({ x: M, y: y - 18, width: W, height: 20, color: NEGRO });
    const blanco = rgb(1, 1, 1);
    txt("AVISO", M + 8, y - 12, 7.5, neg, blanco); der("AÑO", M + W * 0.62, y - 12, 7.5, neg, blanco);
    der("KM", M + W * 0.77, y - 12, 7.5, neg, blanco); der("PRECIO", M + W - 8, y - 12, 7.5, neg, blanco);
    y -= 20;
    for (const [i, c] of comps.entries()) {
      const det = [c.portal, c.ubicacion, c.diferencias].filter(Boolean).join(" · ");
      const lineasDet = partir(det, reg, 7.5, W * 0.52);
      const alto = 18 + lineasDet.length * 9.5;
      asegurar(alto);
      if (i % 2 === 1) page.drawRectangle({ x: M, y: y - alto, width: W, height: alto, color: FONDO });
      txt(partir(c.titulo ?? `${v.marca} ${v.modelo}`, neg, 9, W * 0.52)[0] ?? "", M + 8, y - 12, 9, neg);
      lineasDet.forEach((l, k) => txt(l, M + 8, y - 22 - k * 9.5, 7.5, reg, GRIS));
      der(String(c.anio ?? "—"), M + W * 0.62, y - 12, 9);
      der(c.km != null ? miles(c.km) : "—", M + W * 0.77, y - 12, 9);
      der(clp(c.precio) + (c.financiamiento ? "*" : ""), M + W - 8, y - 12, 9, neg);
      y -= alto;
      page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: LINEA });
    }
    y -= 14;
    if (comps.some((c) => c.financiamiento)) { asegurar(12); txt("* Precio publicado con financiamiento.", M, y, 7.5, reg, GRIS); y -= 12; }
    asegurar(12);
    txt(`Fuentes: ${cons.fuentes ?? "portales de avisos"} · cobertura: ${cons.cobertura ?? "Región Metropolitana"} · consulta del ${fechaLarga(cons.en)}.`, M, y, 7.5, reg, GRIS);
    y -= 14;
  }

  titulo("Consideraciones");
  const cons2 = [
    tx.criterios ?? "La recomendación considera año, versión, kilometraje declarado y avisos comparables vigentes. El valor final depende del estado estético, mecánico y documental del vehículo y de la demanda al momento de comercializarlo.",
    p.tipo === "pre_estimacion" ? "Es una pre-estimación: se confirma con la inspección del vehículo en nuestra oficina." : "El valor se confirma con la inspección del vehículo en nuestra oficina.",
    "Siguiente paso: visita de unas 2 horas en Av. Puerta Oriente 361, oficina 409B, Chicureo, para la inspección completa y las fotos profesionales de la publicación.",
  ];
  for (const c of cons2) parrafo("• " + c, 8.5);

  // Pie en todas las páginas
  for (const pg of doc.getPages()) {
    pg.drawLine({ start: { x: M, y: 52 }, end: { x: M + W, y: 52 }, thickness: 0.6, color: LINEA });
    pg.drawText(limpiar("Nor-Oriente Motors · Consignación de autos · +56 9 8670 4745 · nororientemotors.carclass.cl"), { x: M, y: 38, size: 8, font: reg, color: GRIS });
  }
  return await doc.save();
}

export async function subirInforme(nombre: string, bytes: Uint8Array): Promise<string> {
  const base = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ruta = `tasaciones/${crypto.randomUUID().replace(/-/g, "")}/${nombre}`;
  const r = await fetch(`${base}/storage/v1/object/documentos/${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: new Blob([bytes as BlobPart], { type: "application/pdf" }),
  });
  if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/documentos/${ruta}`;
}

export const nombreInforme = (p: any) =>
  `Tasacion-${[p.vehiculo?.marca, p.vehiculo?.modelo, p.vehiculo?.anio].filter(Boolean).join("-").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || p.folio}.pdf`;
