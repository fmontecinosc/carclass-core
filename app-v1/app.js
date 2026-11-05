/* Carclass Core · app web
   Lee y escribe solo por funciones app_* de Supabase; la seguridad por rol vive en la base. */
(() => {
"use strict";

const SB_URL = "https://tvjpwwwnpchecolcsnxp.supabase.co";
const SB_KEY = "sb_publishable_-yYDQIhqaqqmI3VGe2Y7Ng_6a7VP_zr";
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const UNIDADES = {
  blackgps: { n: "BlackGPS", c: "var(--u-blackgps)" },
  somosb2b: { n: "somosB2B", c: "var(--u-somosb2b)" },
  carclass: { n: "Carclass", c: "var(--u-carclass)" },
  carwash:  { n: "Carwash.hf", c: "var(--u-carwash)" },
  nom:      { n: "NOM", c: "var(--u-nom)" },
  grupo:    { n: "Holding", c: "var(--u-grupo)" },
};
const ETAPA_TXT = {
  analizada: "Analizada", factible: "Factible", contactable: "Contactable", en_prospeccion: "En prospección",
  reunion_por_agendar: "Reunión por agendar", en_asisma: "En Asisma", nuevo: "Nuevo", contactado: "Contactado",
  cotizado: "Cotizado", agendado: "Agendado", en_servicio: "En servicio", postventa: "Postventa",
};
const RESULTADOS = [
  ["no_contesta", "No contesta"], ["interesado", "Interesado"], ["reunion_agendada", "Reunión agendada"],
  ["enviar_info", "Pide información"], ["no_interesado", "No interesado"],
];

let ME = null;

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clp = (n) => n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString("es-CL");
const clpM = (n) => n == null ? "—" : Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " MM" : clp(n);
const int = (n) => n == null ? "—" : Number(n).toLocaleString("es-CL");
const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const masDias = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return new Date(x - x.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const fecha = (s) => s ? new Date(s.length <= 10 ? s + "T12:00:00" : s).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: new Date(s).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }) : "—";
const hace = (s) => {
  if (!s) return "sin gestión";
  const d = Math.floor((Date.now() - new Date(s)) / 864e5);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : d < 30 ? `hace ${d} días` : d < 365 ? `hace ${Math.floor(d / 30)} meses` : `hace ${Math.floor(d / 365)} años`;
};
const etapaTxt = (e) => ETAPA_TXT[e] || (e ? e.charAt(0).toUpperCase() + e.slice(1) : "—");
const unidadPill = (u) => `<span class="pill u" style="--c:${UNIDADES[u]?.c || "var(--muted)"}">${esc(UNIDADES[u]?.n || u)}</span>`;
const initials = (s) => (s || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");

const I = {
  home: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  queue: '<path d="M4 6h16M4 12h10M4 18h7"/><circle cx="18" cy="17" r="3"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alert: '<path d="M12 3 2 21h20zM12 10v5M12 18v.01"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  meet: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.8 0 5 2.2 5 5"/>',
  note: '<path d="M5 3h10l4 4v14H5zM14 3v5h5"/>',
};
const ico = (k, s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || I.dot}</svg>`;
const tipoIco = { llamada: "call", correo: "mail", whatsapp: "chat", reunion: "meet", visita: "meet", nota: "note", sistema: "dot" };

function toast(msg, bad = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 3200);
}
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    if (/JWT|session|not authenticated/i.test(error.message)) { await sb.auth.signOut(); location.hash = ""; render(); }
    throw new Error(error.message.replace(/^.*?:\s*/, ""));
  }
  return data;
}

/* ---------- login ---------- */
function viewLogin() {
  $("#app").innerHTML = `
  <div class="login">
    <section class="login-art">
      <div class="brand">${logo(30)}<div><b>Carclass Core</b><small>Carclass Group</small></div></div>
      <div>
        <h1>Tres unidades. Un mismo respaldo.</h1>
        <p>Clientes, pipeline, operación y resultados del holding en un solo lugar, conectado a tus agentes.</p>
      </div>
      <div class="units">${["blackgps","carclass","nom","somosb2b","carwash"].map(u=>`<span style="--c:${UNIDADES[u].c}">${UNIDADES[u].n}</span>`).join("")}</div>
    </section>
    <section class="login-form">
      <form id="f-login" autocomplete="on">
        <h2>Ingresar</h2>
        <div class="field"><label for="l-email">Correo</label><input class="input" id="l-email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="l-pass">Contraseña</label><input class="input" id="l-pass" type="password" autocomplete="current-password" required></div>
        <div class="err" id="l-err"></div>
        <button class="btn primary" type="submit" id="l-btn">Ingresar</button>
        <button class="btn ghost sm" type="button" id="l-reset">Olvidé mi contraseña</button>
      </form>
    </section>
  </div>`;
  $("#f-login").onsubmit = async (e) => {
    e.preventDefault();
    const btn = $("#l-btn"); btn.disabled = true; btn.textContent = "Verificando…"; $("#l-err").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email: $("#l-email").value.trim(), password: $("#l-pass").value });
    if (error) { $("#l-err").textContent = "Correo o contraseña incorrectos."; btn.disabled = false; btn.textContent = "Ingresar"; return; }
    render();
  };
  $("#l-reset").onclick = async () => {
    const email = $("#l-email").value.trim();
    if (!email) { $("#l-err").textContent = "Escribe tu correo y vuelve a pulsar."; return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    $("#l-err").textContent = "Si el correo existe, te llegó un enlace para crear una nueva contraseña.";
  };
}
const logo = (s = 26) => `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1e1c1a" stroke="#3a3631"/><path d="M10 22V10h6.5a4.5 4.5 0 0 1 0 9H13" stroke="#c9a45c" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;

/* ---------- shell ---------- */
const NAV = [
  ["Análisis", [["inicio", "Inicio", "home"]]],
  ["Comercial", [["cola", "Cola del día", "queue"], ["pipeline", "Pipeline", "kanban"], ["empresas", "Empresas", "building"]]],
  ["Operación", [["tareas", "Tareas", "tasks"]]],
  ["Finanzas", [["finanzas", "Resultados", "chart"]]],
];
function shell() {
  const nav = NAV.filter(([g]) => g !== "Finanzas" || ME.ve_finanzas).map(([g, items]) =>
    `<h6>${g}</h6>` + items.map(([r, t, i]) => `<a href="#/${r}" data-r="${r}">${ico(i)}<span>${t}</span>${r === "cola" ? '<span class="badge" id="nav-cola"></span>' : ""}</a>`).join("")).join("");
  $("#app").innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <div class="brand">${logo()}<div><b>Carclass Core</b><small>Carclass Group</small></div></div>
      <nav class="nav">${nav}</nav>
      <div class="side-foot">
        <div class="avatar">${esc(initials(ME.nombre || ME.email))}</div>
        <div class="who"><b>${esc(ME.nombre || ME.email)}</b><span>${ME.rol === "dueno" ? "Dueño" : ME.rol === "operador" ? "Operador" : "Ejecutivo"}</span></div>
        <button class="btn ghost sm" id="logout" title="Salir" aria-label="Salir">${ico("out")}</button>
      </div>
    </aside>
    <div class="main">
      <header class="top">
        <button class="btn ghost sm menu-btn" id="menu" aria-label="Menú">${ico("menu")}</button>
        <div class="crumbs" id="crumbs"></div>
        <form class="search" id="f-search" role="search">${ico("search", 15)}<input id="q" type="search" placeholder="Buscar empresa, RUT o comuna" aria-label="Buscar empresa"></form>
        <button class="btn primary" id="nuevo">${ico("plus", 15)}<span>Nuevo análisis</span></button>
      </header>
      <main class="page" id="page"></main>
    </div>
  </div>`;
  $("#logout").onclick = async () => { await sb.auth.signOut(); location.hash = ""; render(); };
  $("#menu").onclick = () => $("#side").classList.toggle("open");
  $("#f-search").onsubmit = (e) => { e.preventDefault(); location.hash = "#/empresas?q=" + encodeURIComponent($("#q").value.trim()); };
  $("#nuevo").onclick = () => modalAnalisis();
}
function setActive(r, crumbs) {
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  $("#crumbs").innerHTML = crumbs;
  $("#side").classList.remove("open");
}
const loading = (n = 4) => `<div class="card card-b" style="display:grid;gap:12px">${Array(n).fill('<div class="skel"></div>').join("")}</div>`;
const fail = (e) => `<div class="card empty"><b>No se pudo cargar</b>${esc(e.message)}</div>`;

/* ---------- inicio ---------- */
async function viewInicio() {
  setActive("inicio", "<b>Inicio</b>");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><div class="eyebrow">${new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</div><h1>Buen día, ${esc((ME.nombre || "").split(" ")[0])}</h1></div></div>${loading(6)}`;
  try {
    const d = await rpc("app_dashboard");
    const pipe = d.pipeline || [];
    const totalAbiertas = pipe.reduce((a, x) => a + Number(x.n || 0), 0);
    const venc = d.cola?.vencidas || 0, hoy = d.cola?.hoy || 0, sinf = d.cola?.sin_fecha || 0;
    $("#nav-cola") && ($("#nav-cola").textContent = venc + hoy || "", $("#nav-cola").classList.toggle("bad", venc > 0));

    const alertas = [];
    if (d.ultima_venta) {
      for (const [u, f] of Object.entries(d.ultima_venta)) {
        const dias = Math.floor((Date.now() - new Date(f + "T12:00:00")) / 864e5);
        if (dias > 31) alertas.push(`<b>${esc(UNIDADES[u]?.n || u)}</b>: última venta registrada el ${fecha(f)} (${hace(f)}).`);
      }
    }
    if (d.mrr && !d.mrr.ultimo_cierre) alertas.push("<b>BlackGPS</b>: falta el cierre mensual de equipos en alta. El agente lo puede tomar desde la plataforma BlackGPS.");

    const meses = {}; (d.pnl || []).forEach((r) => { (meses[r.mes] ||= { v: 0, m: 0 }); meses[r.mes].v += Number(r.ventas); meses[r.mes].m += Number(r.margen); });

    P.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">${new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</div><h1>Buen día, ${esc((ME.nombre || "").split(" ")[0])}</h1>
      <p>${venc + hoy ? `Tienes <b>${venc + hoy}</b> gestiones para hoy${venc ? `, ${venc} vencidas` : ""}.` : "No hay gestiones vencidas. Revisa la cola para avanzar prospectos sin fecha."}</p></div>
      <div class="actions"><a class="btn primary" href="#/cola">${ico("queue", 15)} Abrir cola del día</a></div></div>
    ${alertas.length ? `<div class="alert">${ico("alert", 18)}<div><div style="font-weight:600;margin-bottom:4px">Datos que faltan para que los números sean reales</div>${alertas.map((a) => `<div>${a}</div>`).join("")}</div></div>` : ""}
    <div class="kpis">
      <a class="kpi" href="#/cola"><span class="l">Cola de hoy</span><span class="v ${venc ? "bad" : ""}">${int(venc + hoy)}</span><span class="s">${int(venc)} vencidas · ${int(sinf)} sin fecha</span></a>
      <a class="kpi" href="#/pipeline"><span class="l">Oportunidades abiertas</span><span class="v">${int(totalAbiertas)}</span><span class="s">${int(d.nuevas_7d)} nuevas en 7 días</span></a>
      <div class="kpi"><span class="l">Gestiones en 7 días</span><span class="v ${d.actividad_7d ? "" : "warn"}">${int(d.actividad_7d)}</span><span class="s">llamadas, correos y reuniones</span></div>
      <a class="kpi" href="#/tareas"><span class="l">Tareas pendientes</span><span class="v ${d.tareas?.vencidas ? "warn" : ""}">${int(d.tareas?.pendientes)}</span><span class="s">${int(d.tareas?.vencidas)} vencidas</span></a>
      ${d.mrr ? `<a class="kpi" href="#/finanzas"><span class="l">MRR BlackGPS</span><span class="v">${clpM(d.mrr.mrr)}</span><span class="s">${int(d.mrr.equipos_activos)} equipos · ${int(d.mrr.clientes_activos)} clientes</span></a>` : ""}
    </div>
    <div class="grid-main">
      <div style="display:grid;gap:20px">
        <section class="card"><div class="card-h"><h3>Pipeline por unidad</h3><a class="btn ghost sm more" href="#/pipeline">Ver pipeline</a></div>
          <div class="card-b bars">${pipe.length ? pipe.sort((a, b) => b.n - a.n).map((p) => {
            const max = Math.max(...pipe.map((x) => Number(x.n))); return `<a class="bar-row" href="#/pipeline/${p.unidad}" style="text-decoration:none">
              <span>${esc(UNIDADES[p.unidad]?.n || p.unidad)}</span><span class="bar-track"><i style="width:${(p.n / max) * 100}%;background:${UNIDADES[p.unidad]?.c}"></i></span>
              <span class="num" style="text-align:right">${int(p.n)}${p.vencidas ? ` <span class="faint">· ${p.vencidas} venc.</span>` : ""}</span></a>`; }).join("") : '<div class="empty"><b>Sin oportunidades abiertas</b></div>'}</div></section>
        ${Object.keys(meses).length ? `<section class="card"><div class="card-h"><h3>Ventas y margen por mes</h3><span class="faint" style="font-size:12px">con IVA, todas las unidades</span><a class="btn ghost sm more" href="#/finanzas">Ver resultados</a></div>
          <div class="card-b">${chartMeses(meses)}<div class="legend" style="margin-top:10px"><span style="--c:#4a4540">Ventas</span><span style="--c:var(--accent)">Margen</span></div></div></section>` : ""}
      </div>
      <section class="card"><div class="card-h"><h3>Última actividad</h3></div>
        <div class="feed">${(d.ultimas_actividades || []).length ? d.ultimas_actividades.map(feedItem).join("") : '<div class="empty"><b>Sin gestiones registradas</b>Cuando registres llamadas o el GPT analice empresas, aparecerán aquí.</div>'}</div></section>
    </div>`;
  } catch (e) { P.innerHTML = fail(e); }
}
const feedItem = (a) => `<div class="feed-i"><span class="ic">${ico(tipoIco[a.tipo] || "dot", 14)}</span>
  <div class="t">${a.empresa_id ? `<a href="#/empresa/${a.empresa_id}">${esc(a.empresa)}</a>` : esc(a.empresa || "")} <span class="muted">· ${esc(a.tipo === "sistema" ? a.nota : (a.resultado ? a.resultado.replace(/_/g, " ") : a.tipo))}</span>${a.tipo !== "sistema" && a.nota ? `<div class="faint" style="font-size:12.5px">${esc(a.nota)}</div>` : ""}</div>
  <span class="d">${hace(a.fecha)}</span></div>`;

function chartMeses(meses) {
  const keys = Object.keys(meses).sort().slice(-12);
  const W = 640, H = 200, pad = 28, bw = (W - pad * 2) / keys.length;
  const max = Math.max(...keys.map((k) => meses[k].v), 1);
  const y = (v) => H - 24 - (Math.max(v, 0) / max) * (H - 44);
  const tick = max >= 1e6 ? Math.ceil(max / 1e6 / 4) * 1e6 : Math.ceil(max / 4 / 1e5) * 1e5;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas y margen por mes">`;
  for (let t = tick; t <= max; t += tick) s += `<line x1="${pad}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" stroke="#2a2826"/><text x="${pad - 4}" y="${y(t) + 3}" fill="#6f6a61" font-size="9" text-anchor="end" font-family="IBM Plex Mono">${(t / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 })}M</text>`;
  keys.forEach((k, i) => {
    const x = pad + i * bw + bw * 0.18, w = bw * 0.64, m = meses[k];
    s += `<rect x="${x}" y="${y(m.v)}" width="${w}" height="${H - 24 - y(m.v)}" fill="#4a4540" rx="2"><title>${k}: ventas ${clp(m.v)}</title></rect>`;
    s += `<rect x="${x + w * 0.25}" y="${y(m.m)}" width="${w * 0.5}" height="${H - 24 - y(m.m)}" fill="#c9a45c" rx="2"><title>${k}: margen ${clp(m.m)}</title></rect>`;
    s += `<text x="${x + w / 2}" y="${H - 8}" fill="#a19b8f" font-size="10" text-anchor="middle" font-family="IBM Plex Mono">${new Date(k + "-15").toLocaleDateString("es-CL", { month: "short" })}</text>`;
  });
  return s + "</svg>";
}

/* ---------- cola del día ---------- */
async function viewCola(params) {
  const u = params.get("u") || "";
  setActive("cola", "Comercial / <b>Cola del día</b>");
  const P = $("#page");
  const unis = ME.unidades.filter((x) => x !== "grupo");
  P.innerHTML = `<div class="page-head"><div><h1>Cola del día</h1><p>Primero lo vencido, después lo de hoy y luego los prospectos sin fecha, ordenados por prioridad y tamaño de flota.</p></div></div>
    <div class="chips" id="cola-u"><button class="chip ${u ? "" : "on"}" data-u="">Todas</button>${unis.map((x) => `<button class="chip ${u === x ? "on" : ""}" data-u="${x}">${UNIDADES[x].n}</button>`).join("")}</div>
    <div id="cola">${loading(8)}</div>`;
  $$("#cola-u .chip").forEach((b) => b.onclick = () => (location.hash = "#/cola" + (b.dataset.u ? "?u=" + b.dataset.u : "")));
  try {
    const rows = await rpc("app_cola", { p_unidad: u || null, p_limite: 40 });
    $("#cola").innerHTML = rows.length ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>Etapa</th><th>Próxima acción</th><th>Contacto</th><th class="num">Flota</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-emp="${r.empresa_id}">
        <td><div class="name">${esc(r.empresa)}</div><div class="sub">${esc([r.rubro, r.comuna].filter(Boolean).join(" · "))}</div>${r.angulo ? `<div class="sub" style="max-width:52ch;margin-top:4px;color:var(--muted)">${esc(r.angulo.slice(0, 160))}${r.angulo.length > 160 ? "…" : ""}</div>` : ""}</td>
        <td>${unidadPill(r.unidad)}<div class="sub" style="margin-top:6px">${esc(etapaTxt(r.etapa))}</div></td>
        <td>${r.urgencia === "vencida" ? `<span class="pill bad">Vencida ${fecha(r.proxima_fecha)}</span>` : r.urgencia === "hoy" ? '<span class="pill warn">Hoy</span>' : '<span class="pill">Sin fecha</span>'}<div class="sub" style="margin-top:6px">${esc(r.proxima_accion || "Primer contacto")}</div></td>
        <td class="mono" style="font-size:12.5px">${r.telefono ? `<a href="tel:${esc(r.telefono)}" onclick="event.stopPropagation()">${esc(r.telefono)}</a>` : '<span class="faint">sin teléfono</span>'}${r.email ? `<div class="sub">${esc(r.email)}</div>` : ""}</td>
        <td class="num">${r.flota ? int(r.flota) : "—"}</td>
        <td><button class="btn sm" data-reg="${r.oportunidad_id}" data-nom="${esc(r.empresa)}" data-u="${r.unidad}">${ico("call", 14)} Registrar</button></td></tr>`).join("")}
      </tbody></table></div>` : `<div class="card empty"><b>Cola vacía</b>No hay gestiones pendientes para esta unidad.</div>`;
    $$("#cola [data-reg]").forEach((b) => b.onclick = (e) => { e.stopPropagation(); modalActividad(b.dataset.reg, b.dataset.nom, () => viewCola(params)); });
    $$("#cola tr[data-emp]").forEach((tr) => tr.onclick = () => (location.hash = "#/empresa/" + tr.dataset.emp));
  } catch (e) { $("#cola").innerHTML = fail(e); }
}

/* ---------- pipeline ---------- */
async function viewPipeline(params, unidadRuta) {
  const unis = ME.unidades.filter((x) => x !== "grupo");
  const u = unidadRuta || params.get("u") || (unis.includes("blackgps") ? "blackgps" : unis[0]);
  setActive("pipeline", `Comercial / <b>Pipeline</b>`);
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Pipeline</h1><p>Arrastra una tarjeta para cambiar su etapa. La próxima acción se mantiene; si no tenía, queda en dos días.</p></div></div>
    <div class="tabs" id="pipe-u">${unis.map((x) => `<button class="${x === u ? "on" : ""}" style="--c:${UNIDADES[x].c}" data-u="${x}">${UNIDADES[x].n}</button>`).join("")}</div>
    <div id="kb">${loading(5)}</div>`;
  $$("#pipe-u button").forEach((b) => b.onclick = () => (location.hash = "#/pipeline/" + b.dataset.u));
  try {
    const d = await rpc("app_pipeline", { p_unidad: u, p_por_columna: 40 });
    const cols = d.columnas || {};
    const etapas = (d.etapas || []).filter((e, i, a) => a.indexOf(e) === i);
    $("#kb").innerHTML = `<div class="kanban">${etapas.map((et) => {
      const c = cols[et] || { total: 0, items: [] };
      return `<section class="col" data-etapa="${esc(et)}"><div class="col-h"><b>${esc(etapaTxt(et))}</b><span class="badge">${int(c.total)}</span></div>
        <div class="col-b">${c.items.map((it) => `<article class="kcard" draggable="true" data-id="${it.id}" data-emp="${it.empresa_id}" data-fecha="${it.proxima_fecha || ""}">
          <b>${esc(it.empresa)}</b>
          <div class="meta">${it.flota ? `<span class="mono">${int(it.flota)} veh.</span>` : ""}${it.comuna ? `<span>${esc(it.comuna)}</span>` : ""}${it.prioridad ? `<span>prioridad ${esc(it.prioridad)}</span>` : ""}${it.monto ? `<span class="mono">${clpM(it.monto)}</span>` : ""}</div>
          <div class="next">${it.proxima_fecha ? (it.proxima_fecha < hoyISO() ? `<span class="pill bad">${fecha(it.proxima_fecha)}</span>` : `<span class="pill">${fecha(it.proxima_fecha)}</span>`) : ""}<span>${esc(it.proxima_accion || hace(it.ultima))}</span></div>
        </article>`).join("")}${c.total > c.items.length ? `<div class="col-more">y ${int(c.total - c.items.length)} más · <a href="#/empresas">ver en Empresas</a></div>` : ""}${!c.total ? '<div class="col-more">Sin oportunidades</div>' : ""}</div></section>`;
    }).join("")}</div>`;
    let dragId = null;
    $$(".kcard").forEach((k) => {
      k.ondragstart = (e) => { dragId = k.dataset.id; k.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; };
      k.ondragend = () => k.classList.remove("drag");
      k.onclick = () => (location.hash = "#/empresa/" + k.dataset.emp);
    });
    $$(".col").forEach((col) => {
      col.ondragover = (e) => { e.preventDefault(); col.classList.add("drop"); };
      col.ondragleave = () => col.classList.remove("drop");
      col.ondrop = async (e) => {
        e.preventDefault(); col.classList.remove("drop");
        const card = $(`.kcard[data-id="${dragId}"]`); if (!card || card.closest(".col") === col) return;
        const prev = card.parentElement; col.querySelector(".col-b").prepend(card);
        try {
          await rpc("app_mover_etapa", { p: { oportunidad_id: dragId, etapa: col.dataset.etapa, proxima_fecha: card.dataset.fecha || masDias(2) } });
          toast(`Movida a ${etapaTxt(col.dataset.etapa)}`);
        } catch (err) { prev.prepend(card); toast(err.message, true); }
      };
    });
  } catch (e) { $("#kb").innerHTML = fail(e); }
}

/* ---------- empresas ---------- */
async function viewEmpresas(params) {
  const q = params.get("q") || "", f = params.get("f") || "", pg = Number(params.get("p") || 0);
  setActive("empresas", "Comercial / <b>Empresas</b>");
  if ($("#q")) $("#q").value = q;
  const P = $("#page");
  const link = (o) => { const p = new URLSearchParams({ q, f, p: pg, ...o }); [...p.keys()].forEach((k) => !p.get(k) && p.delete(k)); return "#/empresas?" + p; };
  P.innerHTML = `<div class="page-head"><div><h1>Empresas</h1><p>Clientes, prospectos y personas de todas las unidades. Una sola ficha por RUT.</p></div></div>
    <div class="row" style="align-items:center">
      <form id="f-emp" style="flex:1 1 280px"><input class="input" id="emp-q" type="search" placeholder="Nombre, RUT, rubro o comuna" value="${esc(q)}" aria-label="Buscar"></form>
      <div class="chips">${[["", "Todas"], ["clientes", "Clientes"], ["prospectos", "Prospectos"], ["personas", "Personas"]].map(([k, t]) => `<a class="chip ${f === k ? "on" : ""}" href="${link({ f: k, p: 0 })}" style="text-decoration:none">${t}</a>`).join("")}</div>
    </div>
    <div id="emp">${loading(10)}</div>`;
  $("#f-emp").onsubmit = (e) => { e.preventDefault(); location.hash = link({ q: $("#emp-q").value.trim(), p: 0 }); };
  try {
    const d = await rpc("app_empresas", { p_q: q || null, p_filtro: f || null, p_pagina: pg });
    const pages = Math.ceil(d.total / 50);
    $("#emp").innerHTML = d.filas.length ? `<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Empresa</th><th>RUT</th><th>Rubro</th><th>Ubicación</th><th class="num">Flota</th><th>Unidades</th><th>Estado</th></tr></thead><tbody>
      ${d.filas.map((r) => `<tr class="click" data-id="${r.id}"><td><div class="name">${esc(r.nombre)}</div>${r.tipo === "persona" ? '<div class="sub">Persona</div>' : ""}</td>
        <td class="mono" style="font-size:12.5px">${esc(fmtRut(r.rut)) || '<span class="faint">—</span>'}</td><td>${esc(r.rubro || "—")}</td><td>${esc([r.comuna, r.region].filter(Boolean).join(", ") || "—")}</td>
        <td class="num">${r.flota ? int(r.flota) : "—"}</td><td>${(r.unidades || "").split(",").filter(Boolean).map(unidadPill).join(" ")}</td>
        <td>${r.cliente ? '<span class="pill ok">Cliente</span>' : r.etapa ? `<span class="pill">${esc(etapaTxt(r.etapa))}</span>` : '<span class="faint">—</span>'}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="pager"><span>${int(d.total)} empresas · página ${pg + 1} de ${Math.max(pages, 1)}</span>
        ${pg > 0 ? `<a class="btn sm" href="${link({ p: pg - 1 })}">Anterior</a>` : ""}${pg + 1 < pages ? `<a class="btn sm" href="${link({ p: pg + 1 })}">Siguiente</a>` : ""}</div></div>`
      : `<div class="card empty"><b>Sin resultados</b>Prueba con otro nombre o con el RUT sin puntos.</div>`;
    $$("#emp tr[data-id]").forEach((tr) => tr.onclick = () => (location.hash = "#/empresa/" + tr.dataset.id));
  } catch (e) { $("#emp").innerHTML = fail(e); }
}
const fmtRut = (r) => { if (!r) return ""; const b = r.slice(0, -1), dv = r.slice(-1); return b.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv; };

/* ---------- ficha 360 ---------- */
async function viewEmpresa(id) {
  setActive("empresas", `Comercial / <a href="#/empresas">Empresas</a> / <b>Ficha</b>`);
  const P = $("#page"); P.innerHTML = loading(8);
  try {
    const d = await rpc("app_empresa", { p_id: id });
    if (!d) { P.innerHTML = `<div class="card empty"><b>Empresa no encontrada</b></div>`; return; }
    const e = d.empresa;
    $("#crumbs").innerHTML = `Comercial / <a href="#/empresas">Empresas</a> / <b>${esc(e.nombre)}</b>`;
    const decisor = d.contactos.find((c) => c.decisor) || d.contactos[0];
    P.innerHTML = `
    <div class="ficha-head">
      <div class="eyebrow">${e.tipo === "persona" ? "Persona" : "Empresa"} · creada ${fecha(e.creado_en)} por ${esc(e.creado_por)}</div>
      <h1>${esc(e.nombre)}</h1>
      <div class="facts">${e.rut ? `<span>RUT <b class="mono">${esc(fmtRut(e.rut))}</b></span>` : ""}${e.rubro ? `<span>${esc(e.rubro)}</span>` : ""}${e.tamano_flota ? `<span><b class="mono">${int(e.tamano_flota)}</b> vehículos</span>` : ""}${e.comuna || e.region ? `<span>${esc([e.comuna, e.region].filter(Boolean).join(", "))}</span>` : ""}${e.telefono ? `<span><a class="mono" href="tel:${esc(e.telefono)}">${esc(e.telefono)}</a></span>` : ""}${e.email ? `<span>${esc(e.email)}</span>` : ""}${e.web ? `<span><a href="${esc(/^https?:/.test(e.web) ? e.web : "https://" + e.web)}" target="_blank" rel="noopener">${esc(e.web)}</a></span>` : ""}</div>
    </div>
    <div class="grid-main">
      <div style="display:grid;gap:20px">
        <section class="card"><div class="card-h"><h3>Oportunidades</h3><span class="badge">${d.oportunidades.length}</span></div>
          <div class="card-b" style="display:grid;gap:12px">${d.oportunidades.length ? d.oportunidades.map(oppCard).join("") : '<div class="empty"><b>Sin oportunidades</b>Usa «Nuevo análisis» para abrir una.</div>'}</div></section>
        <section class="card"><div class="card-h"><h3>Análisis</h3><span class="badge">${d.analisis.length}</span></div>
          <div class="card-b" style="display:grid;gap:16px">${d.analisis.length ? d.analisis.map((a) => `<div class="analisis"><div class="row" style="gap:8px;align-items:center">${unidadPill(a.unidad)}${a.pilar ? `<span class="pill acc">${esc(a.pilar)}</span>` : ""}${a.score != null ? `<span class="pill">calce ${a.score}</span>` : ""}<span class="faint" style="font-size:12px">${fecha(a.fecha)} · ${esc(a.fuente)}</span></div>${a.resumen ? `<div>${esc(a.resumen)}</div>` : ""}${a.dolores?.length ? `<div class="muted">Dolores: ${a.dolores.map(esc).join(" · ")}</div>` : ""}</div>`).join("") : '<div class="empty" style="padding:16px"><b>Sin análisis</b>Analiza esta empresa en tu GPT y aparecerá aquí.</div>'}</div></section>
        ${d.ventas ? `<section class="card"><div class="card-h"><h3>Ventas</h3><span class="badge">${d.ventas.length}</span></div>${d.ventas.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Unidad</th><th>Detalle</th><th class="num">Monto</th><th>Cobro</th></tr></thead><tbody>${d.ventas.map((v) => `<tr><td class="mono" style="font-size:12.5px">${fecha(v.fecha)}</td><td>${unidadPill(v.unidad)}</td><td>${esc(v.descripcion || "")}</td><td class="num">${clp(v.monto)}</td><td>${v.cobro === "cobrado" ? '<span class="pill ok">Cobrado</span>' : `<span class="pill warn">${esc(v.cobro)}</span>`}</td></tr>`).join("")}</tbody></table></div>` : '<div class="empty" style="padding:16px">Sin ventas registradas</div>'}</section>` : ""}
      </div>
      <div style="display:grid;gap:20px">
        <section class="card"><div class="card-h"><h3>Contacto</h3></div><div class="card-b">${d.contactos.length ? d.contactos.map((c) => `<dl class="kv" style="margin:0 0 12px"><dt>Nombre</dt><dd><b>${esc(c.nombre)}</b>${c.decisor ? ' <span class="pill acc">decide</span>' : ""}</dd>${c.cargo ? `<dt>Cargo</dt><dd>${esc(c.cargo)}</dd>` : ""}${c.telefono ? `<dt>Teléfono</dt><dd class="mono"><a href="tel:${esc(c.telefono)}">${esc(c.telefono)}</a></dd>` : ""}${c.email ? `<dt>Correo</dt><dd>${esc(c.email)}</dd>` : ""}</dl>`).join("") : '<div class="muted">Sin contacto identificado. Pídele al GPT que busque el decisor.</div>'}</div></section>
        ${d.contratos.length ? `<section class="card"><div class="card-h"><h3>Contrato BlackGPS</h3></div><div class="card-b">${d.contratos.map((g) => `<dl class="kv" style="margin:0"><dt>Estado</dt><dd><span class="pill ${g.estado === "activo" ? "ok" : "warn"}">${esc(g.estado)}</span></dd><dt>Equipos</dt><dd class="mono">${int(g.equipos)}</dd>${g.valor_mensual ? `<dt>Mensual</dt><dd class="mono">${clp(g.valor_mensual)}</dd>` : ""}${g.plan ? `<dt>Plan</dt><dd>${esc(g.plan)}</dd>` : ""}${g.inicio ? `<dt>Desde</dt><dd>${fecha(g.inicio)}</dd>` : ""}</dl>`).join("")}</div></section>` : ""}
        <section class="card"><div class="card-h"><h3>Historial</h3></div><div class="card-b timeline">${d.actividades.length ? d.actividades.map((a) => `<div class="tl ${a.tipo === "sistema" ? "sys" : ""}"><span class="dot"></span><div><div class="t">${a.tipo === "sistema" ? `<span class="muted">${esc(a.nota)}</span>` : `<b style="font-weight:600;text-transform:capitalize">${esc(a.tipo)}</b>${a.resultado ? ` · ${esc(a.resultado.replace(/_/g, " "))}` : ""}${a.nota ? `<div class="muted">${esc(a.nota)}</div>` : ""}`}</div><div class="d">${fecha(a.fecha)} · ${esc(a.autor)}</div></div></div>`).join("") : '<div class="muted">Sin gestiones todavía.</div>'}</div></section>
      </div>
    </div>`;
    $$("[data-act]").forEach((b) => b.onclick = () => modalActividad(b.dataset.act, e.nombre, () => viewEmpresa(id)));
    $$("[data-asisma]").forEach((b) => b.onclick = () => modalAsisma(b.dataset.asisma));
    $$("select[data-etapa]").forEach((s) => s.onchange = async () => {
      try { await rpc("app_mover_etapa", { p: { oportunidad_id: s.dataset.etapa, etapa: s.value, proxima_fecha: s.dataset.fecha || masDias(2) } }); toast("Etapa actualizada"); viewEmpresa(id); }
      catch (err) { toast(err.message, true); }
    });
  } catch (err) { P.innerHTML = fail(err); }
}
function oppCard(o) {
  const et = o.etapas || []; const idx = et.indexOf(o.etapa);
  const abierta = o.estado === "abierta";
  return `<div class="opp"><div class="opp-top">${unidadPill(o.unidad)}
    ${abierta ? `<select class="input" style="width:auto;padding:5px 10px" data-etapa="${o.id}" data-fecha="${o.proxima_fecha || ""}" aria-label="Etapa">${[...new Set([...et, o.etapa])].map((x) => `<option value="${esc(x)}" ${x === o.etapa ? "selected" : ""}>${esc(etapaTxt(x))}</option>`).join("")}</select>`
      : `<span class="pill ${o.estado === "ganada" ? "ok" : "bad"}">${esc(o.estado)}</span>`}
    ${o.asisma_id ? `<span class="pill acc">Asisma ${esc(o.asisma_id)}</span>` : ""}
    <span style="margin-left:auto;display:flex;gap:6px">${abierta ? `<button class="btn sm" data-act="${o.id}">${ico("call", 14)} Registrar gestión</button>` : ""}${abierta && ["blackgps", "somosb2b"].includes(o.unidad) ? `<button class="btn sm" data-asisma="${o.id}">Ficha Asisma</button>` : ""}</span></div>
    ${idx >= 0 ? `<div class="steps" style="--c:${UNIDADES[o.unidad]?.c}">${et.map((_, i) => `<i class="${i <= idx ? "done" : ""}"></i>`).join("")}</div>` : ""}
    <div class="muted" style="font-size:13px">${abierta ? `${o.proxima_fecha ? `<b style="color:${o.proxima_fecha < hoyISO() ? "var(--bad)" : "var(--fg)"}">${fecha(o.proxima_fecha)}</b> · ` : ""}${esc(o.proxima_accion || "Sin próxima acción definida")}` : esc(o.motivo || "")}</div></div>`;
}

/* ---------- tareas ---------- */
async function viewTareas() {
  setActive("tareas", "Operación / <b>Tareas</b>");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Tareas</h1><p>Lo que tienes que hacer tú o tu equipo, de todas las unidades. Los agentes también crean tareas aquí.</p></div>
    <div class="actions"><button class="btn primary" id="t-new">${ico("plus", 15)} Nueva tarea</button></div></div><div id="tl">${loading(5)}</div>`;
  $("#t-new").onclick = () => modalTarea(viewTareas);
  try {
    const ts = await rpc("app_tareas", { p_estado: "pendiente,en_curso" });
    const hoy = hoyISO();
    const grupos = [["Vencidas", ts.filter((t) => t.vence && t.vence < hoy)], ["Hoy", ts.filter((t) => t.vence === hoy)], ["Próximas", ts.filter((t) => t.vence && t.vence > hoy)], ["Sin fecha", ts.filter((t) => !t.vence)]].filter(([, l]) => l.length);
    $("#tl").innerHTML = grupos.length ? grupos.map(([g, l]) => `<section class="card" style="margin-bottom:16px"><div class="card-h"><h3>${g}</h3><span class="badge ${g === "Vencidas" ? "bad" : ""}">${l.length}</span></div>
      ${l.map((t) => `<div class="task" data-id="${t.id}"><button class="check" data-done="${t.id}" aria-label="Marcar hecha"></button>
        <div><div class="t" style="font-weight:500">${esc(t.titulo)}</div><div class="sub faint" style="font-size:12.5px">${[UNIDADES[t.unidad]?.n, t.responsable, t.empresa ? `<a href="#/empresa/${t.empresa_id}">${esc(t.empresa)}</a>` : "", t.origen && t.origen !== ME.email ? "creada por " + esc(t.origen) : ""].filter(Boolean).join(" · ")}</div>${t.descripcion ? `<div class="muted" style="font-size:13px;margin-top:4px">${esc(t.descripcion)}</div>` : ""}</div>
        <div style="text-align:right">${t.vence ? `<span class="pill ${t.vence < hoy ? "bad" : t.vence === hoy ? "warn" : ""}">${fecha(t.vence)}</span>` : ""}${t.prioridad === "alta" ? ' <span class="pill bad">alta</span>' : ""}</div></div>`).join("")}</section>`).join("")
      : `<div class="card empty"><b>Sin tareas pendientes</b>Crea una o pídele a un agente que la registre.</div>`;
    $$("[data-done]").forEach((b) => b.onclick = async () => {
      const row = b.closest(".task"); row.classList.add("hecha"); b.innerHTML = ico("check", 12);
      try { await rpc("app_tarea_estado", { p_id: b.dataset.done, p_estado: "hecha" }); toast("Tarea completada"); setTimeout(viewTareas, 600); }
      catch (e) { row.classList.remove("hecha"); b.innerHTML = ""; toast(e.message, true); }
    });
  } catch (e) { $("#tl").innerHTML = fail(e); }
}

/* ---------- finanzas ---------- */
async function viewFinanzas() {
  setActive("finanzas", "Finanzas / <b>Resultados</b>");
  const P = $("#page");
  if (!ME.ve_finanzas) { P.innerHTML = `<div class="card empty"><b>Sin acceso</b>Esta sección es solo para el dueño.</div>`; return; }
  P.innerHTML = `<div class="page-head"><div><h1>Resultados</h1><p>Venta cerrada por su monto real con IVA, menos sus costos asociados. El neto se calcula aparte.</p></div></div>${loading(8)}`;
  try {
    const d = await rpc("app_finanzas", { p_meses: 12 });
    const tot = (k) => d.pnl.reduce((a, r) => a + Number(r[k] || 0), 0);
    const porU = {}; d.pnl.forEach((r) => { const u = (porU[r.unidad] ||= { ventas: 0, costos: 0, margen: 0, n: 0 }); u.ventas += +r.ventas; u.costos += +r.costos; u.margen += +r.margen; u.n += +r.n; });
    const meses = [...new Set(d.pnl.map((r) => r.mes))].sort().reverse();
    const pend = d.ventas.filter((v) => v.cobro !== "cobrado").reduce((a, v) => a + Number(v.monto), 0);
    P.innerHTML = `<div class="page-head"><div><h1>Resultados</h1><p>Últimos 12 meses. Venta cerrada por su monto real con IVA, menos sus costos asociados.</p></div></div>
    <div class="kpis">
      <div class="kpi"><span class="l">Ventas 12 meses</span><span class="v">${clpM(tot("ventas"))}</span><span class="s">neto ${clpM(tot("ventas_neto"))}</span></div>
      <div class="kpi"><span class="l">Margen 12 meses</span><span class="v">${clpM(tot("margen"))}</span><span class="s">${tot("ventas") ? Math.round((tot("margen") / tot("ventas")) * 100) : 0}% sobre ventas</span></div>
      <div class="kpi"><span class="l">MRR BlackGPS</span><span class="v">${clpM(d.mrr?.mrr)}</span><span class="s">${int(d.mrr?.equipos_activos)} equipos</span></div>
      <div class="kpi"><span class="l">Por cobrar</span><span class="v ${pend ? "warn" : ""}">${clpM(pend)}</span><span class="s">en las últimas 60 ventas</span></div>
    </div>
    <section class="card"><div class="card-h"><h3>Por unidad</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Unidad</th><th class="num">Ventas</th><th class="num">Costos directos</th><th class="num">Margen</th><th class="num">%</th><th style="width:30%"></th></tr></thead><tbody>
      ${Object.entries(porU).sort((a, b) => b[1].ventas - a[1].ventas).map(([u, x]) => `<tr><td>${unidadPill(u)} <span class="faint" style="font-size:12px">${x.n} ventas</span></td><td class="num">${clp(x.ventas)}</td><td class="num">${clp(x.costos)}</td><td class="num">${clp(x.margen)}</td><td class="num">${x.ventas ? Math.round((x.margen / x.ventas) * 100) : 0}%</td>
        <td><div class="bar-track"><i style="width:${x.ventas ? (x.margen / x.ventas) * 100 : 0}%;background:${UNIDADES[u]?.c}"></i></div></td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><div class="card-h"><h3>Mes a mes</h3><span class="faint" style="font-size:12px">un mes sin costos registrados muestra un margen inflado</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mes</th><th>Unidad</th><th class="num">Ventas</th><th class="num">Costos</th><th class="num">Margen</th><th class="num">Gastos</th><th class="num">Resultado</th></tr></thead><tbody>
      ${meses.map((m) => d.pnl.filter((r) => r.mes === m).map((r, i) => `<tr><td class="mono" style="font-size:12.5px">${i === 0 ? new Date(m + "-15").toLocaleDateString("es-CL", { month: "long", year: "numeric" }) : ""}</td><td>${unidadPill(r.unidad)}</td><td class="num">${clp(r.ventas)}</td><td class="num">${+r.costos ? clp(r.costos) : '<span class="pill warn">sin costos</span>'}</td><td class="num">${clp(r.margen)}</td><td class="num">${+r.gastos ? clp(r.gastos) : "—"}</td><td class="num">${clp(r.resultado)}</td></tr>`).join("")).join("")}
    </tbody></table></div></section>
    <section class="card"><div class="card-h"><h3>Últimas ventas</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Unidad</th><th>Cliente</th><th>Detalle</th><th class="num">Monto</th><th class="num">Margen</th><th>Cobro</th></tr></thead><tbody>
      ${d.ventas.map((v) => `<tr><td class="mono" style="font-size:12.5px">${fecha(v.fecha)}</td><td>${unidadPill(v.unidad)}</td><td>${esc(v.cliente || "—")}</td><td class="muted">${esc(v.descripcion || "")}</td><td class="num">${clp(v.monto)}</td><td class="num">${+v.costos ? clp(v.monto - v.costos) : '<span class="faint">sin costo</span>'}</td><td>${v.cobro === "cobrado" ? '<span class="pill ok">Cobrado</span>' : `<span class="pill warn">${esc(v.cobro)}</span>`}</td></tr>`).join("")}
    </tbody></table></div></section>`;
  } catch (e) { P.innerHTML = fail(e); }
}

/* ---------- modales ---------- */
function modal(title, body, onOk, okText = "Guardar") {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button class="btn ghost sm" data-x aria-label="Cerrar">${ico("x")}</button></div>
    <form id="m-form"><div class="modal-b">${body}<div class="err" id="m-err"></div></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-x>Cancelar</button>${onOk ? `<button class="btn primary" id="m-ok">${esc(okText)}</button>` : ""}</div></form></div></div>`;
  const close = () => (root.innerHTML = "");
  $$("[data-x]", root).forEach((b) => b.onclick = close);
  $(".modal-bg", root).onclick = (e) => e.target.classList.contains("modal-bg") && close();
  document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", k); } });
  $("#m-form").onsubmit = async (e) => {
    e.preventDefault(); if (!onOk) return close();
    const ok = $("#m-ok"); ok.disabled = true; $("#m-err").textContent = "";
    try { await onOk(); close(); } catch (err) { $("#m-err").textContent = err.message; ok.disabled = false; }
  };
  setTimeout(() => $("input,select,textarea,button.seg-b", root)?.focus(), 30);
  return root;
}
function seg(name, opts, val) {
  return `<div class="seg" data-seg="${name}">${opts.map(([v, t]) => `<button type="button" class="${v === val ? "on" : ""}" data-v="${v}">${t}</button>`).join("")}</div>`;
}
function bindSeg(root) {
  $$("[data-seg]", root).forEach((g) => $$("button", g).forEach((b) => b.onclick = () => { $$("button", g).forEach((x) => x.classList.remove("on")); b.classList.add("on"); g.dataset.val = b.dataset.v; }));
  $$("[data-seg]", root).forEach((g) => (g.dataset.val = $("button.on", g)?.dataset.v || ""));
}
function modalActividad(opId, nombre, after) {
  const root = modal(`Registrar gestión · ${nombre}`, `
    <div class="field"><label>Tipo</label>${seg("tipo", [["llamada", "Llamada"], ["whatsapp", "WhatsApp"], ["correo", "Correo"], ["reunion", "Reunión"], ["visita", "Visita"], ["nota", "Nota"]], "llamada")}</div>
    <div class="field"><label>Resultado</label>${seg("res", RESULTADOS, "")}</div>
    <div class="field"><label for="a-nota">Detalle</label><textarea class="input" id="a-nota" placeholder="Qué pasó, con quién hablaste, qué pidió"></textarea></div>
    <div class="row"><div class="field"><label for="a-acc">Próxima acción</label><input class="input" id="a-acc" placeholder="Ej: enviar propuesta, volver a llamar"></div>
    <div class="field" style="flex:0 1 170px"><label for="a-fecha">Fecha</label><input class="input" id="a-fecha" type="date" value="${masDias(2)}"></div></div>`,
    async () => {
      const g = (n) => $(`[data-seg="${n}"]`, root).dataset.val;
      const r = await rpc("app_registrar_actividad", { p: { oportunidad_id: opId, tipo: g("tipo"), resultado: g("res") || null, nota: $("#a-nota").value.trim() || null, proxima_accion: $("#a-acc").value.trim() || null, proxima_fecha: $("#a-fecha").value || null } });
      toast(r.etapa !== r.etapa_anterior ? `Gestión guardada · pasó a ${etapaTxt(r.etapa)}` : r.estado === "perdida" ? "Gestión guardada · oportunidad perdida" : "Gestión guardada");
      after && after();
    });
  bindSeg(root);
}
function modalTarea(after, preset = {}) {
  const root = modal("Nueva tarea", `
    <div class="field"><label for="t-tit">Qué hay que hacer</label><input class="input" id="t-tit" required></div>
    <div class="field"><label for="t-desc">Detalle</label><textarea class="input" id="t-desc"></textarea></div>
    <div class="row"><div class="field"><label for="t-u">Unidad</label><select class="input" id="t-u">${Object.entries(UNIDADES).filter(([k]) => ME.unidades.includes(k)).map(([k, v]) => `<option value="${k}" ${k === (preset.unidad || "grupo") ? "selected" : ""}>${v.n}</option>`).join("")}</select></div>
    <div class="field"><label for="t-resp">Responsable</label><input class="input" id="t-resp" value="${esc((ME.nombre || "").split(" ")[0])}"></div></div>
    <div class="row"><div class="field"><label for="t-v">Vence</label><input class="input" id="t-v" type="date" value="${masDias(1)}"></div>
    <div class="field"><label>Prioridad</label>${seg("prio", [["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]], "media")}</div></div>`,
    async () => {
      if (!$("#t-tit").value.trim()) throw new Error("Escribe qué hay que hacer.");
      await rpc("app_crear_tarea", { p: { titulo: $("#t-tit").value.trim(), descripcion: $("#t-desc").value.trim() || null, unidad: $("#t-u").value, responsable: $("#t-resp").value.trim() || null, vence: $("#t-v").value || null, prioridad: $('[data-seg="prio"]', root).dataset.val, empresa_id: preset.empresa_id || null } });
      toast("Tarea creada"); after && after();
    }, "Crear tarea");
  bindSeg(root);
}
function modalAnalisis() {
  const unis = ME.unidades.filter((x) => x !== "grupo");
  const root = modal("Nuevo análisis", `
    <p class="muted" style="margin:0;font-size:13px">Si la empresa ya existe (mismo RUT o nombre), el análisis se suma a su ficha y no se duplica.</p>
    <div class="field"><label>Unidad</label>${seg("u", unis.map((u) => [u, UNIDADES[u].n]), unis.includes("blackgps") ? "blackgps" : unis[0])}</div>
    <div class="row"><div class="field"><label for="n-nom">Empresa</label><input class="input" id="n-nom" required></div><div class="field" style="flex:0 1 170px"><label for="n-rut">RUT</label><input class="input" id="n-rut" placeholder="76.123.456-7"></div></div>
    <div class="row"><div class="field"><label for="n-rubro">Rubro</label><input class="input" id="n-rubro"></div><div class="field" style="flex:0 1 120px"><label for="n-flota">Flota</label><input class="input" id="n-flota" type="number" min="0"></div><div class="field" style="flex:0 1 170px"><label for="n-com">Comuna</label><input class="input" id="n-com"></div></div>
    <div class="row"><div class="field"><label for="n-cnom">Contacto</label><input class="input" id="n-cnom"></div><div class="field"><label for="n-ccar">Cargo</label><input class="input" id="n-ccar"></div></div>
    <div class="row"><div class="field"><label for="n-ctel">Teléfono</label><input class="input" id="n-ctel" type="tel"></div><div class="field"><label for="n-cmail">Correo</label><input class="input" id="n-cmail" type="email"></div></div>
    <div class="field"><label for="n-res">Análisis y ángulo comercial</label><textarea class="input" id="n-res" placeholder="Qué problema tiene su operación y cómo abrir la conversación"></textarea></div>
    <div class="field"><label>Pilar</label>${seg("pilar", [["software", "Software"], ["conectividad", "Conectividad"], ["hardware", "Hardware"], ["", "No aplica"]], "")}</div>`,
    async () => {
      const g = (n) => $(`[data-seg="${n}"]`, root).dataset.val;
      if (!$("#n-nom").value.trim() && !$("#n-rut").value.trim()) throw new Error("Escribe el nombre o el RUT de la empresa.");
      const c = { nombre: $("#n-cnom").value.trim(), cargo: $("#n-ccar").value.trim(), telefono: $("#n-ctel").value.trim(), email: $("#n-cmail").value.trim() };
      const r = await rpc("app_registrar_analisis", { p: { unidad: g("u"),
        empresa: { nombre: $("#n-nom").value.trim(), rut: $("#n-rut").value.trim() || null, rubro: $("#n-rubro").value.trim() || null, tamano_flota: $("#n-flota").value || null, comuna: $("#n-com").value.trim() || null },
        contacto: c.nombre ? c : null, analisis: { resumen: $("#n-res").value.trim() || null, pilar: g("pilar") || null } } });
      toast(r.mensaje); location.hash = "#/empresa/" + r.empresa_id;
    }, "Guardar análisis");
  bindSeg(root);
}
async function modalAsisma(opId) {
  const root = modal("Ficha para Asisma", loading(5), null);
  try {
    const f = await rpc("app_ficha_asisma", { p_id: opId });
    const rows = [["RUT", fmtRut(f.rut)], ["Razón social", f.razon_social], ["Giro", f.giro], ["Región", f.region], ["Comuna", f.comuna], ["Dirección", f.direccion], ["Contacto", f.contacto], ["Cargo", f.cargo], ["Teléfono", f.telefono], ["Correo", f.email], ["Flota", f.flota], ["Interés", f.interes]];
    const texto = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + (f.resumen ? `\n\nContexto: ${f.resumen}` : "") + (f.ultima_gestion ? `\nÚltima gestión: ${f.ultima_gestion}` : "");
    $(".modal-b", root).innerHTML = `${f.faltan?.length ? `<div class="alert">${ico("alert", 16)}<div>Antes de cargar en Asisma falta: <b>${f.faltan.map(esc).join(", ")}</b>.</div></div>` : '<div class="pill ok" style="justify-self:start">Lista para cargar</div>'}
      <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="faint">—</span>'}</dd>`).join("")}</dl>
      <textarea class="input mono" id="as-txt" style="min-height:140px;font-size:12px" readonly>${esc(texto)}</textarea>
      <div class="row"><button type="button" class="btn" id="as-copy">Copiar ficha</button></div><div class="err" id="m-err"></div>`;
    $("#as-copy").onclick = async () => { try { await navigator.clipboard.writeText(texto); toast("Ficha copiada"); } catch { $("#as-txt").select(); toast("Selecciona y copia con Ctrl+C"); } };
  } catch (e) { $(".modal-b", root).innerHTML = fail(e); }
}

/* ---------- router ---------- */
async function render() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ME = null; viewLogin(); return; }
  if (!ME) {
    try { ME = await rpc("app_yo"); } catch { ME = null; }
    if (!ME) {
      $("#app").innerHTML = `<div class="login-form" style="min-height:100%"><div class="card empty" style="max-width:420px"><b>Tu usuario no tiene acceso a Carclass Core</b>Pídele a Felipe que te habilite.<div style="margin-top:14px"><button class="btn" id="lo">Salir</button></div></div></div>`;
      $("#lo").onclick = async () => { await sb.auth.signOut(); render(); }; return;
    }
    shell();
  }
  const [path, qs] = (location.hash.slice(2) || "inicio").split("?");
  const [r, arg] = path.split("/");
  const params = new URLSearchParams(qs || "");
  window.scrollTo(0, 0);
  if (r === "cola") return viewCola(params);
  if (r === "pipeline") return viewPipeline(params, arg);
  if (r === "empresas") return viewEmpresas(params);
  if (r === "empresa" && arg) return viewEmpresa(arg);
  if (r === "tareas") return viewTareas();
  if (r === "finanzas") return viewFinanzas();
  return viewInicio();
}
window.addEventListener("hashchange", () => ME && render());
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") { ME = null; } if (ev === "PASSWORD_RECOVERY") recoverPassword(); });
async function recoverPassword() {
  const root = modal("Crear nueva contraseña", `<div class="field"><label for="np">Nueva contraseña</label><input class="input" id="np" type="password" minlength="8" required autocomplete="new-password"></div>`, async () => {
    const { error } = await sb.auth.updateUser({ password: $("#np").value }); if (error) throw new Error(error.message); toast("Contraseña actualizada");
  });
}
render();
})();
