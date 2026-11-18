/* NOM · Informe de tasación para el CLIENTE (v1, 18-nov-2026)
 * Réplica de la jerarquía del PDF «NOM_Tasacion_Volkswagen_Nivus_Comfortline_2022_Cliente»: dos páginas A4,
 * banda negra con logo, sobretítulo champagne, título serif, fichas en grilla, tarjetas grises, enlaces verdes.
 *
 * Recibe SOLO el payload de lista blanca que entrega la base (nom.payload_cliente / public.tasacion_publica).
 * No conoce ni recibe datos internos de NOM: no hay nada que ocultar con CSS.
 * Se usa en la app (vista previa y link público) y en las pruebas con Node + Chromium (scripts/).
 */
(function (root) {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clp = (n) => (n == null || n === "" ? "—" : "$" + Math.round(Number(n)).toLocaleString("es-CL"));
  const mm = (n) => (n == null ? "—" : "$" + (Math.round(Number(n) / 1e5) / 10).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "M");
  const km = (n) => (n == null || n === "" ? null : Number(n).toLocaleString("es-CL") + " km");
  const TZ = "America/Santiago";
  const fechaLarga = (s) => (s ? new Date(s).toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: TZ }) : "—");
  const fechaHora = (s) => (s ? new Date(s).toLocaleString("es-CL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) + " h" : "—");
  const join = (...xs) => xs.filter((x) => x != null && String(x).trim() !== "").map(esc).join(" &nbsp;·&nbsp; ");
  const rango = (a, b, f) => (a == null && b == null ? "—" : a === b || b == null ? f(a) : `${f(a)} - ${f(b)}`);
  const PORTAL = { chileautos: "Chileautos", mercadolibre: "Mercado Libre", yapo: "Yapo", automotora: "sitio de la automotora" };
  const portalTxt = (p) => PORTAL[String(p || "").toLowerCase()] || p || "el portal";
  const NIVEL = { 5: "MUY ALTA COMERCIALIDAD", 4: "BUENA COMERCIALIDAD", 3: "COMERCIALIDAD MEDIA", 2: "COMERCIALIDAD ACOTADA", 1: "BAJA COMERCIALIDAD" };

  const FONTS = (base = "") => [400, 700, 900].map((w) => `@font-face{font-family:Lato;font-style:normal;font-weight:${w};font-display:swap;src:url(${base}fonts/lato-latin-${w}-normal.woff2) format("woff2")}`).join("");
  const CSS = `
  .nomr{--k:#101111;--ink:#1a1b1b;--mut:#6b6e6d;--line:#e3e4e2;--card:#f6f7f6;--gold:#b49c5e;--green:#154a3a;
    font-family:Lato,"Helvetica Neue",Arial,sans-serif;color:var(--ink);font-size:10pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .nomr *{box-sizing:border-box}
  .nomr-pg{width:210mm;height:297mm;background:#fff;position:relative;overflow:hidden;margin:0 auto 18px;box-shadow:0 4px 24px rgba(0,0,0,.12);display:flex;flex-direction:column}
  .nomr-band{background:var(--k);height:25mm;flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 11mm 0 11.5mm}
  .nomr-band img{height:15mm;width:auto;display:block}
  .nomr-band .lg-ph{color:#fff;border:1px dashed #555;padding:3mm 5mm;font-size:8pt;letter-spacing:.12em}
  .nomr-folio{text-align:right;color:#fff;font-size:8.2pt;letter-spacing:.04em;line-height:1.7}
  .nomr-folio small{display:block;color:#9a9c9b;font-size:7.6pt;letter-spacing:.06em}
  .nomr-body{flex:1;padding:9.5mm 11.5mm 0;display:flex;flex-direction:column}
  .nomr-over{color:var(--gold);font-weight:700;font-size:8pt;letter-spacing:.06em;text-transform:uppercase;margin:0 0 3.5mm}
  .nomr-t1{font-family:"Times New Roman","Liberation Serif",Georgia,serif;font-weight:400;font-size:25.5pt;line-height:1.08;margin:0}
  .nomr-t2{font-family:"Times New Roman","Liberation Serif",Georgia,serif;font-size:15.5pt;font-weight:400;line-height:1.2;margin:.6mm 0 1.8mm}
  .nomr-sub{color:var(--mut);font-size:8.2pt;margin:0}
  .nomr-h{font-weight:700;font-size:8.4pt;letter-spacing:.03em;text-transform:uppercase;margin:6mm 0 0;padding-bottom:2.2mm;border-bottom:1px solid var(--line)}
  .nomr-ficha{display:grid;grid-template-columns:1fr 1fr;column-gap:12mm}
  .nomr-ficha div{padding:3.6mm 0 2.6mm;border-bottom:1px solid var(--line)}
  .nomr-ficha span{display:block;color:var(--mut);font-size:7.2pt;letter-spacing:.04em;text-transform:uppercase;margin-bottom:1mm}
  .nomr-ficha b{font-size:10pt}
  .nomr-eval{border:1.2px solid var(--k);border-radius:2.4mm;padding:4mm 5mm;margin-top:6mm}
  .nomr-eval .k{color:var(--gold);font-size:7.6pt;letter-spacing:.04em;text-transform:uppercase}
  .nomr-eval .v{font-family:"Times New Roman","Liberation Serif",Georgia,serif;font-weight:700;font-size:16pt;letter-spacing:.01em;margin:.8mm 0 1.4mm}
  .nomr-eval p{margin:0;color:var(--mut);font-size:8pt}
  .nomr-grid{display:grid;grid-template-columns:1fr 1fr;gap:3.2mm;margin-top:4mm}
  .nomr-card{background:var(--card);border:1px solid var(--line);border-radius:2mm;padding:4mm 4.5mm 5mm}
  .nomr-card span{display:block;color:var(--mut);font-size:7.2pt;letter-spacing:.04em;text-transform:uppercase;margin-bottom:3mm}
  .nomr-card b{font-size:18.5pt;font-weight:700;letter-spacing:-.01em}
  .nomr-p{margin:2.6mm 0 0;font-size:9pt}
  .nomr-note{color:var(--mut);font-size:7.6pt;margin:5mm 0 0}
  .nomr-foot{flex:none;margin:auto 11.5mm 0;padding:3.2mm 0 6.5mm;border-top:1px solid var(--line);display:flex;justify-content:space-between;font-size:7pt;color:#4b4e4d;letter-spacing:.04em;text-transform:uppercase}
  .nomr-foot b{font-weight:700;color:var(--ink)}
  .nomr-comps{display:grid;gap:3mm;margin-top:3.5mm}
  .nomr-comp{border:1px solid var(--line);border-radius:2mm;padding:4.2mm 4.5mm 4mm;display:grid;grid-template-columns:9mm 1fr auto;column-gap:2mm;break-inside:avoid}
  .nomr-comp .n{color:var(--gold);font-size:9.6pt;padding-top:.3mm}
  .nomr-comp .t{font-weight:700;font-size:11pt}
  .nomr-comp .p{font-weight:700;font-size:12pt;text-align:right;white-space:nowrap}
  .nomr-comp .d{color:var(--mut);font-size:7.8pt;margin-top:1.2mm}
  .nomr-comp .d2{color:var(--mut);font-size:7.8pt;margin-top:.8mm}
  .nomr-comp a{display:inline-block;margin-top:2.6mm;color:var(--green);font-weight:700;font-size:7.6pt;letter-spacing:.03em;text-decoration:none;border-bottom:1px solid var(--green);padding-bottom:.4mm}
  .nomr-comp .tag{display:inline-block;margin-left:2mm;font-size:6.8pt;color:#8a6d1f;border:1px solid #d8c79a;border-radius:1mm;padding:0 1.2mm;font-weight:700;letter-spacing:.03em;vertical-align:1px}
  .nomr-fin{background:var(--card);border:1px solid var(--line);border-radius:2mm;padding:4.5mm 5mm;margin-top:5mm;display:grid;grid-template-columns:1fr 1fr;gap:4mm}
  .nomr-fin span{display:block;font-size:7.2pt;letter-spacing:.04em;text-transform:uppercase;margin-bottom:3mm}
  .nomr-fin .g{color:var(--gold)} .nomr-fin .gr{color:var(--green)}
  .nomr-fin b{font-size:18.5pt} .nomr-fin b.sm{font-size:10.8pt;color:var(--green)}
  .nomr-pre{margin-top:4mm;border:1px solid #d8c79a;background:#fbf7ec;color:#6d5413;border-radius:2mm;padding:2.6mm 4mm;font-size:8pt}
  .nomr-pre b{letter-spacing:.04em}
  .nomr-compact .nomr-comps{gap:2mm;margin-top:2.6mm}
  .nomr-compact .nomr-comp{padding:2.6mm 4.5mm 2.4mm}
  .nomr-compact .nomr-comp a{margin-top:1.6mm;font-size:7pt}
  .nomr-compact .nomr-comp .p{display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between}
  .nomr-compact .nomr-t1{font-size:22pt}
  .nomr-compact .nomr-comp .d2{margin-top:.4mm}
  .nomr-compact .nomr-fin{margin-top:3.5mm;padding:3.6mm 5mm}
  .nomr-compact .nomr-h{margin-top:4.5mm}
  .nomr-compact .nomr-note{margin-top:3mm}
  .nomr-wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
  .nomr-wm span{transform:rotate(-30deg);font-size:46pt;font-weight:900;color:rgba(160,30,30,.10);letter-spacing:.08em;white-space:nowrap}
  @media screen and (max-width:820px){.nomr-pg{zoom:.46}}
  @page nomr{size:A4;margin:0}
  @media print{.nomr-pg{page:nomr;margin:0;box-shadow:none;page-break-after:always;break-after:page}.nomr-pg:last-child{page-break-after:auto;break-after:auto}}
  `;

  function html(d, opts = {}) {
    if (!d) return "";
    const v = d.vehiculo || {}, val = d.valores || {}, tx = d.textos || {}, cq = d.consulta || {};
    const logo = opts.logo ? `<img src="${esc(opts.logo)}" alt="NOM · Nor-Oriente Motors">` : `<span class="lg-ph">LOGO NOM</span>`;
    const pre = d.tipo === "pre_estimacion";
    const vtag = d.version > 1 ? ` · v${d.version}` : "";
    const band = (n) => `<header class="nomr-band">${logo}<div class="nomr-folio">${esc(d.folio)}${vtag}<small>INFORME PARA CLIENTE | 0${n}</small></div></header>`;
    const foot = (n) => `<footer class="nomr-foot"><span><b>NOM</b> | NOR-ORIENTE MOTORS &nbsp;·&nbsp; ${pre ? "PRE-ESTIMACIÓN COMERCIAL REFERENCIAL" : "TASACIÓN COMERCIAL REFERENCIAL"}</span><span>PÁGINA ${n} / 2</span></footer>`;
    const wm = opts.borrador ? `<div class="nomr-wm"><span>BORRADOR · NO ENVIAR</span></div>` : "";
    const titulo = [v.marca, v.modelo, v.version ? String(v.version).replace(/\b\d\.\d\s*[a-z]*\b/i, "").replace(/\b4x[24]\b|\b\d+p\b/gi, "").replace(/\s+/g, " ").trim() : null, v.anio].filter(Boolean).join(" ");
    const ficha = [
      ["Marca / modelo", join(v.marca, v.modelo)],
      ["Versión", esc(v.version || "Por confirmar")],
      ["Año / combustible", join(v.anio, v.combustible)],
      ["Transmisión / kilometraje", join(v.transmision, km(v.km))],
      ["Propietarios / llaves", join(v.duenos, v.llaves) || "Por informar"],
      [v.patente ? "Color / patente" : "Color / tracción", v.patente ? join(v.color, v.patente) : join(v.color, v.traccion)],
    ];
    const nivel = val.comercialidad ? (val.comercialidad_txt || NIVEL[val.comercialidad] || "COMERCIALIDAD") + " · " + val.comercialidad + "/5" : null;
    const comps = d.comparables || [], compacto = comps.length > 3;
    const preBox = pre ? `<div class="nomr-pre"><b>PRE-ESTIMACIÓN SUJETA A ESTUDIO.</b> La muestra de avisos comparables o la identificación de la versión todavía no permiten una tasación plenamente respaldada; los valores son orientativos y se confirmarán con más antecedentes o con la revisión del vehículo.</div>` : "";

    const p1 = `<section class="nomr-pg">${band(1)}${wm}<div class="nomr-body">
      <p class="nomr-over">Nor-Oriente Motors · ${pre ? "Pre-estimación de valor" : "Informe de tasación"}</p>
      <h1 class="nomr-t1">${pre ? "Pre-estimación de mercado" : "Tasación de mercado"}</h1>
      <h2 class="nomr-t2">${esc(titulo)}</h2>
      <p class="nomr-sub">Valor comercial orientativo &nbsp;·&nbsp; ${esc(d.ciudad || "Santiago")} &nbsp;·&nbsp; ${esc(fechaLarga(d.emitido_en))}</p>
      <h3 class="nomr-h">Antecedentes del vehículo</h3>
      <div class="nomr-ficha">${ficha.map(([k, x]) => `<div><span>${esc(k)}</span><b>${x || "—"}</b></div>`).join("")}</div>
      ${nivel || tx.resumen ? `<div class="nomr-eval"><div class="k">Evaluación comercial</div>${nivel ? `<div class="v">${esc(nivel)}</div>` : ""}${tx.resumen ? `<p>${esc(tx.resumen)}</p>` : ""}</div>` : ""}
      ${preBox}
      <h3 class="nomr-h">Valorización y precio de publicación</h3>
      <div class="nomr-grid">
        <div class="nomr-card"><span>Rango de oferta comparable</span><b>${rango(val.rango_oferta?.[0], val.rango_oferta?.[1], mm)}</b></div>
        <div class="nomr-card"><span>Publicación sugerida</span><b>${clp(val.precio_publicacion)}</b></div>
        <div class="nomr-card"><span>Venta esperada estimada</span><b>${rango(val.cierre?.[0], val.cierre?.[1], mm)}</b></div>
        <div class="nomr-card"><span>${val.comercialidad ? "Comercialidad" : "Valor comercial estimado"}</span><b>${val.comercialidad ? val.comercialidad + " / 5" : clp(val.valor_comercial)}</b></div>
      </div>
      <h3 class="nomr-h">Criterios de tasación</h3>
      <p class="nomr-p">${esc(tx.criterios || `La recomendación considera año, versión ${v.version || ""}, kilometraje declarado, referencias comparables publicadas y atributos informados. El valor final depende del estado estético, mecánico, documental y de la demanda al momento de comercializar.`)}</p>
      <p class="nomr-note">Tasación orientativa basada en avisos disponibles a la fecha; no equivale a inspección técnica ni garantiza el precio o plazo de venta.</p>
    </div>${foot(1)}</section>`;

    const fuentes = cq.fuentes ? String(cq.fuentes).split(/,\s*/).map(portalTxt).join(", ") : "portales de avisos";
    const p2 = `<section class="nomr-pg${compacto ? " nomr-compact" : ""}">${band(2)}${wm}<div class="nomr-body">
      <p class="nomr-over">Nor-Oriente Motors · Respaldo de mercado</p>
      <h1 class="nomr-t1">Comparables de mercado</h1>
      <p class="nomr-sub" style="font-size:9.6pt;color:var(--ink);margin-top:1.5mm">${esc([v.marca, v.modelo, v.version].filter(Boolean).join(" "))} &nbsp;·&nbsp; avisos de ${esc(cq.cobertura || "la Región Metropolitana")}</p>
      <p class="nomr-sub" style="margin-top:1.2mm">Fecha de consulta: ${esc(fechaHora(cq.en))} &nbsp;·&nbsp; Fuente: ${esc(fuentes)}</p>
      <h3 class="nomr-h">Avisos de referencia y enlaces</h3>
      <div class="nomr-comps">${comps.length ? comps.map((c, i) => { const link = `<a href="${esc(c.url)}" target="_blank" rel="noopener">VER AVISO EN ${esc(portalTxt(c.portal).toUpperCase())}</a>`;
        return `<article class="nomr-comp"><div class="n">${String(i + 1).padStart(2, "0")}</div>
        <div><div class="t">${esc(c.titulo || [v.modelo, c.version, c.anio].filter(Boolean).join(" "))}${c.financiamiento ? `<span class="tag">PRECIO CON FINANCIAMIENTO</span>` : ""}</div>
          <div class="d">${join(km(c.km), c.ubicacion)}</div>${c.diferencias ? `<div class="d2">${esc(c.diferencias)}</div>` : ""}${compacto ? "" : link}</div>
        <div class="p">${clp(c.precio)}${compacto ? `<div>${link}</div>` : ""}</div></article>`; }).join("") : `<p class="nomr-p">Sin avisos comparables seleccionados.</p>`}</div>
      <h3 class="nomr-h">Análisis de las referencias</h3>
      <p class="nomr-p">${esc(tx.analisis || "Los valores de los avisos muestran el rango de oferta de vehículos cercanos en versión y equipamiento, con diferencias de año y kilometraje. Son precios publicados, no operaciones de venta confirmadas, y algunos pueden depender de financiamiento.")}</p>
      <div class="nomr-fin"><div><span class="g">Precio sugerido de publicación</span><b>${clp(val.precio_publicacion)}</b></div>
        <div><span>Venta esperada estimada</span><b class="sm">${rango(val.cierre?.[0], val.cierre?.[1], clp)}</b></div></div>
      <p class="nomr-note">Alcance: ${esc(tx.alcance || "los antecedentes de propietarios, kilometraje y llaves fueron informados por el propietario, no verificados en inspección NOM. Los valores suponen una unidad sin daños estructurales, limitaciones de dominio ni reparaciones importantes pendientes.")}</p>
      <p class="nomr-note" style="margin-top:2.5mm">Los avisos y precios pueden modificarse o dejar de estar disponibles con posterioridad a la fecha de consulta.${d.vigencia_hasta ? ` Referencia vigente hasta el ${esc(fechaLarga(d.vigencia_hasta + "T12:00:00"))}.` : ""}</p>
    </div>${foot(2)}</section>`;

    return `<div class="nomr">${p1}${p2}</div>`;
  }

  function documento(d, opts = {}) {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(d?.folio || "Informe NOM")}</title>
      <style>${FONTS(opts.base || "")}body{margin:0;background:#e9eae8}${CSS}</style></head>
      <body>${html(d, opts)}</body></html>`;
  }

  const api = { CSS, FONTS, html, documento };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NOMInforme = api;
})(typeof window !== "undefined" ? window : globalThis);
