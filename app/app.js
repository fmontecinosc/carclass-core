/* Carclass Core v2 · app web
   Lee y escribe solo por funciones app_* de Supabase; la seguridad por rol vive en la base (RLS). */
(() => {
"use strict";
const VERSION = "2.0.0";
const SB_URL = "https://tvjpwwwnpchecolcsnxp.supabase.co";
const SB_KEY = "sb_publishable_-yYDQIhqaqqmI3VGe2Y7Ng_6a7VP_zr";

/* «Recordar dispositivo»: la sesión vive en localStorage si se marcó, si no en sessionStorage */
const ls = (() => { try { localStorage.setItem("_t", "1"); localStorage.removeItem("_t"); return localStorage; } catch { return null; } })();
const lsGet = (k, d = null) => { try { const v = ls?.getItem(k); return v == null ? d : v; } catch { return d; } };
const lsSet = (k, v) => { try { v == null ? ls?.removeItem(k) : ls?.setItem(k, v); } catch {} };
const recordar = () => lsGet("cc_recordar", "1") === "1";
const authStorage = {
  getItem: (k) => { try { return (recordar() ? localStorage : sessionStorage).getItem(k) ?? sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { (recordar() ? localStorage : sessionStorage).setItem(k, v); (recordar() ? sessionStorage : localStorage).removeItem(k); } catch {} },
  removeItem: (k) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch {} },
};
const sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storage: authStorage } });

/* ---------- catálogos ---------- */
const UNIDADES = {
  carclass: { n: "Carclass", c: "var(--u-carclass)", b2c: true },
  carwash:  { n: "Carwash.hf", c: "var(--u-carwash)", b2c: true },
  nom:      { n: "NOM", c: "var(--u-nom)", b2c: true },
  blackgps: { n: "BlackGPS", c: "var(--u-blackgps)" },
  somosb2b: { n: "somosB2B", c: "var(--u-somosb2b)" },
  grupo:    { n: "Holding", c: "var(--u-grupo)" },
};
const ETAPA_TXT = {
  pre_revision: "Pre-revisión", por_contactar: "Por contactar", en_prospeccion: "En prospección", reunion_por_agendar: "Reunión por agendar",
  en_asisma: "En Asisma", onboarding: "Onboarding", nuevo: "Nuevo", calificando: "Calificando", pre_evaluado: "Pre-evaluado", cotizado: "Cotizado",
  negociando: "Negociando", agendado: "Agendado", en_taller: "En taller", entregado: "Entregado", coordinando: "Coordinando", atendido: "Atendido",
  revision_agendada: "Revisión agendada", revisado: "Revisado", propuesta: "Propuesta", contrato_firmado: "Contrato firmado", publicado: "Publicado",
  presentado: "Presentado", visita_agendada: "Visita agendada", reservado: "Reservado",
  analizada: "Analizada", factible: "Factible", contactable: "Contactable", contactado: "Contactado", en_servicio: "En servicio", postventa: "Postventa",
};
const MOTIVOS = [["precio", "Precio"], ["competencia", "Se fue con la competencia"], ["sin_respuesta", "Sin respuesta"], ["fuera_zona", "Fuera de zona"],
  ["no_califica", "No califica"], ["desistio", "Desistió"], ["datos_erroneos", "Datos erróneos"], ["duplicado", "Duplicado"], ["otro", "Otro"]];
const RESULTADOS = [["", "Sin resultado"], ["no_contesta", "No contesta"], ["interesado", "Interesado"], ["reunion_agendada", "Reunión agendada"], ["enviar_info", "Pide información"], ["no_interesado", "No interesado"]];
const CANALES = [["whatsapp", "WhatsApp"], ["meta", "Meta Ads"], ["google", "Google Ads"], ["web", "Sitio web"], ["referido", "Referido"], ["llamada", "Llamada"], ["presencial", "Presencial"], ["manual", "Otro"]];
const CANAL_TXT = Object.fromEntries([...CANALES, ["asisma", "Asisma"], ["prospeccion_blackgps", "Prospección BlackGPS"], ["landing", "Landing"]]);

let ME = null;
let AVISOS = [];
let installPrompt = null;

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clp = (n) => n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString("es-CL");
const clpM = (n) => n == null ? "—" : Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " MM" : clp(n);
const int = (n) => n == null ? "—" : Number(n).toLocaleString("es-CL");
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const hoyISO = () => iso(new Date());
const masDias = (n, base = new Date()) => { const x = new Date(base); x.setDate(x.getDate() + n); return iso(x); };
const parseD = (s) => new Date(s.length <= 10 ? s + "T12:00:00" : s);
const fecha = (s) => s ? parseD(s).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: parseD(s).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }) : "—";
const fechaHora = (s) => s ? parseD(s).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const hace = (s) => {
  if (!s) return "sin gestión";
  const m = Math.floor((Date.now() - parseD(s)) / 6e4);
  if (m < 1) return "recién"; if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ayer" : d < 30 ? `hace ${d} días` : d < 365 ? `hace ${Math.floor(d / 30)} meses` : `hace ${Math.floor(d / 365)} años`;
};
const minTxt = (m) => m == null ? "—" : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toLocaleString("es-CL", { maximumFractionDigits: 1 })} h` : `${(m / 1440).toLocaleString("es-CL", { maximumFractionDigits: 1 })} días`;
const etapaTxt = (e) => ETAPA_TXT[e] || (e ? (e.charAt(0).toUpperCase() + e.slice(1)).replace(/_/g, " ") : "—");
const uName = (u) => UNIDADES[u]?.n || u;
const unidadPill = (u) => `<span class="pill u" style="--c:${UNIDADES[u]?.c || "var(--muted)"}">${esc(uName(u))}</span>`;
const initials = (s) => (s || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => x[0].toUpperCase()).join("");
const fmtRut = (r) => { if (!r) return ""; const b = r.slice(0, -1), dv = r.slice(-1); return b.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv; };
const waLink = (tel, txt = "") => { const d = String(tel || "").replace(/\D/g, ""); if (d.length < 8) return null; const n = d.length === 9 ? "56" + d : d.length === 8 ? "569" + d : d; return `https://wa.me/${n}${txt ? "?text=" + encodeURIComponent(txt) : ""}`; };
const unidadesMias = () => (ME?.unidades || []).filter((x) => x !== "grupo" && UNIDADES[x]);

const I = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 20a2 2 0 0 0 3.4 0"/>',
  inbox: '<path d="M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/>',
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  kanban: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  doc: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M16 4.5a3.5 3.5 0 0 1 0 7M18 13.7c2.1.7 3.5 2.9 3.5 6.3"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5M3 16h18v3h-3v-1H6v1H3zM5 11h14"/><circle cx="7.5" cy="14" r=".8"/><circle cx="16.5" cy="14" r=".8"/>',
  tasks: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 3 3 5-6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  alert: '<path d="M12 3 2 21h20zM12 10v5M12 18v.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  dot: '<circle cx="12" cy="12" r="3"/>',
  check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5"/>',
  call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  meet: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 14.5c2.8 0 5 2.2 5 5"/>',
  note: '<path d="M5 3h10l4 4v14H5zM14 3v5h5"/>',
  clip: '<path d="m20 11-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  dl: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6v4H9z"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
};
const ico = (k, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || I.dot}</svg>`;
const tipoIco = { llamada: "call", correo: "mail", whatsapp: "chat", reunion: "meet", visita: "meet", nota: "note", sistema: "dot" };
const logoDisc = () => `<span class="logo-disc"><img src="img/logo.png" alt="Carclass"></span>`;

function toast(msg, bad = false) {
  const t = $("#toast"); t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 3400);
}
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    if (/JWT|not authenticated|session/i.test(error.message)) { await sb.auth.signOut(); ME = null; location.hash = ""; render(); }
    throw new Error(error.message.replace(/^.*?:\s*(?=[A-ZÁÉÍÓÚ])/, ""));
  }
  return data;
}
const loading = (n = 4) => `<div class="card card-b" style="display:grid;gap:12px">${Array(n).fill('<div class="skel"></div>').join("")}</div>`;
const fail = (e) => `<div class="card empty"><span class="ic">${ico("alert")}</span><b>No se pudo cargar</b>${esc(e.message)}</div>`;
const empty = (icon, t, s = "") => `<div class="empty"><span class="ic">${ico(icon)}</span><b>${t}</b>${s}</div>`;
function downloadCSV(name, rows) {
  if (!rows.length) { toast("No hay filas para exportar", true); return; }
  const cols = Object.keys(rows[0]);
  const cell = (v) => { const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- tema ---------- */
const tema = () => document.documentElement.dataset.theme || "light";
function setTema(t) { document.documentElement.dataset.theme = t; lsSet("cc_tema", t); const b = $("#tema"); if (b) b.innerHTML = ico(t === "dark" ? "sun" : "moon"); $('meta[name="theme-color"]').content = t === "dark" ? "#0c1310" : "#006039"; }

/* ---------- login ---------- */
function viewLogin(msg = "") {
  $("#app").innerHTML = `
  <div class="login">
    <section class="login-brand">
      <div class="logo-row">${logoDisc()}<div><b>Carclass Core</b><small>Carclass Group</small></div></div>
      <div style="position:relative;z-index:1">
        <h1>Todo el holding, <em>en un solo lugar</em>.</h1>
        <p class="lead">El CRM de Carclass, Carwash.hf, NOM, BlackGPS y somosB2B. Leads, clientes, agenda y resultados conectados a tus agentes.</p>
        <ul class="benefits">
          <li><span class="ck">${ico("check", 14)}</span><div><b>Cada lead respondido a tiempo</b><span class="s">Bandeja con reloj de minutos sin respuesta y avisos al teléfono.</span></div></li>
          <li><span class="ck">${ico("check", 14)}</span><div><b>Embudo que avanza solo</b><span class="s">Cada gestión mueve la etapa; nunca retrocede sin que tú lo decidas.</span></div></li>
          <li><span class="ck">${ico("check", 14)}</span><div><b>Ventas y márgenes reales</b><span class="s">Venta cerrada separada de cobrada, por unidad y por mes.</span></div></li>
        </ul>
      </div>
      <div class="foot">© ${new Date().getFullYear()} Carclass Group · Huertos Familiares, Tiltil</div>
    </section>
    <section class="login-form">
      <form id="f-login" autocomplete="on" novalidate>
        <div><h2>Bienvenido de nuevo</h2></div>
        <p class="sub">Ingresa con tu correo y contraseña.</p>
        <div class="field"><label for="l-email">Correo electrónico</label><input class="input" id="l-email" type="email" autocomplete="email" placeholder="nombre@carclass.cl" required></div>
        <div class="field"><label for="l-pass">Contraseña</label><div class="pass-wrap"><input class="input" id="l-pass" type="password" autocomplete="current-password" required><button type="button" class="btn ghost sm icon" id="l-eye" aria-label="Mostrar contraseña">${ico("eye", 16)}</button></div></div>
        <div class="login-opts"><label class="check-row"><input type="checkbox" id="l-rec" ${recordar() ? "checked" : ""}> Recordar dispositivo</label><a href="#" id="l-reset">¿Olvidaste tu contraseña?</a></div>
        <div class="err" id="l-err">${esc(msg)}</div>
        <button class="btn primary" type="submit" id="l-btn">Ingresar</button>
        <p class="login-note">Acceso solo para el equipo de Carclass Group.</p>
      </form>
    </section>
  </div>`;
  $("#l-eye").onclick = () => { const p = $("#l-pass"); const show = p.type === "password"; p.type = show ? "text" : "password"; $("#l-eye").innerHTML = ico(show ? "eyeoff" : "eye", 16); };
  $("#f-login").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#l-email").value.trim(), pass = $("#l-pass").value;
    if (!email || !pass) { $("#l-err").textContent = "Escribe tu correo y tu contraseña."; return; }
    lsSet("cc_recordar", $("#l-rec").checked ? "1" : "0");
    const btn = $("#l-btn"); btn.disabled = true; btn.textContent = "Verificando…"; $("#l-err").textContent = "";
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) { $("#l-err").textContent = "Correo o contraseña incorrectos."; btn.disabled = false; btn.textContent = "Ingresar"; return; }
    render();
  };
  $("#l-reset").onclick = async (e) => {
    e.preventDefault();
    const email = $("#l-email").value.trim();
    if (!email) { $("#l-err").textContent = "Escribe tu correo y vuelve a pulsar «¿Olvidaste tu contraseña?»."; return; }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
    $("#l-err").style.color = "var(--ok)"; $("#l-err").textContent = "Si el correo existe, te llegó un enlace para crear una nueva contraseña.";
  };
}

/* ---------- shell ---------- */
const NAV = [
  ["Análisis", [["dashboard", "Dashboard", "dash"], ["notificaciones", "Notificaciones", "bell", "avisos"]]],
  ["Comercial", [["bandeja", "Bandeja", "inbox", "bandeja"], ["conversaciones", "Conversaciones", "chat", null, true], ["embudo", "Embudo", "kanban"], ["agenda", "Agenda", "cal"], ["cotizaciones", "Cotizaciones", "doc"], ["clientes", "Clientes", "users"]]],
  ["Catálogo", [["vehiculos", "Vehículos", "car"]]],
  ["Post-venta", [["tareas", "Tareas y postventa", "tasks", "tareas"]]],
  ["Finanzas", [["finanzas", "Ventas y márgenes", "chart"]], "fin"],
  ["Organización", [["equipo", "Equipo", "team"]]],
  ["Ayuda", [["ayuda", "Procesos", "help"]]],
];
const TITULOS = Object.fromEntries(NAV.flatMap(([g, items]) => items.map(([r, t]) => [r, [g, t]])));
TITULOS.cliente = ["Comercial", "Ficha del cliente"];

function shell() {
  const nav = NAV.filter(([, , f]) => f !== "fin" || ME.ve_finanzas).map(([g, items]) =>
    `<h6>${g}</h6>` + items.map(([r, t, i, badge, soon]) => `<a href="#/${r}" data-r="${r}">${ico(i)}<span>${t}</span>${badge ? `<span class="badge" id="nb-${badge}"></span>` : ""}${soon ? '<span class="soon">pronto</span>' : ""}</a>`).join("")).join("");
  $("#app").innerHTML = `
  <div class="shell">
    <aside class="side" id="side">
      <div class="side-top">
        <div class="brand">${logoDisc()}<div><b>Carclass Core</b><small>Carclass Group</small></div></div>
        <button class="btn notify" id="notify">${ico("bell", 15)}<span>Activar avisos en este dispositivo</span></button>
        <button class="btn sm" id="install" hidden>${ico("phone", 15)} Instalar app</button>
      </div>
      <nav class="nav" aria-label="Menú principal">${nav}</nav>
      <div class="side-foot">
        <div class="avatar">${esc(initials(ME.nombre || ME.email))}</div>
        <div class="who"><b>${esc(ME.nombre || ME.email)}</b><span>${ME.rol === "dueno" ? "Dueño" : ME.rol === "operador" ? "Operador" : "Ejecutivo"}</span></div>
        <button class="btn ghost sm" id="logout" title="Salir">${ico("out", 16)} Salir</button>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main">
      <header class="top">
        <button class="btn ghost icon menu-btn" id="menu" aria-label="Abrir menú">${ico("menu")}</button>
        <div class="crumbs" id="crumbs"></div>
        <form class="search" id="f-search" role="search">${ico("search", 16)}<input class="input" id="q" type="search" placeholder="Buscar cliente, RUT o teléfono" aria-label="Buscar cliente"></form>
        <button class="btn primary nl" id="nuevo">${ico("plus", 16)}<span>Nuevo lead</span></button>
        <button class="btn ghost icon" id="tema" aria-label="Cambiar tema claro u oscuro">${ico(tema() === "dark" ? "sun" : "moon")}</button>
        <a class="btn ghost icon bell" href="#/notificaciones" aria-label="Notificaciones">${ico("bell")}<span class="dot" id="bell-n" hidden></span></a>
      </header>
      <main class="page" id="page"></main>
    </div>
  </div>`;
  $("#logout").onclick = async () => { await sb.auth.signOut(); ME = null; location.hash = ""; render(); };
  $("#menu").onclick = () => $("#side").classList.add("open");
  $("#scrim").onclick = () => $("#side").classList.remove("open");
  $("#f-search").onsubmit = (e) => { e.preventDefault(); location.hash = "#/clientes?q=" + encodeURIComponent($("#q").value.trim()); };
  $("#nuevo").onclick = () => modalLead();
  $("#tema").onclick = () => setTema(tema() === "dark" ? "light" : "dark");
  $("#notify").onclick = activarAvisos;
  $("#install").onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("#install").hidden = true; };
  if (installPrompt) $("#install").hidden = false;
  pintarNotify();
}
function setActive(r, titulo) {
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  const [g, t] = TITULOS[r] || ["", ""];
  $("#crumbs").innerHTML = `<span class="org">Carclass Group</span><span class="sep">/</span><span class="org">${esc(g)}</span><span class="sep">/</span><b>${esc(titulo || t)}</b>`;
  document.title = `${titulo || t} · Carclass Core`;
  $("#side").classList.remove("open");
}

/* ---------- avisos (notificaciones) ---------- */
const leidos = () => { try { return new Set(JSON.parse(lsGet("cc_leidos", "[]"))); } catch { return new Set(); } };
const notificados = () => { try { return new Set(JSON.parse(lsGet("cc_notificados", "[]"))); } catch { return new Set(); } };
const guardarSet = (k, s) => lsSet(k, JSON.stringify([...s].slice(-400)));
function pintarNotify() {
  const b = $("#notify"); if (!b) return;
  const ok = "Notification" in window && Notification.permission === "granted";
  b.classList.toggle("on", ok);
  b.querySelector("span").textContent = ok ? "Avisos activos en este dispositivo" : "Activar avisos en este dispositivo";
}
async function activarAvisos() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!("Notification" in window)) {
    modal("Activar avisos", ios && !standalone
      ? `<p>En iPhone los avisos funcionan solo con la app instalada:</p><ol><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.</li><li>Abre Carclass Core desde el ícono y vuelve a pulsar «Activar avisos».</li></ol>`
      : `<p>Este navegador no admite avisos. Prueba con Chrome, Edge o Safari actualizados.</p>`, null);
    return;
  }
  if (Notification.permission === "denied") { toast("Los avisos están bloqueados. Actívalos en la configuración del navegador para este sitio.", true); return; }
  const p = await Notification.requestPermission();
  pintarNotify();
  if (p === "granted") { mostrarAviso({ id: "test", title: "Avisos activados", body: "Te avisaremos de leads nuevos y leads sin respuesta a los 5 minutos.", href: "#/bandeja" }); toast("Avisos activados en este dispositivo"); }
}
async function mostrarAviso(a) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: a.body, icon: "img/icon-192.png", badge: "img/icon-96.png", tag: a.id, data: { href: a.href } };
    if (reg) await reg.showNotification(a.title, opts); else new Notification(a.title, opts);
  } catch {}
}
async function cargarAvisos() {
  if (!ME) return;
  try {
    const [bandeja, tareas] = await Promise.all([rpc("app_bandeja", { p_tipo: "todas" }), rpc("app_tareas", { p_estado: "pendiente,en_curso" })]);
    const hoy = hoyISO(); const L = [];
    for (const b of bandeja) {
      const nombre = b.contacto || b.empresa;
      if (b.bandeja === "pre_revision") L.push({ id: "pre:" + b.oportunidad_id, level: "info", icon: "spark", title: `Análisis por revisar · ${b.empresa}`, body: `${uName(b.unidad)} · el GPT lo dejó en pre-revisión`, href: "#/bandeja?t=pre_revision", at: b.creado });
      else {
        L.push({ id: "lead:" + b.oportunidad_id, level: "brand", icon: "inbox", title: `Lead nuevo · ${nombre}`, body: `${uName(b.unidad)}${b.canal ? " · " + (CANAL_TXT[b.canal] || b.canal) : ""}${b.campana ? " · " + b.campana : ""}`, href: "#/bandeja", at: b.creado });
        if (b.minutos_sin_respuesta != null && b.minutos_sin_respuesta >= 5) L.push({ id: "sla:" + b.oportunidad_id, level: "bad", icon: "clock", title: `Sin respuesta hace ${minTxt(b.minutos_sin_respuesta)} · ${nombre}`, body: `${uName(b.unidad)} · el objetivo es responder en 5 minutos`, href: "#/bandeja", at: new Date(parseD(b.creado).getTime() + 5 * 6e4).toISOString() });
      }
    }
    for (const t of tareas.filter((t) => t.vence && t.vence <= hoy)) L.push({ id: `tarea:${t.id}:${hoy}`, level: t.vence < hoy ? "bad" : "warn", icon: "tasks", title: `${t.vence < hoy ? "Tarea vencida" : "Tarea para hoy"} · ${t.titulo}`, body: [uName(t.unidad), t.empresa].filter(Boolean).join(" · "), href: "#/tareas", at: t.vence + "T08:00:00" });
    L.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
    AVISOS = L;
    const rd = leidos(); const unread = L.filter((a) => !rd.has(a.id)).length;
    const bn = $("#bell-n"); if (bn) { bn.hidden = !unread; bn.textContent = unread > 99 ? "99+" : unread; }
    const nb = $("#nb-avisos"); if (nb) nb.textContent = unread || "";
    const nbb = $("#nb-bandeja"); if (nbb) { const n = bandeja.length; nbb.textContent = n || ""; nbb.className = "badge" + (bandeja.some((b) => b.minutos_sin_respuesta >= 5 && b.bandeja !== "pre_revision") ? " bad" : n ? " brand" : ""); }
    const nbt = $("#nb-tareas"); if (nbt) { const v = tareas.filter((t) => t.vence && t.vence < hoy).length; nbt.textContent = v || ""; nbt.className = "badge" + (v ? " bad" : ""); }
    // avisos del sistema: lead nuevo y lead sin respuesta a los 5 minutos
    if ("Notification" in window && Notification.permission === "granted") {
      const nt = notificados(); const primera = !lsGet("cc_notif_init");
      for (const a of L.filter((a) => /^(lead|sla):/.test(a.id) && !nt.has(a.id))) { if (!primera) mostrarAviso(a); nt.add(a.id); }
      guardarSet("cc_notificados", nt); lsSet("cc_notif_init", "1");
    }
  } catch {}
}

/* ---------- dashboard ---------- */
const PRESETS = [["hoy", "Hoy"], ["7d", "7 días"], ["30d", "30 días"], ["mes", "Este mes"], ["90d", "90 días"], ["anio", "Este año"]];
function rangoPreset(k) {
  const h = new Date(), y = h.getFullYear(), m = h.getMonth();
  return { hoy: [hoyISO(), hoyISO()], "7d": [masDias(-6), hoyISO()], "30d": [masDias(-29), hoyISO()], mes: [iso(new Date(y, m, 1)), hoyISO()], "90d": [masDias(-89), hoyISO()], anio: [iso(new Date(y, 0, 1)), hoyISO()] }[k] || [masDias(-29), hoyISO()];
}
async function viewDashboard(params) {
  setActive("dashboard");
  const pre = params.get("r") || (params.get("desde") ? "" : "30d");
  const [d0, d1] = pre ? rangoPreset(pre) : [params.get("desde"), params.get("hasta") || hoyISO()];
  const u = params.get("u") || "";
  const link = (o) => { const p = new URLSearchParams({ r: pre, desde: pre ? "" : d0, hasta: pre ? "" : d1, u, ...o }); [...p.keys()].forEach((k) => !p.get(k) && p.delete(k)); return "#/dashboard?" + p; };
  const P = $("#page");
  const nombre = (ME.nombre || "").split(" ")[0];
  const saludo = new Date().getHours() < 12 ? "Buenos días" : new Date().getHours() < 20 ? "Buenas tardes" : "Buenas noches";
  P.innerHTML = `
    <div class="page-head"><div><h1>${saludo}, ${esc(nombre)}</h1><p>${new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })} · resumen comercial del holding.</p></div>
      <div class="actions"><button class="btn" id="csv">${ico("dl", 16)} Exportar CSV</button></div></div>
    <div class="filters">
      <div class="chips">${PRESETS.map(([k, t]) => `<a class="chip ${pre === k ? "on" : ""}" href="${link({ r: k, desde: "", hasta: "" })}">${t}</a>`).join("")}</div>
      <form class="daterange" id="f-rango">${ico("cal", 15)}<input type="date" id="r-d" value="${d0}" aria-label="Desde"><span class="faint">→</span><input type="date" id="r-h" value="${d1}" aria-label="Hasta"></form>
      <select class="input" id="r-u" style="width:auto;height:38px" aria-label="Unidad"><option value="">Todas las unidades</option>${unidadesMias().map((x) => `<option value="${x}" ${u === x ? "selected" : ""}>${uName(x)}</option>`).join("")}</select>
    </div>
    <div id="dash">${loading(8)}</div>`;
  const go = () => { location.hash = link({ r: "", desde: $("#r-d").value, hasta: $("#r-h").value }); };
  $("#r-d").onchange = go; $("#r-h").onchange = go;
  $("#r-u").onchange = () => (location.hash = link({ u: $("#r-u").value }));
  $("#csv").onclick = async () => {
    try { const rows = await rpc("app_leads", { p_desde: d0, p_hasta: d1, p_unidad: u || null }); downloadCSV(`leads_${d0}_${d1}${u ? "_" + u : ""}.csv`, rows); }
    catch (e) { toast(e.message, true); }
  };
  try {
    const d = await rpc("app_dashboard2", { p_desde: d0, p_hasta: d1, p_unidad: u || null });
    const conv = d.leads ? (d.ganadas / d.leads) * 100 : 0;
    const slaPct = d.con_respuesta ? Math.round((d.sla_5min / d.con_respuesta) * 100) : null;
    const etapas = d.por_etapa || [];
    const maxE = Math.max(1, ...etapas.map((x) => x.n));
    const canales = d.por_canal || []; const maxC = Math.max(1, ...canales.map((x) => x.n));
    const alertas = [];
    if (d.cola?.vencidas) alertas.push(`<b>${int(d.cola.vencidas)}</b> oportunidades con la próxima acción vencida.`);
    if (d.bandeja) alertas.push(`<b>${int(d.bandeja)}</b> leads en la bandeja esperando gestión.`);
    $("#dash").innerHTML = `
    ${alertas.length ? `<div class="alert">${ico("alert", 18)}<div>${alertas.join(" ")} <a href="#/bandeja">Abrir bandeja</a></div></div>` : ""}
    <div class="kpis">
      <div class="kpi"><div class="top-row"><span class="l">Leads totales</span><span class="ki">${ico("inbox", 17)}</span></div><span class="v">${int(d.leads)}</span><span class="s">${int(d.abiertas)} abiertos · ${int(d.perdidas)} perdidos</span></div>
      <div class="kpi"><div class="top-row"><span class="l">Tasa de conversión</span><span class="ki">${ico("trophy", 17)}</span></div><span class="v">${conv.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</span><span class="s">${int(d.ganadas)} ganados de ${int(d.leads)}</span></div>
      <div class="kpi"><div class="top-row"><span class="l">Respuesta promedio</span><span class="ki">${ico("clock", 17)}</span></div><span class="v ${d.respuesta_min > 5 ? "warn" : ""}">${d.respuesta_min == null ? "—" : minTxt(d.respuesta_min)}</span><span class="s">${slaPct == null ? "sin respuestas medidas en el rango" : `${slaPct}% respondidos en 5 min o menos`}</span></div>
      ${ME.ve_finanzas ? `<a class="kpi" href="#/finanzas"><div class="top-row"><span class="l">Ventas pagadas</span><span class="ki gold">${ico("money", 17)}</span></div><span class="v">${clpM(d.ventas_pagadas)}</span><span class="s">${clpM(d.ventas_cerradas)} cerradas · ${int(d.n_ventas)} ventas</span></a>` : ""}
    </div>
    <div class="grid2">
      <section class="card"><div class="card-h"><h3>Leads por etapa del embudo</h3><span class="r faint" style="font-size:12px">abiertos hoy</span></div>
        <div class="card-b bars">${etapas.length ? etapas.slice(0, 14).map((x) => `<a class="bar-row" href="#/embudo/${x.unidad}"><span class="lab">${esc(etapaTxt(x.etapa))}${u ? "" : ` <span class="faint">· ${esc(uName(x.unidad))}</span>`}</span><span class="bar-track"><i style="width:${(x.n / maxE) * 100}%;background:${UNIDADES[x.unidad]?.c || "var(--brand)"}"></i></span><span class="n">${int(x.n)}</span></a>`).join("") : empty("kanban", "Sin oportunidades abiertas")}</div></section>
      <section class="card"><div class="card-h"><h3>Leads por origen y canal</h3><span class="r faint" style="font-size:12px">en el rango</span></div>
        <div class="card-b bars">${canales.length ? canales.map((x) => `<div class="bar-row"><span class="lab">${esc(CANAL_TXT[x.canal] || x.canal)}</span><span class="bar-track"><i style="width:${(x.n / maxC) * 100}%"></i></span><span class="n">${int(x.n)}<span class="faint" style="font-weight:500"> · ${int(x.ganadas)}✓</span></span></div>`).join("") : empty("inbox", "Sin leads en el rango", "Prueba con un rango más amplio.")}
        ${(d.por_campana || []).length ? `<div style="margin-top:14px"><div class="lbl" style="margin-bottom:8px">Campañas</div>${d.por_campana.map((x) => `<div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0"><span>${esc(x.campana)}</span><span class="num"><b>${int(x.n)}</b> <span class="faint">· ${int(x.ganadas)} ganados</span></span></div>`).join("")}</div>` : ""}</div></section>
    </div>
    <div class="grid-main">
      <section class="card"><div class="card-h"><h3>Evolución mensual</h3><div class="r legend"><span style="--c:var(--brand-100)">Leads creados</span><span style="--c:var(--brand)">Ganados</span></div></div>
        <div class="card-b">${chartEvolucion(d.evolucion || [])}</div></section>
      <div class="stack">
        <section class="card"><div class="card-h"><h3>SLA de primera respuesta</h3></div><div class="card-b sla">
          ${d.con_respuesta ? `<div class="sla-bar"><i style="width:${slaPct}%;background:var(--ok)"></i><i style="width:${100 - slaPct}%;background:var(--warn)"></i></div>
          <div class="row" style="justify-content:space-between;font-size:13px"><span><b>${int(d.sla_5min)}</b> en 5 min o menos</span><span><b>${int(d.con_respuesta - d.sla_5min)}</b> más tarde</span></div>` : `<div class="muted" style="font-size:13px">Todavía no hay respuestas medidas en este rango. Se mide desde que el lead entra hasta la primera gestión saliente.</div>`}
          ${d.leads - d.con_respuesta > 0 ? `<div class="faint" style="font-size:12.5px">${int(d.leads - d.con_respuesta)} leads del rango sin respuesta registrada.</div>` : ""}</div></section>
        <section class="card"><div class="card-h"><h3>Para hoy</h3></div><div class="card-b" style="display:grid;gap:10px;font-size:13.5px">
          <a class="row" href="#/agenda?v=dia" style="justify-content:space-between"><span>Próximas acciones vencidas</span><span class="pill ${d.cola?.vencidas ? "bad" : ""}">${int(d.cola?.vencidas)}</span></a>
          <a class="row" href="#/agenda?v=dia" style="justify-content:space-between"><span>Próximas acciones de hoy</span><span class="pill">${int(d.cola?.hoy)}</span></a>
          <a class="row" href="#/tareas" style="justify-content:space-between"><span>Tareas pendientes</span><span class="pill ${d.tareas?.vencidas ? "warn" : ""}">${int(d.tareas?.pendientes)}${d.tareas?.vencidas ? ` · ${int(d.tareas.vencidas)} vencidas` : ""}</span></a>
          <a class="row" href="#/embudo/blackgps" style="justify-content:space-between"><span>Prospectos sin fecha</span><span class="pill">${int(d.cola?.sin_fecha)}</span></a>
        </div></section>
      </div>
    </div>
    <p class="faint" style="font-size:12px;margin:0">Leads = oportunidades creadas en el rango. No incluye los 575 prospectos importados de la base BlackGPS, que se trabajan desde el embudo.</p>`;
  } catch (e) { $("#dash").innerHTML = fail(e); }
}
function chartEvolucion(rows) {
  if (!rows.length) return empty("chart", "Sin datos");
  const W = 640, H = 220, pl = 30, pb = 26, pt = 10;
  const max = Math.max(4, ...rows.map((r) => Math.max(r.creados, r.ganados)));
  const step = Math.ceil(max / 4); const top = step * 4;
  const bw = (W - pl - 6) / rows.length;
  const y = (v) => H - pb - (v / top) * (H - pb - pt);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Leads creados y ganados por mes">`;
  for (let t = 0; t <= top; t += step) s += `<line class="grid" x1="${pl}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}"/><text x="${pl - 6}" y="${y(t) + 3.5}" font-size="10" text-anchor="end">${t}</text>`;
  rows.forEach((r, i) => {
    const x = pl + i * bw, w = bw * 0.32;
    s += `<rect x="${x + bw * 0.16}" y="${y(r.creados)}" width="${w}" height="${H - pb - y(r.creados)}" rx="3" fill="var(--brand-100)"><title>${r.mes}: ${r.creados} creados</title></rect>`;
    s += `<rect x="${x + bw * 0.16 + w + 2}" y="${y(r.ganados)}" width="${w}" height="${H - pb - y(r.ganados)}" rx="3" fill="var(--brand)"><title>${r.mes}: ${r.ganados} ganados</title></rect>`;
    s += `<text x="${x + bw / 2}" y="${H - 8}" font-size="10.5" text-anchor="middle">${new Date(r.mes + "-15").toLocaleDateString("es-CL", { month: "short" }).replace(".", "")}</text>`;
  });
  return s + "</svg>";
}

/* ---------- notificaciones ---------- */
async function viewNotificaciones() {
  setActive("notificaciones");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Notificaciones</h1><p>Centro de avisos. Con los avisos activos, los leads nuevos y los que llevan 5 minutos sin respuesta también llegan a este dispositivo.</p></div>
    <div class="actions"><button class="btn" id="n-all">${ico("check", 16)} Marcar todo como leído</button></div></div><div id="nl">${loading(5)}</div>`;
  await cargarAvisos();
  const rd = leidos();
  const tipos = [["Lead nuevo", "activo"], ["Lead sin respuesta a los 5 minutos", "activo"], ["Cliente pide hablar con una persona", "se activa con WhatsApp"], ["Cotización vista", "se activa con el link público de cotizaciones"], ["Reunión en 1 hora", "se activa con Google Calendar"]];
  $("#nl").innerHTML = `<div class="grid-main"><section class="card">${AVISOS.length ? AVISOS.map((a) => `<a class="notif ${rd.has(a.id) ? "" : "unread"}" href="${a.href}" data-id="${esc(a.id)}"><span class="ic ${a.level === "bad" ? "bad" : a.level === "warn" ? "warn" : ""}">${ico(a.icon, 17)}</span><div><div class="t">${esc(a.title)}</div><div class="muted" style="font-size:12.5px">${esc(a.body)}</div><div class="d">${hace(a.at)}</div></div></a>`).join("") : empty("bell", "Sin avisos", "Cuando entre un lead o venza una tarea, aparecerá aquí.")}</section>
    <section class="card"><div class="card-h"><h3>Avisos al dispositivo</h3></div><div class="card-b" style="display:grid;gap:10px;font-size:13px">
      ${tipos.map(([t, s]) => `<div class="row" style="justify-content:space-between;align-items:center"><span>${t}</span><span class="pill ${s === "activo" ? "ok" : ""}">${s}</span></div>`).join("")}
      <p class="faint" style="margin:6px 0 0;font-size:12px">Hoy los avisos llegan mientras la app está abierta o en segundo plano. El aviso con la app cerrada se activa al conectar el servidor de push.</p>
      <button class="btn primary" id="n-act">${ico("bell", 15)} ${"Notification" in window && Notification.permission === "granted" ? "Probar aviso" : "Activar avisos en este dispositivo"}</button></div></section></div>`;
  $$("#nl .notif").forEach((a) => a.addEventListener("click", () => { const s = leidos(); s.add(a.dataset.id); guardarSet("cc_leidos", s); }));
  $("#n-all").onclick = () => { const s = leidos(); AVISOS.forEach((a) => s.add(a.id)); guardarSet("cc_leidos", s); viewNotificaciones(); };
  $("#n-act").onclick = activarAvisos;
}

/* ---------- bandeja ---------- */
async function viewBandeja(params) {
  setActive("bandeja");
  const t = params.get("t") || "entrantes";
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Bandeja</h1><p>Leads entrantes con el reloj de minutos sin respuesta. El objetivo es responder en menos de 5 minutos.</p></div>
    <div class="actions"><button class="btn primary" id="b-new">${ico("plus", 16)} Nuevo lead</button></div></div>
    <div class="tabs"><a href="#/bandeja" class="${t === "entrantes" ? "on" : ""}">Entrantes <span class="badge" id="tb-e"></span></a><a href="#/bandeja?t=pre_revision" class="${t === "pre_revision" ? "on" : ""}">Pre-revisión GPT <span class="badge" id="tb-p"></span></a></div>
    <div id="bl">${loading(6)}</div>`;
  $("#b-new").onclick = () => modalLead();
  try {
    const all = await rpc("app_bandeja", { p_tipo: "todas" });
    const ent = all.filter((x) => x.bandeja !== "pre_revision"), pre = all.filter((x) => x.bandeja === "pre_revision");
    $("#tb-e").textContent = ent.length || ""; $("#tb-p").textContent = pre.length || "";
    const rows = t === "pre_revision" ? pre : ent;
    if (!rows.length) { $("#bl").innerHTML = `<div class="card">${empty("inbox", t === "pre_revision" ? "Nada por revisar" : "Bandeja al día", t === "pre_revision" ? "Los análisis del GPT de BlackGPS caerán aquí para que los apruebes o descartes." : "No hay leads esperando respuesta.")}</div>`; return; }
    $("#bl").innerHTML = `<div class="card">${rows.map((b) => {
      const m = b.minutos_sin_respuesta;
      const cls = t === "pre_revision" ? "done" : m == null ? "done" : m >= 5 ? "bad" : m >= 3 ? "warn" : "";
      const wa = waLink(b.telefono, `Hola${b.contacto ? " " + b.contacto.split(" ")[0] : ""}, te escribo de ${uName(b.unidad)}.`);
      return `<div class="lead">
        <div class="clock ${cls}" ${m != null && m < 60 ? `data-m="${Math.floor(m)}"` : ""}>${t === "pre_revision" ? `${ico("spark", 20)}` : m == null ? `${ico("check", 20)}` : clockTxt(m)}</div>
        <div><div class="t"><a href="#/cliente/${b.empresa_id}">${esc(b.contacto || b.empresa)}</a>${b.contacto && b.contacto !== b.empresa && b.tipo !== "persona" ? ` <span class="muted" style="font-weight:500">· ${esc(b.empresa)}</span>` : ""}</div>
          <div class="meta">${unidadPill(b.unidad)}${b.flujo ? `<span class="pill">${esc(b.flujo)}</span>` : ""}<span>${esc(etapaTxt(b.etapa))}</span>${b.canal ? `<span>${esc(CANAL_TXT[b.canal] || b.canal)}</span>` : ""}${b.campana ? `<span class="pill gold">${esc(b.campana)}</span>` : ""}<span>${hace(b.creado)}</span>${b.telefono ? `<a href="tel:${esc(b.telefono)}">${esc(b.telefono)}</a>` : ""}${b.flota ? `<span>${int(b.flota)} vehículos</span>` : ""}</div>
          ${b.ultimo_mensaje ? `<div class="msg">${esc(b.ultimo_mensaje)}</div>` : ""}
          ${b.analisis?.resumen ? `<div class="msg"><b style="font-size:12px;color:var(--muted)">Análisis GPT${b.analisis.score != null ? ` · calce ${b.analisis.score}` : ""}${b.analisis.pilar ? ` · ${esc(b.analisis.pilar)}` : ""}</b><div>${esc(b.analisis.resumen)}</div></div>` : ""}</div>
        <div class="acts">${t === "pre_revision"
          ? `<button class="btn sm primary" data-ok="${b.oportunidad_id}">${ico("check", 14)} Aprobar</button><button class="btn sm" data-no="${b.oportunidad_id}">Descartar</button>`
          : `${wa ? `<a class="btn sm primary" href="${wa}" target="_blank" rel="noopener">${ico("chat", 14)} WhatsApp</a>` : ""}<button class="btn sm" data-act="${b.oportunidad_id}" data-nom="${esc(b.contacto || b.empresa)}">${ico("call", 14)} Registrar</button><button class="btn sm ghost" data-lose="${b.oportunidad_id}" data-nom="${esc(b.contacto || b.empresa)}">Descartar</button>`}</div>
      </div>`; }).join("")}</div>`;
    const again = () => { viewBandeja(params); cargarAvisos(); };
    $$("[data-act]").forEach((x) => x.onclick = () => modalActividad(x.dataset.act, x.dataset.nom, again));
    $$("[data-lose]").forEach((x) => x.onclick = () => modalCerrar(x.dataset.lose, x.dataset.nom, "perdida", again));
    $$("[data-ok]").forEach((x) => x.onclick = async () => { x.disabled = true; try { await rpc("app_revisar_lead", { p: { oportunidad_id: x.dataset.ok, aprobar: true } }); toast("Aprobado · pasa a Por contactar"); again(); } catch (e) { toast(e.message, true); x.disabled = false; } });
    $$("[data-no]").forEach((x) => x.onclick = () => modalDescartarPre(x.dataset.no, again));
    clearInterval(viewBandeja._t); viewBandeja._t = setInterval(() => { if (!location.hash.startsWith("#/bandeja")) return clearInterval(viewBandeja._t); $$(".clock[data-m]").forEach((c) => { const n = +c.dataset.m + 1; c.dataset.m = n; c.innerHTML = clockTxt(n); c.className = "clock " + (n >= 5 ? "bad" : n >= 3 ? "warn" : ""); }); }, 60000);
  } catch (e) { $("#bl").innerHTML = fail(e); }
}
function clockTxt(m) { const [v, u] = m < 60 ? [Math.floor(m), "min"] : m < 1440 ? [Math.floor(m / 60), "horas"] : [Math.floor(m / 1440), "días"]; return `<div><b>${v}</b><small>${u}</small></div>`; }
function modalDescartarPre(id, after) {
  const root = modal("Descartar análisis", `<div class="field"><label for="dp-m">Motivo</label><select class="input" id="dp-m">${MOTIVOS.map(([v, t]) => `<option value="${v}" ${v === "no_califica" ? "selected" : ""}>${t}</option>`).join("")}</select></div>
    <div class="field"><label for="dp-n">Nota</label><input class="input" id="dp-n" placeholder="Opcional"></div>`, async () => {
    await rpc("app_revisar_lead", { p: { oportunidad_id: id, aprobar: false, motivo_codigo: $("#dp-m").value, nota: $("#dp-n").value.trim() || null } });
    toast("Descartado"); after && after();
  }, "Descartar");
}

/* ---------- conversaciones ---------- */
async function viewConversaciones() {
  setActive("conversaciones");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Conversaciones</h1><p>Los chats del WhatsApp único, con quién atiende cada uno: el asesor IA o una persona.</p></div></div>
    <div class="alert info">${ico("info", 18)}<div><b>Se activa al conectar WhatsApp Cloud API.</b> Cuando el número quede conectado en modo coexistencia, cada mensaje llegará aquí y podrás usar «Tomar conversación» y «Devolver al asesor». Mientras tanto, abajo están los leads de WhatsApp con su último mensaje registrado.</div></div>
    <div id="cv">${loading(4)}</div>`;
  try {
    const all = (await rpc("app_bandeja", { p_tipo: "entrantes" })).filter((b) => UNIDADES[b.unidad]?.b2c);
    $("#cv").innerHTML = `<section class="card"><div class="card-h"><h3>Leads B2C abiertos</h3><span class="badge">${all.length}</span><div class="r"><button class="btn sm" disabled>Tomar conversación</button><button class="btn sm" disabled>Devolver al asesor</button></div></div>
      ${all.length ? all.map((b) => { const wa = waLink(b.telefono); return `<div class="lead"><span class="avatar" style="background:var(--brand)">${esc(initials(b.contacto || b.empresa))}</span>
        <div><div class="t"><a href="#/cliente/${b.empresa_id}">${esc(b.contacto || b.empresa)}</a></div><div class="meta">${unidadPill(b.unidad)}<span>${hace(b.creado)}</span><span class="pill">Atiende: Felipe</span></div>${b.ultimo_mensaje ? `<div class="msg">${esc(b.ultimo_mensaje)}</div>` : ""}</div>
        <div class="acts">${wa ? `<a class="btn sm primary" href="${wa}" target="_blank" rel="noopener">${ico("chat", 14)} Abrir en WhatsApp</a>` : ""}</div></div>`; }).join("") : empty("chat", "Sin conversaciones abiertas")}</section>`;
  } catch (e) { $("#cv").innerHTML = fail(e); }
}

/* ---------- embudo ---------- */
async function viewEmbudo(u, flujo) {
  const unis = unidadesMias();
  u = unis.includes(u) ? u : (unis.includes("carclass") ? "carclass" : unis[0]);
  if (u === "nom") flujo = flujo === "comprador" ? "comprador" : "consignante"; else flujo = null;
  setActive("embudo", `Embudo · ${uName(u)}${flujo ? (flujo === "consignante" ? " · Consignantes" : " · Compradores") : ""}`);
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Embudo</h1><p>Arrastra una tarjeta para cambiar su etapa, o suéltala en «Ganada» o «Perdida». Cada gestión registrada avanza la etapa sola; nunca retrocede sin que tú lo decidas.</p></div>
      <div class="actions"><button class="btn primary" id="e-new">${ico("plus", 16)} Nuevo lead</button></div></div>
    <div class="tabs">${unis.map((x) => `<a href="#/embudo/${x}" class="${x === u ? "on" : ""}">${uName(x)}</a>`).join("")}</div>
    ${u === "nom" ? `<div class="seg"><button class="${flujo === "consignante" ? "on" : ""}" data-f="consignante">Consignantes</button><button class="${flujo === "comprador" ? "on" : ""}" data-f="comprador">Compradores</button></div>` : ""}
    <div id="kb">${loading(5)}</div>`;
  $("#e-new").onclick = () => modalLead({ unidad: u, flujo });
  $$("[data-f]").forEach((b) => b.onclick = () => (location.hash = `#/embudo/nom/${b.dataset.f}`));
  try {
    const d = await rpc("app_embudo", { p_unidad: u, p_flujo: flujo, p_por_columna: 50 });
    const cols = d.columnas || {}; const etapas = [...new Set(d.etapas || [])];
    const total = etapas.reduce((a, e) => a + (cols[e]?.total || 0), 0);
    $("#kb").innerHTML = `${!total ? `<div class="alert brand">${ico("info", 18)}<div>No hay oportunidades abiertas en ${esc(uName(u))}${flujo ? ` (${flujo === "consignante" ? "consignantes" : "compradores"})` : ""}. Los leads de WhatsApp, Meta y Google aparecerán en «Nuevo».</div></div>` : ""}
      <div class="kanban">${etapas.map((et) => { const c = cols[et] || { total: 0, items: [] }; return `<section class="col" data-etapa="${esc(et)}">
        <div class="col-h"><b>${esc(etapaTxt(et))}</b><span class="badge">${int(c.total)}</span>${c.monto ? `<span class="m">${clpM(c.monto)}</span>` : ""}</div>
        <div class="col-b">${(c.items || []).map((it) => `<article class="kcard" draggable="true" data-id="${it.id}" data-emp="${it.empresa_id}" data-fecha="${it.proxima_fecha || ""}" data-nom="${esc(it.empresa)}">
          <b>${esc(it.empresa)}</b>
          <div class="meta">${it.flota ? `<span>${int(it.flota)} veh.</span>` : ""}${it.comuna ? `<span>${esc(it.comuna)}</span>` : ""}${it.canal ? `<span>${esc(CANAL_TXT[it.canal] || it.canal)}</span>` : ""}${it.monto ? `<span class="num">${clpM(it.monto)}</span>` : ""}${it.sin_respuesta ? '<span class="pill bad">sin respuesta</span>' : ""}</div>
          <div class="next">${it.proxima_fecha ? `<span class="pill ${it.proxima_fecha < hoyISO() ? "bad" : it.proxima_fecha === hoyISO() ? "warn" : ""}">${fecha(it.proxima_fecha)}</span>` : '<span class="pill">sin fecha</span>'}<span>${esc(it.proxima_accion || hace(it.ultima))}</span></div>
        </article>`).join("")}${c.total > (c.items || []).length ? `<div class="col-more">y ${int(c.total - c.items.length)} más</div>` : ""}${!c.total ? '<div class="col-more">Sin oportunidades</div>' : ""}</div></section>`; }).join("")}</div>
      <div class="dropbar"><div class="dropzone win" data-cerrar="ganada">${ico("trophy", 16)} Soltar aquí: Ganada</div><div class="dropzone lose" data-cerrar="perdida">${ico("x", 16)} Soltar aquí: Perdida</div></div>`;
    let drag = null;
    $$(".kcard").forEach((k) => {
      k.ondragstart = (e) => { drag = k; k.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k.dataset.id); };
      k.ondragend = () => k.classList.remove("drag");
      k.onclick = () => (location.hash = "#/cliente/" + k.dataset.emp);
    });
    const zona = (el, onDrop) => { el.ondragover = (e) => { e.preventDefault(); el.classList.add("drop"); }; el.ondragleave = () => el.classList.remove("drop"); el.ondrop = (e) => { e.preventDefault(); el.classList.remove("drop"); if (drag) onDrop(drag); }; };
    $$(".col").forEach((col) => zona(col, async (card) => {
      if (card.closest(".col") === col) return;
      const prev = card.parentElement; col.querySelector(".col-b").prepend(card);
      try { await rpc("app_mover_etapa", { p: { oportunidad_id: card.dataset.id, etapa: col.dataset.etapa, proxima_fecha: card.dataset.fecha || masDias(2) } }); toast(`Movida a ${etapaTxt(col.dataset.etapa)}`); }
      catch (err) { prev.prepend(card); toast(err.message, true); }
    }));
    $$("[data-cerrar]").forEach((z) => zona(z, (card) => modalCerrar(card.dataset.id, card.dataset.nom, z.dataset.cerrar, () => viewEmbudo(u, flujo))));
  } catch (e) { $("#kb").innerHTML = fail(e); }
}

/* ---------- agenda ---------- */
async function viewAgenda(params) {
  setActive("agenda");
  const v = params.get("v") || "mes";
  const base = params.get("d") ? parseD(params.get("d")) : new Date();
  let d0, d1, titulo;
  if (v === "mes") { const a = new Date(base.getFullYear(), base.getMonth(), 1); const off = (a.getDay() + 6) % 7; d0 = new Date(a); d0.setDate(1 - off); d1 = new Date(d0); d1.setDate(d0.getDate() + 41); titulo = base.toLocaleDateString("es-CL", { month: "long", year: "numeric" }); }
  else if (v === "semana") { const off = (base.getDay() + 6) % 7; d0 = new Date(base); d0.setDate(base.getDate() - off); d1 = new Date(d0); d1.setDate(d0.getDate() + 6); titulo = `${d0.toLocaleDateString("es-CL", { day: "numeric", month: "short" })} – ${d1.toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}`; }
  else { d0 = new Date(base); d1 = new Date(base); titulo = base.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }); }
  const mover = (n) => { const x = new Date(base); if (v === "mes") x.setMonth(x.getMonth() + n); else x.setDate(x.getDate() + n * (v === "semana" ? 7 : 1)); return `#/agenda?v=${v}&d=${iso(x)}`; };
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Agenda</h1><p>Próximas acciones de cada oportunidad y tus tareas. A la derecha, las actividades que la agenda te propone.</p></div>
    <div class="actions"><button class="btn" id="a-t">${ico("plus", 16)} Nueva tarea</button></div></div>
    <div class="filters"><div class="seg">${[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"]].map(([k, t]) => `<button class="${v === k ? "on" : ""}" data-v="${k}">${t}</button>`).join("")}</div>
      <a class="btn sm icon" href="${mover(-1)}" aria-label="Anterior">${ico("left", 16)}</a><a class="btn sm" href="#/agenda?v=${v}">Hoy</a><a class="btn sm icon" href="${mover(1)}" aria-label="Siguiente">${ico("right", 16)}</a>
      <b style="font-size:15px">${esc(titulo.charAt(0).toUpperCase() + titulo.slice(1))}</b></div>
    <div class="grid-main"><section class="card" id="cal">${loading(6)}</section>
      <div class="stack"><section class="card" id="venc-c" hidden><div class="card-h"><h3>Atrasadas</h3><span class="badge bad" id="venc-n"></span></div><div id="venc"></div></section>
        <section class="card"><div class="card-h"><h3>Sugerencias</h3><span class="badge" id="sg-n"></span></div><div id="sg">${loading(3)}</div></section>
        <div class="alert info">${ico("cal", 18)}<div><b>Google Calendar: pendiente de conectar.</b> Cuando lo conectemos, tus reuniones aparecerán aquí y lo que agendes en Core quedará en tu calendario, en ambos sentidos.</div></div></div></div>`;
  $$("[data-v]").forEach((b) => b.onclick = () => (location.hash = `#/agenda?v=${b.dataset.v}&d=${iso(base)}`));
  $("#a-t").onclick = () => modalTarea(() => viewAgenda(params));
  const evHtml = (e) => `<a class="ev ${e.tipo} ${e.fecha < hoyISO() ? "past" : ""}" href="${e.empresa_id ? "#/cliente/" + e.empresa_id : "#/tareas"}" style="${e.tipo === "accion" ? `--c:${UNIDADES[e.unidad]?.c || "var(--brand)"}` : ""}" title="${esc(`${e.titulo} · ${e.cliente || ""}`)}">${esc(e.titulo)}${e.cliente ? ` · ${esc(e.cliente)}` : ""}</a>`;
  try {
    const evs = await rpc("app_agenda", { p_desde: iso(d0), p_hasta: iso(d1) });
    const por = {}; evs.forEach((e) => (por[e.fecha] ||= []).push(e));
    if (v === "dia") {
      const l = por[iso(base)] || [];
      $("#cal").innerHTML = `<div class="card-b dayview">${l.length ? l.map((e) => `${evHtml(e)}`).join("") : empty("cal", "Nada agendado para este día")}</div>`;
    } else {
      const dias = []; for (let x = new Date(d0); x <= d1; x.setDate(x.getDate() + 1)) dias.push(new Date(x));
      $("#cal").innerHTML = `<div class="cal ${v === "semana" ? "week" : ""}">${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((x) => `<div class="dow">${x}</div>`).join("")}
        ${dias.map((x) => { const k = iso(x), l = por[k] || [], max = v === "mes" ? 3 : 12; return `<div class="day ${v === "mes" && x.getMonth() !== base.getMonth() ? "out" : ""} ${k === hoyISO() ? "today" : ""}"><a class="n" href="#/agenda?v=dia&d=${k}">${x.getDate()}</a>${l.slice(0, max).map(evHtml).join("")}${l.length > max ? `<a class="faint" style="font-size:11px" href="#/agenda?v=dia&d=${k}">+${l.length - max} más</a>` : ""}</div>`; }).join("")}</div>`;
    }
  } catch (e) { $("#cal").innerHTML = fail(e); }
  try {
    const ve = (await rpc("app_agenda", { p_desde: masDias(-365), p_hasta: masDias(-1) })).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (ve.length) {
      $("#venc-c").hidden = false; $("#venc-n").textContent = ve.length;
      $("#venc").innerHTML = `<div class="card-b" style="display:grid;gap:6px">${ve.slice(0, 8).map((e) => `<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:8px"><span style="min-width:0;flex:1">${evHtml(e)}</span><span class="pill bad">${fecha(e.fecha)}</span></div>`).join("")}${ve.length > 8 ? `<div class="faint" style="font-size:12px">y ${ve.length - 8} más. Registra una gestión en cada una para darle nueva fecha.</div>` : ""}</div>`;
    }
  } catch {}
  try {
    const sg = await rpc("app_sugerencias");
    $("#sg-n").textContent = sg.length || "";
    const icS = { tras_cotizar: "call", detenido: "clock", mensual: "users" };
    $("#sg").innerHTML = sg.length ? sg.map((s, i) => `<div class="sug"><span class="ic">${ico(icS[s.tipo] || "spark", 16)}</span><div><div style="font-weight:600;font-size:13px">${esc(s.titulo)}</div><div class="muted" style="font-size:12.5px"><a href="#/cliente/${s.empresa_id}">${esc(s.cliente)}</a> · ${esc(uName(s.unidad))} · ${esc(etapaTxt(s.etapa))} · ${s.desde ? "última gestión " + hace(s.desde) : "sin gestiones"}</div></div><button class="btn sm" data-sg="${i}">Agendar mañana</button></div>`).join("")
      : `<div class="card-b muted" style="font-size:13px">Sin sugerencias. La agenda propone llamar 2 días después de cotizar, retomar lo detenido 14 días y el contacto mensual con clientes.</div>`;
    $$("[data-sg]").forEach((b) => b.onclick = async () => {
      const s = sg[b.dataset.sg]; b.disabled = true;
      try { await rpc("app_crear_tarea", { p: { titulo: `${s.titulo} · ${s.cliente}`, unidad: s.unidad, vence: masDias(1), prioridad: "media", empresa_id: s.empresa_id, responsable: (ME.nombre || "").split(" ")[0] || null } }); toast("Tarea creada para mañana"); b.textContent = "Agendada"; }
      catch (e) { toast(e.message, true); b.disabled = false; }
    });
  } catch (e) { $("#sg").innerHTML = `<div class="card-b err">${esc(e.message)}</div>`; }
}

/* ---------- cotizaciones ---------- */
async function viewCotizaciones() {
  setActive("cotizaciones");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Cotizaciones</h1><p>Cotizaciones de Carclass y BlackGPS: banda de precio, PDF, link público y estado «vista».</p></div>
    <div class="actions"><button class="btn primary" disabled title="Falta cargar la lista de precios vigente">${ico("plus", 16)} Nueva cotización</button></div></div>
    <div class="alert info">${ico("info", 18)}<div><b>El cotizador necesita la lista de precios vigente</b> (cerámico, láminas y PPF por tamaño de auto). Con esa lista se activan la banda de precio, el PDF y el link público que avisa cuando el cliente abre la cotización.</div></div>
    <div id="ql">${loading(4)}</div>`;
  try {
    const q = await rpc("app_cotizaciones");
    const est = { borrador: "", enviada: "info", vista: "gold", aceptada: "ok", rechazada: "bad", vencida: "warn" };
    $("#ql").innerHTML = `<section class="card">${q.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Unidad</th><th class="num">Neto</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody>
      ${q.map((x) => `<tr class="click" data-emp="${x.empresa_id || ""}"><td class="name">${esc(x.numero || "—")}</td><td>${fecha(x.fecha)}</td><td>${esc(x.cliente || "—")}</td><td>${unidadPill(x.unidad)}</td><td class="num">${clp(x.neto)}</td><td>${fecha(x.vigencia)}</td><td><span class="pill ${est[x.estado] || ""}">${esc(x.estado)}</span></td><td>${x.pdf_url ? `<a class="btn sm" href="${esc(x.pdf_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">PDF</a>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : empty("doc", "Sin cotizaciones")}</section>`;
    $$("#ql tr[data-emp]").forEach((tr) => tr.dataset.emp && (tr.onclick = () => (location.hash = "#/cliente/" + tr.dataset.emp)));
  } catch (e) { $("#ql").innerHTML = fail(e); }
}

/* ---------- clientes ---------- */
async function viewClientes(params) {
  const q = params.get("q") || "", f = params.get("f") || "", pg = Number(params.get("p") || 0);
  setActive("clientes");
  if ($("#q")) $("#q").value = q;
  const link = (o) => { const p = new URLSearchParams({ q, f, p: pg, ...o }); [...p.keys()].forEach((k) => (!p.get(k) || p.get(k) === "0") && p.delete(k)); return "#/clientes?" + p; };
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Clientes</h1><p>Personas y empresas de todas las unidades. Una sola ficha por RUT o por teléfono.</p></div>
    <div class="actions"><button class="btn primary" id="c-new">${ico("plus", 16)} Nuevo lead</button></div></div>
    <div class="filters"><form id="f-cli" style="flex:1 1 280px;max-width:420px"><input class="input" id="cli-q" type="search" placeholder="Nombre, RUT, rubro o comuna" value="${esc(q)}" aria-label="Buscar"></form>
      <div class="chips">${[["", "Todos"], ["personas", "Personas"], ["clientes", "Clientes"], ["prospectos", "Prospectos"]].map(([k, t]) => `<a class="chip ${f === k ? "on" : ""}" href="${link({ f: k, p: 0 })}">${t}</a>`).join("")}</div></div>
    <div id="cl">${loading(10)}</div>`;
  $("#c-new").onclick = () => modalLead();
  $("#f-cli").onsubmit = (e) => { e.preventDefault(); location.hash = link({ q: $("#cli-q").value.trim(), p: 0 }); };
  try {
    const d = await rpc("app_empresas", { p_q: q || null, p_filtro: f || null, p_pagina: pg });
    const pages = Math.ceil(d.total / 50);
    $("#cl").innerHTML = d.filas.length ? `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Cliente</th><th>RUT</th><th>Contacto</th><th>Ubicación</th><th class="num">Flota</th><th>Unidades</th><th>Estado</th></tr></thead><tbody>
      ${d.filas.map((r) => `<tr class="click" data-id="${r.id}"><td><div class="name">${esc(r.nombre)}</div><div class="sub">${r.tipo === "persona" ? "Persona" : esc(r.rubro || "Empresa")}</div></td>
        <td class="num" style="text-align:left">${esc(fmtRut(r.rut)) || '<span class="faint">—</span>'}</td><td><div>${esc(r.telefono || "")}</div><div class="sub">${esc(r.email || "")}</div></td><td>${esc([r.comuna, r.region].filter(Boolean).join(", ") || "—")}</td>
        <td class="num">${r.flota ? int(r.flota) : "—"}</td><td>${(r.unidades || "").split(",").filter(Boolean).map(unidadPill).join(" ")}</td>
        <td>${r.cliente ? '<span class="pill ok">Cliente</span>' : r.etapa ? `<span class="pill">${esc(etapaTxt(r.etapa))}</span>` : '<span class="faint">—</span>'}</td></tr>`).join("")}
      </tbody></table></div><div class="pager"><span>${int(d.total)} registros · página ${pg + 1} de ${Math.max(pages, 1)}</span>${pg > 0 ? `<a class="btn sm" href="${link({ p: pg - 1 })}">Anterior</a>` : ""}${pg + 1 < pages ? `<a class="btn sm" href="${link({ p: pg + 1 })}">Siguiente</a>` : ""}</div></section>`
      : `<div class="card">${empty("search", "Sin resultados", "Prueba con otro nombre o con el RUT sin puntos.")}</div>`;
    $$("#cl tr[data-id]").forEach((tr) => tr.onclick = () => (location.hash = "#/cliente/" + tr.dataset.id));
  } catch (e) { $("#cl").innerHTML = fail(e); }
}

/* ---------- ficha 360 ---------- */
async function viewCliente(id) {
  setActive("clientes", "Ficha del cliente");
  const P = $("#page"); P.innerHTML = loading(8);
  try {
    const d = await rpc("app_ficha", { p_id: id });
    if (!d) { P.innerHTML = `<div class="card">${empty("users", "Cliente no encontrado")}</div>`; return; }
    const e = d.empresa; const persona = e.tipo === "persona";
    setActive("clientes", e.nombre);
    const c0 = d.contactos.find((c) => c.decisor) || d.contactos[0];
    const tel = c0?.telefono || e.telefono; const wa = waLink(tel);
    const abiertas = d.oportunidades.filter((o) => o.estado === "abierta");
    P.innerHTML = `
    <div class="ficha-head"><div class="av">${esc(initials(e.nombre))}</div>
      <div class="info"><div class="faint" style="font-size:12.5px">${persona ? "Persona" : "Empresa"} · creada ${fecha(e.creado_en)}${e.origen ? ` · origen ${esc(CANAL_TXT[e.origen] || e.origen)}` : ""}</div><h1>${esc(e.nombre)}</h1>
        <div class="facts">${e.rut ? `<span>RUT <b>${esc(fmtRut(e.rut))}</b></span>` : ""}${e.rubro ? `<span>${esc(e.rubro)}</span>` : ""}${e.tamano_flota ? `<span><b>${int(e.tamano_flota)}</b> vehículos</span>` : ""}${e.comuna || e.region ? `<span>${esc([e.comuna, e.region].filter(Boolean).join(", "))}</span>` : ""}${tel ? `<a href="tel:${esc(tel)}">${esc(tel)}</a>` : ""}${e.email ? `<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>` : ""}</div></div>
      <div class="actions row" style="gap:8px">${wa ? `<a class="btn primary" href="${wa}" target="_blank" rel="noopener">${ico("chat", 16)} WhatsApp</a>` : ""}<button class="btn" id="f-tarea">${ico("tasks", 16)} Nueva tarea</button><button class="btn" id="f-lead">${ico("plus", 16)} Nueva oportunidad</button></div></div>
    <div class="grid-main">
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Oportunidades</h3><span class="badge">${d.oportunidades.length}</span></div>
          <div class="card-b" style="display:grid;gap:12px">${d.oportunidades.length ? d.oportunidades.map(oppCard).join("") : `<div class="muted">Sin oportunidades. Usa «Nueva oportunidad».</div>`}</div></section>
        <section class="card"><div class="card-h"><h3>Bitácora</h3></div>
          <div class="card-b composer">${abiertas.length ? `
            <div class="seg" id="bt-tipo">${[["nota", "note", "Nota"], ["llamada", "call", "Llamada"], ["whatsapp", "chat", "WhatsApp"], ["correo", "mail", "Correo"], ["reunion", "meet", "Reunión"]].map(([k, i, t], n) => `<button type="button" class="${n === 0 ? "on" : ""}" data-v="${k}">${t}</button>`).join("")}</div>
            <textarea class="input" id="bt-nota" placeholder="Qué pasó, con quién hablaste, qué pidió"></textarea>
            <div class="row">${abiertas.length > 1 ? `<div class="field"><label for="bt-op">Oportunidad</label><select class="input" id="bt-op">${abiertas.map((o) => `<option value="${o.id}">${esc(uName(o.unidad))} · ${esc(etapaTxt(o.etapa))}</option>`).join("")}</select></div>` : `<input type="hidden" id="bt-op" value="${abiertas[0].id}">`}
              <div class="field"><label for="bt-res">Resultado</label><select class="input" id="bt-res">${RESULTADOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div></div>
            <div class="row"><div class="field"><label for="bt-acc">Próxima acción</label><input class="input" id="bt-acc" placeholder="Ej: enviar cotización, volver a llamar"></div><div class="field" style="flex:0 1 170px"><label for="bt-f">Fecha</label><input class="input" id="bt-f" type="date" value="${masDias(2)}"></div></div>
            <div class="row" style="justify-content:space-between;align-items:center"><button type="button" class="btn sm ghost" disabled title="Se activa al habilitar el almacenamiento de archivos">${ico("clip", 15)} Adjuntar</button><button class="btn primary" id="bt-save">Guardar en bitácora</button></div><div class="err" id="bt-err"></div>`
            : `<div class="muted" style="font-size:13px">Para registrar gestiones abre una oportunidad con «Nueva oportunidad».</div>`}
          </div>
          <div class="card-b timeline" style="border-top:1px solid var(--border)">${d.actividades.length ? d.actividades.map((a) => `<div class="tl ${a.tipo === "sistema" ? "sys" : ""}"><span class="ic">${ico(tipoIco[a.tipo] || "dot", 15)}</span><div><div class="t">${a.tipo === "sistema" ? `<span class="muted">${esc(prettySistema(a.nota))}</span>` : `<b style="text-transform:capitalize">${esc(a.tipo === "reunion" ? "reunión" : a.tipo)}</b>${a.resultado ? ` · ${esc((RESULTADOS.find((r) => r[0] === a.resultado) || [0, a.resultado.replace(/_/g, " ")])[1])}` : ""}${a.nota ? `<div class="muted">${esc(a.nota)}</div>` : ""}`}</div><div class="d">${fechaHora(a.fecha)} · ${esc(a.autor || "")}</div></div></div>`).join("") : '<div class="muted">Sin gestiones todavía.</div>'}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Contacto</h3></div><div class="card-b">${d.contactos.length ? d.contactos.map((c) => `<dl class="kv" style="margin-bottom:12px"><dt>Nombre</dt><dd><b>${esc(c.nombre)}</b>${c.decisor ? ' <span class="pill gold">decide</span>' : ""}</dd>${c.cargo ? `<dt>Cargo</dt><dd>${esc(c.cargo)}</dd>` : ""}${c.telefono ? `<dt>Teléfono</dt><dd><a href="tel:${esc(c.telefono)}">${esc(c.telefono)}</a></dd>` : ""}${c.email ? `<dt>Correo</dt><dd>${esc(c.email)}</dd>` : ""}</dl>`).join("") : `<dl class="kv">${tel ? `<dt>Teléfono</dt><dd><a href="tel:${esc(tel)}">${esc(tel)}</a></dd>` : ""}${e.email ? `<dt>Correo</dt><dd>${esc(e.email)}</dd>` : ""}${!tel && !e.email ? '<dd class="muted">Sin datos de contacto.</dd>' : ""}</dl>`}</div></section>
        ${d.vehiculos?.length ? `<section class="card"><div class="card-h"><h3>Vehículos</h3><span class="badge">${d.vehiculos.length}</span></div><div class="card-b" style="display:grid;gap:10px">${d.vehiculos.map((v) => `<div><b>${esc([v.marca, v.modelo].filter(Boolean).join(" ") || "Vehículo")}</b> ${v.anio ? `<span class="muted">${v.anio}</span>` : ""}<div class="muted" style="font-size:12.5px">${[v.patente, v.km ? int(v.km) + " km" : "", v.modalidad, v.estado].filter(Boolean).map(esc).join(" · ")}</div></div>`).join("")}</div></section>` : ""}
        ${d.tareas?.length ? `<section class="card"><div class="card-h"><h3>Tareas pendientes</h3><span class="badge">${d.tareas.length}</span></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${d.tareas.map((t) => `<div class="row" style="justify-content:space-between"><span>${esc(t.titulo)}</span><span class="pill ${t.vence && t.vence < hoyISO() ? "bad" : ""}">${fecha(t.vence)}</span></div>`).join("")}</div></section>` : ""}
        ${d.cotizaciones?.length ? `<section class="card"><div class="card-h"><h3>Cotizaciones</h3></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${d.cotizaciones.map((q) => `<div class="row" style="justify-content:space-between"><span>${esc(q.numero || "s/n")} · ${fecha(q.fecha)}</span><span>${clp(q.neto)} <span class="pill">${esc(q.estado)}</span></span></div>`).join("")}</div></section>` : ""}
        ${d.contratos.length ? `<section class="card"><div class="card-h"><h3>Contrato BlackGPS</h3></div><div class="card-b">${d.contratos.map((g) => `<dl class="kv"><dt>Estado</dt><dd><span class="pill ${g.estado === "activo" ? "ok" : "warn"}">${esc(g.estado)}</span></dd><dt>Equipos</dt><dd>${int(g.equipos)}</dd>${g.valor_mensual ? `<dt>Mensual</dt><dd>${clp(g.valor_mensual)}</dd>` : ""}${g.plan ? `<dt>Plan</dt><dd>${esc(g.plan)}</dd>` : ""}${g.inicio ? `<dt>Desde</dt><dd>${fecha(g.inicio)}</dd>` : ""}</dl>`).join("")}</div></section>` : ""}
        ${d.ventas ? `<section class="card"><div class="card-h"><h3>Ventas</h3><span class="badge">${d.ventas.length}</span></div>${d.ventas.length ? `<div class="card-b" style="display:grid;gap:8px;font-size:13px">${d.ventas.map((v) => `<div class="row" style="justify-content:space-between"><span>${fecha(v.fecha)} · ${esc(v.descripcion || uName(v.unidad))}</span><span class="num"><b>${clp(v.monto)}</b> <span class="pill ${v.cobro === "cobrado" ? "ok" : "warn"}">${v.cobro === "cobrado" ? "cobrada" : esc(v.cobro)}</span></span></div>`).join("")}</div>` : '<div class="card-b muted">Sin ventas registradas.</div>'}</section>` : ""}
        ${d.analisis.length ? `<section class="card"><div class="card-h"><h3>Análisis</h3></div><div class="card-b" style="display:grid;gap:12px">${d.analisis.map((a) => `<div style="display:grid;gap:6px"><div class="row" style="gap:6px">${unidadPill(a.unidad)}${a.pilar ? `<span class="pill gold">${esc(a.pilar)}</span>` : ""}${a.score != null ? `<span class="pill">calce ${a.score}</span>` : ""}<span class="faint" style="font-size:12px">${fecha(a.fecha)}</span></div>${a.resumen ? `<div style="font-size:13px">${esc(a.resumen)}</div>` : ""}</div>`).join("")}</div></section>` : ""}
      </div>
    </div>`;
    const again = () => viewCliente(id);
    $("#f-tarea").onclick = () => modalTarea(again, { empresa_id: e.id, unidad: abiertas[0]?.unidad });
    $("#f-lead").onclick = () => modalLead({ nombre: c0?.nombre || (persona ? e.nombre : ""), empresa: persona ? "" : e.nombre, rut: e.rut, telefono: tel, email: c0?.email || e.email });
    $$("[data-ganar]").forEach((b) => b.onclick = () => modalCerrar(b.dataset.ganar, e.nombre, "ganada", again));
    $$("[data-perder]").forEach((b) => b.onclick = () => modalCerrar(b.dataset.perder, e.nombre, "perdida", again));
    $$("[data-asisma]").forEach((b) => b.onclick = () => modalAsisma(b.dataset.asisma));
    $$("select[data-etapa]").forEach((s) => s.onchange = async () => {
      try { await rpc("app_mover_etapa", { p: { oportunidad_id: s.dataset.etapa, etapa: s.value, proxima_fecha: s.dataset.fecha || masDias(2) } }); toast("Etapa actualizada"); again(); }
      catch (err) { toast(err.message, true); }
    });
    if ($("#bt-tipo")) {
      const seg = $("#bt-tipo"); $$("button", seg).forEach((b) => b.onclick = () => { $$("button", seg).forEach((x) => x.classList.remove("on")); b.classList.add("on"); });
      $("#bt-save").onclick = async () => {
        const tipo = $("#bt-tipo button.on").dataset.v, nota = $("#bt-nota").value.trim();
        if (!nota && tipo === "nota") { $("#bt-err").textContent = "Escribe la nota."; return; }
        const b = $("#bt-save"); b.disabled = true; $("#bt-err").textContent = "";
        try {
          const r = await rpc("app_registrar_actividad", { p: { oportunidad_id: $("#bt-op").value, tipo, resultado: $("#bt-res").value || null, nota: nota || null, proxima_accion: $("#bt-acc").value.trim() || null, proxima_fecha: $("#bt-f").value || null } });
          toast(r.etapa !== r.etapa_anterior ? `Guardado · avanzó a ${etapaTxt(r.etapa)}` : r.estado === "perdida" ? "Guardado · oportunidad perdida" : "Guardado en bitácora");
          again(); cargarAvisos();
        } catch (err) { $("#bt-err").textContent = err.message; b.disabled = false; }
      };
    }
  } catch (err) { P.innerHTML = fail(err); }
}
const prettySistema = (n) => String(n || "").replace(/Etapa (\w+) → (\w+) \((\w+)\)/, (_, a, b, s) => a === b ? `Estado: ${s}` : `Etapa ${etapaTxt(a)} → ${etapaTxt(b)}${s !== "abierta" ? ` (${s})` : ""}`);
function oppCard(o) {
  const et = o.etapas || []; const idx = et.indexOf(o.etapa); const abierta = o.estado === "abierta";
  const mot = MOTIVOS.find((m) => m[0] === o.motivo_codigo)?.[1];
  return `<div class="opp"><div class="opp-top">${unidadPill(o.unidad)}${o.flujo ? `<span class="pill">${esc(o.flujo)}</span>` : ""}
    ${abierta ? `<select class="input" style="width:auto;height:32px;font-size:12.5px" data-etapa="${o.id}" data-fecha="${o.proxima_fecha || ""}" aria-label="Etapa">${[...new Set([...et, o.etapa])].map((x) => `<option value="${esc(x)}" ${x === o.etapa ? "selected" : ""}>${esc(etapaTxt(x))}</option>`).join("")}</select>`
      : `<span class="pill ${o.estado === "ganada" ? "ok" : "bad"}">${esc(o.estado)}</span>`}
    ${o.asisma_id ? `<span class="pill gold">Asisma ${esc(o.asisma_id)}</span>` : ""}${o.canal ? `<span class="faint" style="font-size:12px">${esc(CANAL_TXT[o.canal] || o.canal)}${o.campana ? " · " + esc(o.campana) : ""}</span>` : ""}
    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${abierta ? `<button class="btn sm" data-ganar="${o.id}">${ico("trophy", 14)} Ganada</button><button class="btn sm ghost danger" data-perder="${o.id}">Perdida</button>` : ""}${abierta && ["blackgps", "somosb2b"].includes(o.unidad) ? `<button class="btn sm" data-asisma="${o.id}">Ficha Asisma</button>` : ""}</span></div>
    ${idx >= 0 ? `<div class="steps" style="--c:${UNIDADES[o.unidad]?.c}" title="${esc(et.map(etapaTxt).join(" → "))}">${et.map((_, i) => `<i class="${i <= idx && abierta ? "done" : o.estado === "ganada" ? "done" : ""}"></i>`).join("")}</div>` : ""}
    <div class="muted" style="font-size:13px">${abierta ? `${o.proxima_fecha ? `<b style="color:${o.proxima_fecha < hoyISO() ? "var(--bad)" : "var(--fg)"}">${fecha(o.proxima_fecha)}</b> · ` : ""}${esc(o.proxima_accion || "Sin próxima acción definida")}` : esc([mot, o.motivo].filter(Boolean).join(" · "))}${o.monto ? ` · ${clp(o.monto)}` : ""}</div></div>`;
}

/* ---------- vehículos ---------- */
async function viewVehiculos(params) {
  setActive("vehiculos");
  const f = params.get("f") || "stock";
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Vehículos</h1><p>Stock de NOM en consignación y compra directa, y autos de clientes de Carclass.</p></div></div>
    <div class="tabs">${[["stock", "Stock NOM"], ["clientes", "Autos de clientes"], ["todos", "Todos"]].map(([k, t]) => `<a href="#/vehiculos?f=${k}" class="${f === k ? "on" : ""}">${t}</a>`).join("")}</div><div id="vl">${loading(5)}</div>`;
  try {
    let v = await rpc("app_vehiculos");
    if (f === "stock") v = v.filter((x) => ["consignacion", "compra_directa"].includes(x.modalidad) && !["retirado", "vendido"].includes(x.estado));
    if (f === "clientes") v = v.filter((x) => x.modalidad === "cliente");
    const est = { disponible: "ok", publicado: "ok", evaluacion: "info", reservado: "gold", vendido: "", retirado: "" };
    $("#vl").innerHTML = `<section class="card">${v.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vehículo</th><th>Patente</th><th class="num">Año</th><th class="num">Km</th><th>Modalidad</th><th>Dueño</th><th class="num">Precio publicado</th><th>Ingreso</th><th>Estado</th></tr></thead><tbody>
      ${v.map((x) => `<tr class="${x.dueno_id ? "click" : ""}" data-emp="${x.dueno_id || ""}"><td class="name">${esc([x.marca, x.modelo, x.version].filter(Boolean).join(" ") || "—")}</td><td>${esc(x.patente || "—")}</td><td class="num">${x.anio || "—"}</td><td class="num">${x.km ? int(x.km) : "—"}</td><td>${esc((x.modalidad || "").replace("_", " "))}</td><td>${esc(x.dueno || "—")}</td><td class="num">${clp(x.precio_publicado)}</td><td>${fecha(x.fecha_ingreso)}</td><td><span class="pill ${est[x.estado] ?? ""}">${esc(x.estado || "—")}</span></td></tr>`).join("")}
      </tbody></table></div>` : empty("car", "Sin vehículos en esta vista")}</section>
      <p class="faint" style="font-size:12px;margin:0">Inspección con fotos y reporte al consignante: próxima iteración del módulo.</p>`;
    $$("#vl tr[data-emp]").forEach((tr) => tr.dataset.emp && (tr.onclick = () => (location.hash = "#/cliente/" + tr.dataset.emp)));
  } catch (e) { $("#vl").innerHTML = fail(e); }
}

/* ---------- tareas y postventa ---------- */
async function viewTareas(params) {
  setActive("tareas");
  const f = params.get("f") || "pendientes";
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Tareas y postventa</h1><p>Lo que hay que hacer, de todas las unidades. Al ganar una venta B2C se crean solos los seguimientos de 48 horas, 5 días, 30 días y 6 meses.</p></div>
    <div class="actions"><button class="btn primary" id="t-new">${ico("plus", 16)} Nueva tarea</button></div></div>
    <div class="tabs">${[["pendientes", "Pendientes"], ["postventa", "Postventa"], ["hechas", "Hechas"]].map(([k, t]) => `<a href="#/tareas?f=${k}" class="${f === k ? "on" : ""}">${t}</a>`).join("")}</div><div id="tl">${loading(5)}</div>`;
  $("#t-new").onclick = () => modalTarea(() => viewTareas(params));
  try {
    let ts = await rpc("app_tareas", { p_estado: f === "hechas" ? "hecha" : "pendiente,en_curso" });
    if (f === "postventa") ts = ts.filter((t) => t.origen === "postventa_auto");
    if (f === "hechas") ts = ts.slice(0, 100);
    const hoy = hoyISO();
    const grupos = f === "hechas" ? [["Completadas", ts]] : [["Vencidas", ts.filter((t) => t.vence && t.vence < hoy)], ["Hoy", ts.filter((t) => t.vence === hoy)], ["Próximas", ts.filter((t) => t.vence && t.vence > hoy)], ["Sin fecha", ts.filter((t) => !t.vence)]].filter(([, l]) => l.length);
    $("#tl").innerHTML = grupos.length && ts.length ? grupos.map(([g, l]) => `<section class="card"><div class="card-h"><h3>${g}</h3><span class="badge ${g === "Vencidas" ? "bad" : ""}">${l.length}</span></div>
      ${l.map((t) => `<div class="task ${f === "hechas" ? "hecha" : ""}"><button class="check" ${f === "hechas" ? "disabled" : `data-done="${t.id}"`} aria-label="Marcar hecha">${f === "hechas" ? ico("check", 13) : ""}</button>
        <div><div class="t" style="font-weight:600">${esc(t.titulo)}</div><div class="muted" style="font-size:12.5px">${[uName(t.unidad), t.responsable, t.empresa ? `<a href="#/cliente/${t.empresa_id}">${esc(t.empresa)}</a>` : "", t.origen === "postventa_auto" ? "postventa automática" : t.origen && t.origen !== ME.email ? "creada por " + esc(t.origen) : ""].filter(Boolean).join(" · ")}</div>${t.descripcion ? `<div class="muted" style="font-size:13px;margin-top:4px">${esc(t.descripcion)}</div>` : ""}</div>
        <div style="text-align:right;display:grid;gap:4px;justify-items:end">${t.vence ? `<span class="pill ${f !== "hechas" && t.vence < hoy ? "bad" : t.vence === hoy ? "warn" : ""}">${fecha(t.vence)}</span>` : ""}${t.prioridad === "alta" ? '<span class="pill bad">alta</span>' : ""}</div></div>`).join("")}</section>`).join("")
      : `<div class="card">${empty("tasks", f === "postventa" ? "Sin seguimientos de postventa" : "Sin tareas", f === "postventa" ? "Se crean solos al marcar como ganada una venta de Carclass, Carwash.hf o NOM." : "Crea una o pídele a un agente que la registre.")}</div>`;
    $$("[data-done]").forEach((b) => b.onclick = async () => {
      const row = b.closest(".task"); row.classList.add("hecha"); b.innerHTML = ico("check", 13);
      try { await rpc("app_tarea_estado", { p_id: b.dataset.done, p_estado: "hecha" }); toast("Tarea completada"); cargarAvisos(); setTimeout(() => viewTareas(params), 500); }
      catch (e) { row.classList.remove("hecha"); b.innerHTML = ""; toast(e.message, true); }
    });
  } catch (e) { $("#tl").innerHTML = fail(e); }
}

/* ---------- finanzas ---------- */
async function viewFinanzas() {
  setActive("finanzas");
  const P = $("#page");
  if (!ME.ve_finanzas) { P.innerHTML = `<div class="card">${empty("chart", "Sin acceso", "Esta sección es solo para el dueño.")}</div>`; return; }
  P.innerHTML = `<div class="page-head"><div><h1>Ventas y márgenes</h1><p>Venta cerrada por su monto real con IVA, menos sus costos asociados. Venta cerrada no es venta cobrada.</p></div></div>${loading(8)}`;
  try {
    const d = await rpc("app_finanzas", { p_meses: 12 });
    const tot = (k) => d.pnl.reduce((a, r) => a + Number(r[k] || 0), 0);
    const porU = {}; d.pnl.forEach((r) => { const x = (porU[r.unidad] ||= { ventas: 0, costos: 0, margen: 0, n: 0 }); x.ventas += +r.ventas; x.costos += +r.costos; x.margen += +r.margen; x.n += +(r.n || 0); });
    const meses = [...new Set(d.pnl.map((r) => r.mes))].sort().reverse();
    const pend = d.ventas.filter((v) => v.cobro !== "cobrado").reduce((a, v) => a + Number(v.monto), 0);
    P.innerHTML = `<div class="page-head"><div><h1>Ventas y márgenes</h1><p>Últimos 12 meses. Montos con IVA; el neto se calcula aparte.</p></div>
      <div class="actions"><button class="btn" id="fx">${ico("dl", 16)} Exportar ventas</button></div></div>
    <div class="kpis">
      <div class="kpi"><div class="top-row"><span class="l">Ventas 12 meses</span><span class="ki gold">${ico("money", 17)}</span></div><span class="v">${clpM(tot("ventas"))}</span><span class="s">neto ${clpM(tot("ventas_neto"))}</span></div>
      <div class="kpi"><div class="top-row"><span class="l">Margen 12 meses</span><span class="ki">${ico("chart", 17)}</span></div><span class="v">${clpM(tot("margen"))}</span><span class="s">${tot("ventas") ? Math.round((tot("margen") / tot("ventas")) * 100) : 0}% sobre ventas</span></div>
      <div class="kpi"><div class="top-row"><span class="l">MRR BlackGPS</span><span class="ki">${ico("spark", 17)}</span></div><span class="v">${clpM(d.mrr?.mrr)}</span><span class="s">${int(d.mrr?.equipos_activos)} equipos · ${int(d.mrr?.clientes_activos)} clientes</span></div>
      <div class="kpi"><div class="top-row"><span class="l">Por cobrar</span><span class="ki">${ico("clock", 17)}</span></div><span class="v ${pend ? "warn" : ""}">${clpM(pend)}</span><span class="s">en las últimas ventas</span></div>
    </div>
    <section class="card"><div class="card-h"><h3>Por unidad</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Unidad</th><th class="num">Ventas</th><th class="num">Costos directos</th><th class="num">Margen</th><th class="num">%</th><th style="width:28%"></th></tr></thead><tbody>
      ${Object.entries(porU).sort((a, b) => b[1].ventas - a[1].ventas).map(([u, x]) => `<tr><td>${unidadPill(u)}</td><td class="num">${clp(x.ventas)}</td><td class="num">${clp(x.costos)}</td><td class="num">${clp(x.margen)}</td><td class="num">${x.ventas ? Math.round((x.margen / x.ventas) * 100) : 0}%</td>
        <td><div class="bar-track"><i style="width:${x.ventas ? Math.max(0, (x.margen / x.ventas) * 100) : 0}%;background:${UNIDADES[u]?.c}"></i></div></td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><div class="card-h"><h3>Mes a mes</h3><span class="r faint" style="font-size:12px">un mes sin costos registrados muestra un margen inflado</span></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mes</th><th>Unidad</th><th class="num">Ventas</th><th class="num">Costos</th><th class="num">Margen</th><th class="num">Gastos</th><th class="num">Resultado</th></tr></thead><tbody>
      ${meses.map((m) => d.pnl.filter((r) => r.mes === m).map((r, i) => `<tr><td style="text-transform:capitalize">${i === 0 ? new Date(m + "-15").toLocaleDateString("es-CL", { month: "long", year: "numeric" }) : ""}</td><td>${unidadPill(r.unidad)}</td><td class="num">${clp(r.ventas)}</td><td class="num">${+r.costos ? clp(r.costos) : '<span class="pill warn">sin costos</span>'}</td><td class="num">${clp(r.margen)}</td><td class="num">${+r.gastos ? clp(r.gastos) : "—"}</td><td class="num">${clp(r.resultado)}</td></tr>`).join("")).join("")}
    </tbody></table></div></section>
    <section class="card"><div class="card-h"><h3>Últimas ventas</h3></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>Unidad</th><th>Cliente</th><th>Detalle</th><th class="num">Monto</th><th class="num">Margen</th><th>Cobro</th></tr></thead><tbody>
      ${d.ventas.map((v) => `<tr><td>${fecha(v.fecha)}</td><td>${unidadPill(v.unidad)}</td><td>${esc(v.cliente || "—")}</td><td class="muted">${esc(v.descripcion || "")}</td><td class="num">${clp(v.monto)}</td><td class="num">${+v.costos ? `<span style="color:${v.monto - v.costos < 0 ? "var(--bad)" : "inherit"}">${clp(v.monto - v.costos)}</span>` : '<span class="faint">sin costo</span>'}</td><td>${v.cobro === "cobrado" ? '<span class="pill ok">Cobrada</span>' : `<span class="pill warn">${esc(v.cobro)}</span>`}</td></tr>`).join("")}
    </tbody></table></div></section>`;
    $("#fx").onclick = () => downloadCSV(`ventas_${hoyISO()}.csv`, d.ventas);
  } catch (e) { P.innerHTML = fail(e); }
}

/* ---------- equipo ---------- */
const MODULOS = ["Dashboard", "Bandeja", "Conversaciones", "Embudo", "Agenda", "Cotizaciones", "Clientes", "Vehículos", "Tareas y postventa", "Ventas y márgenes", "Equipo"];
const ROLES = [["Dueño", MODULOS.map(() => "total")], ["Comercial Carclass y Carwash.hf", ["ver", "total", "total", "total", "total", "total", "total", "total", "total", "—", "—"]], ["Ejecutivo NOM", ["ver", "total", "total", "total", "total", "—", "total", "total", "total", "—", "—"]]];
async function viewEquipo() {
  setActive("equipo");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Equipo</h1><p>Usuarios, roles y permisos por módulo. Por ahora Felipe es el único usuario; nadie más que el dueño ve finanzas.</p></div>
    <div class="actions"><button class="btn primary" disabled title="Se habilita cuando Felipe lo pida">${ico("plus", 16)} Invitar usuario</button></div></div><div id="eq">${loading(3)}</div>`;
  try {
    const u = await rpc("app_equipo");
    $("#eq").innerHTML = `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Usuario</th><th>Rol</th><th>Unidades</th><th>Finanzas</th><th>Último ingreso</th><th>Estado</th></tr></thead><tbody>
      ${u.map((x) => `<tr><td><div class="row" style="align-items:center;gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(x.nombre || x.email))}</span><div><div class="name">${esc(x.nombre || "—")}</div><div class="sub">${esc(x.email)}</div></div></div></td><td>${x.rol === "dueno" ? "Dueño" : esc(x.rol)}</td><td>${(x.unidades || []).filter((k) => k !== "grupo").map(unidadPill).join(" ")}</td><td>${x.ve_finanzas ? '<span class="pill ok">sí</span>' : '<span class="pill">no</span>'}</td><td>${fechaHora(x.ultimo_ingreso)}</td><td>${x.activo ? '<span class="pill ok">activo</span>' : '<span class="pill">inactivo</span>'}</td></tr>`).join("")}
      </tbody></table></div></section>
      <section class="card"><div class="card-h"><h3>Permisos por módulo y rol</h3><span class="r faint" style="font-size:12px">roles previstos; se crean cuando se sumen Stephanie, Jorge y Bryan</span></div><div class="tbl-wrap"><table class="tbl perm"><thead><tr><th>Módulo</th>${ROLES.map(([r]) => `<th>${r}</th>`).join("")}</tr></thead><tbody>
      ${MODULOS.map((m, i) => `<tr><td>${m}</td>${ROLES.map(([, p]) => `<td>${p[i] === "total" ? '<span class="pill ok">total</span>' : p[i] === "ver" ? '<span class="pill info">ver</span>' : '<span class="faint">—</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div></section>`;
  } catch (e) { $("#eq").innerHTML = fail(e); }
}

/* ---------- ayuda ---------- */
function md(s) {
  return esc(s).split("\n").map((l) => {
    if (/^#{1,4}\s/.test(l)) return `<h4 style="margin:14px 0 6px">${l.replace(/^#+\s/, "")}</h4>`;
    if (/^\s*[-*]\s/.test(l)) return `<div style="padding-left:16px;text-indent:-12px">• ${l.replace(/^\s*[-*]\s/, "")}</div>`;
    if (/^\s*\|/.test(l)) return `<div class="mono" style="font-size:12.5px;white-space:pre">${l}</div>`;
    return l ? `<div>${l}</div>` : `<div style="height:8px"></div>`;
  }).join("").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
async function viewAyuda(params) {
  setActive("ayuda");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Procesos comerciales</h1><p>El mapa de procesos de cada unidad: etapas, qué se hace en cada una y cuándo avanza. Es lo mismo que leen los agentes.</p></div></div><div id="pr">${loading(6)}</div>`;
  try {
    const pr = await rpc("app_procesos", { p_unidad: null });
    const u = params.get("u") || pr[0]?.unidad;
    const unis = [...new Set(pr.map((p) => p.unidad))];
    $("#pr").innerHTML = `<div class="tabs">${unis.map((x) => `<a href="#/ayuda?u=${x}" class="${x === u ? "on" : ""}">${esc(uName(x))}</a>`).join("")}</div>
      ${pr.filter((p) => p.unidad === u).map((p) => `<section class="card"><div class="card-h"><h3>${esc(p.titulo)}</h3></div><div class="card-b" style="font-size:13.5px;line-height:1.6">${md(p.contenido || "")}</div></section>`).join("") || `<div class="card">${empty("help", "Sin procesos")}</div>`}
      <section class="card"><div class="card-h"><h3>Atajos</h3></div><div class="card-b" style="font-size:13px;display:grid;gap:6px"><div>Versión ${VERSION} · <a href="#" id="re-onb">Ver de nuevo la bienvenida</a></div></div></section>`;
    $("#re-onb").onclick = (e) => { e.preventDefault(); onboarding(true); };
  } catch (e) { $("#pr").innerHTML = fail(e); }
}

/* ---------- modales ---------- */
function modal(title, body, onOk, okText = "Guardar", wide = false) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button type="button" class="btn ghost sm icon" data-x aria-label="Cerrar">${ico("x", 16)}</button></div>
    <form id="m-form" novalidate><div class="modal-b">${body}<div class="err" id="m-err"></div></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-x>${onOk ? "Cancelar" : "Cerrar"}</button>${onOk ? `<button class="btn primary" id="m-ok">${esc(okText)}</button>` : ""}</div></form></div></div>`;
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", k); };
  function k(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", k);
  $$("[data-x]", root).forEach((b) => b.onclick = close);
  $(".modal-bg", root).onmousedown = (e) => e.target.classList.contains("modal-bg") && close();
  $("#m-form").onsubmit = async (e) => {
    e.preventDefault(); if (!onOk) return close();
    const ok = $("#m-ok"); ok.disabled = true; $("#m-err").textContent = "";
    try { await onOk(); close(); } catch (err) { $("#m-err").textContent = err.message; ok.disabled = false; }
  };
  setTimeout(() => $(".modal-b input:not([type=hidden]), .modal-b select, .modal-b textarea", root)?.focus(), 30);
  return root;
}
function seg(name, opts, val) { return `<div class="seg" data-seg="${name}" data-val="${esc(val)}">${opts.map(([v, t]) => `<button type="button" class="${v === val ? "on" : ""}" data-v="${esc(v)}">${t}</button>`).join("")}</div>`; }
function bindSeg(root, onChange) {
  $$("[data-seg]", root).forEach((g) => $$("button", g).forEach((b) => b.onclick = () => { $$("button", g).forEach((x) => x.classList.remove("on")); b.classList.add("on"); g.dataset.val = b.dataset.v; onChange && onChange(g.dataset.seg, b.dataset.v); }));
}
const segVal = (root, n) => $(`[data-seg="${n}"]`, root)?.dataset.val || "";

function modalLead(pre = {}) {
  const unis = unidadesMias();
  const u0 = pre.unidad && unis.includes(pre.unidad) ? pre.unidad : unis.includes("carclass") ? "carclass" : unis[0];
  const root = modal("Nuevo lead", `
    <div class="field"><span class="lbl">Unidad</span>${seg("u", unis.map((x) => [x, uName(x)]), u0)}</div>
    <div class="field" id="ld-flujo"><span class="lbl">Flujo NOM</span>${seg("flujo", [["consignante", "Consignante"], ["comprador", "Comprador"]], pre.flujo || "consignante")}</div>
    <div class="row"><div class="field"><label for="ld-nom">Nombre</label><input class="input" id="ld-nom" value="${esc(pre.nombre || "")}" autocomplete="off"></div><div class="field"><label for="ld-tel">Teléfono</label><input class="input" id="ld-tel" type="tel" placeholder="+56 9 1234 5678" value="${esc(pre.telefono || "")}"></div></div>
    <div class="row b2b"><div class="field"><label for="ld-emp">Empresa</label><input class="input" id="ld-emp" value="${esc(pre.empresa || "")}"></div><div class="field" style="flex:0 1 160px"><label for="ld-rut">RUT</label><input class="input" id="ld-rut" placeholder="76.123.456-7" value="${esc(pre.rut ? fmtRut(pre.rut) : "")}"></div><div class="field" style="flex:0 1 110px"><label for="ld-flota">Flota</label><input class="input" id="ld-flota" type="number" min="0"></div></div>
    <div class="row"><div class="field"><label for="ld-mail">Correo</label><input class="input" id="ld-mail" type="email" value="${esc(pre.email || "")}"></div><div class="field" style="flex:0 1 170px"><label for="ld-com">Comuna</label><input class="input" id="ld-com"></div></div>
    <div class="row"><div class="field"><label for="ld-canal">Canal</label><select class="input" id="ld-canal">${CANALES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div><div class="field"><label for="ld-camp">Campaña</label><input class="input" id="ld-camp" placeholder="Opcional"></div></div>
    <div class="field"><label for="ld-msg">Mensaje o interés</label><textarea class="input" id="ld-msg" placeholder="Qué necesita: servicio, auto, flota…"></textarea></div>
    <p class="faint" style="margin:0;font-size:12px">Si ya existe un cliente con ese teléfono o RUT, el lead se suma a su ficha y no se duplica.</p>`,
    async () => {
      const unidad = segVal(root, "u"); const b2b = !UNIDADES[unidad]?.b2c;
      const p = { unidad, flujo: unidad === "nom" ? segVal(root, "flujo") : null, nombre: $("#ld-nom").value.trim() || null, telefono: $("#ld-tel").value.trim() || null, email: $("#ld-mail").value.trim() || null,
        comuna: $("#ld-com").value.trim() || null, canal: $("#ld-canal").value, campana: $("#ld-camp").value.trim() || null, mensaje: $("#ld-msg").value.trim() || null, interes: $("#ld-msg").value.trim().slice(0, 120) || null };
      if (b2b) Object.assign(p, { empresa: $("#ld-emp").value.trim() || null, rut: $("#ld-rut").value.trim() || null, flota: $("#ld-flota").value || null });
      if (!p.telefono && !p.email) throw new Error("Escribe al menos un teléfono o un correo.");
      if (!p.nombre && !p.empresa) throw new Error("Escribe el nombre del cliente.");
      const r = await rpc("app_registrar_lead", { p });
      toast(r.nueva ? "Lead creado" : "Ya tenía una oportunidad abierta: se sumó a su ficha");
      cargarAvisos(); location.hash = "#/cliente/" + r.cliente_id;
    }, "Crear lead");
  const sync = () => { const u = segVal(root, "u"); $("#ld-flujo", root).style.display = u === "nom" ? "" : "none"; $$(".b2b", root).forEach((x) => (x.style.display = UNIDADES[u]?.b2c ? "none" : "")); };
  bindSeg(root, sync); sync();
}
function modalActividad(opId, nombre, after) {
  const root = modal(`Registrar gestión · ${nombre}`, `
    <div class="field"><span class="lbl">Tipo</span>${seg("tipo", [["whatsapp", "WhatsApp"], ["llamada", "Llamada"], ["correo", "Correo"], ["reunion", "Reunión"], ["nota", "Nota"]], "whatsapp")}</div>
    <div class="field"><label for="a-res">Resultado</label><select class="input" id="a-res">${RESULTADOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
    <div class="field"><label for="a-nota">Detalle</label><textarea class="input" id="a-nota" placeholder="Qué pasó, con quién hablaste, qué pidió"></textarea></div>
    <div class="row"><div class="field"><label for="a-acc">Próxima acción</label><input class="input" id="a-acc" placeholder="Ej: enviar cotización, volver a llamar"></div>
    <div class="field" style="flex:0 1 170px"><label for="a-fecha">Fecha</label><input class="input" id="a-fecha" type="date" value="${masDias(2)}"></div></div>`,
    async () => {
      const r = await rpc("app_registrar_actividad", { p: { oportunidad_id: opId, tipo: segVal(root, "tipo"), resultado: $("#a-res").value || null, nota: $("#a-nota").value.trim() || null, proxima_accion: $("#a-acc").value.trim() || null, proxima_fecha: $("#a-fecha").value || null } });
      toast(r.etapa !== r.etapa_anterior ? `Gestión guardada · avanzó a ${etapaTxt(r.etapa)}` : r.estado === "perdida" ? "Gestión guardada · oportunidad perdida" : "Gestión guardada");
      after && after();
    });
  bindSeg(root);
}
function modalCerrar(opId, nombre, estado, after) {
  const ganar = estado === "ganada";
  modal(ganar ? `Marcar como ganada · ${nombre}` : `Marcar como perdida · ${nombre}`, ganar
    ? `<p style="margin:0">La oportunidad queda <b>ganada</b>. En Carclass, Carwash.hf y NOM se crean solos los seguimientos de postventa.</p><p class="muted" style="margin:0;font-size:13px">La venta y su monto se registran aparte, en Ventas y márgenes, con tu confirmación.</p><div class="field"><label for="c-n">Nota</label><input class="input" id="c-n" placeholder="Opcional"></div>`
    : `<div class="field"><label for="c-m">Motivo de pérdida</label><select class="input" id="c-m"><option value="">Elige un motivo…</option>${MOTIVOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div><div class="field"><label for="c-n">Detalle</label><input class="input" id="c-n" placeholder="Opcional"></div>`,
    async () => {
      const m = ganar ? null : $("#c-m").value; if (!ganar && !m) throw new Error("Elige un motivo de la lista.");
      await rpc("app_cerrar", { p: { oportunidad_id: opId, estado, motivo_codigo: m, nota: $("#c-n").value.trim() || null } });
      toast(ganar ? "¡Ganada!" : "Marcada como perdida"); cargarAvisos(); after && after();
    }, ganar ? "Marcar ganada" : "Marcar perdida");
}
function modalTarea(after, preset = {}) {
  const unis = (ME.unidades || []).filter((k) => UNIDADES[k]);
  const root = modal("Nueva tarea", `
    <div class="field"><label for="t-tit">Qué hay que hacer</label><input class="input" id="t-tit"></div>
    <div class="field"><label for="t-desc">Detalle</label><textarea class="input" id="t-desc" style="min-height:70px"></textarea></div>
    <div class="row"><div class="field"><label for="t-u">Unidad</label><select class="input" id="t-u">${unis.map((k) => `<option value="${k}" ${k === (preset.unidad || "grupo") ? "selected" : ""}>${uName(k)}</option>`).join("")}</select></div>
    <div class="field"><label for="t-resp">Responsable</label><input class="input" id="t-resp" value="${esc((ME.nombre || "").split(" ")[0])}"></div></div>
    <div class="row"><div class="field"><label for="t-v">Vence</label><input class="input" id="t-v" type="date" value="${masDias(1)}"></div>
    <div class="field"><span class="lbl">Prioridad</span>${seg("prio", [["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]], "media")}</div></div>`,
    async () => {
      if (!$("#t-tit").value.trim()) throw new Error("Escribe qué hay que hacer.");
      await rpc("app_crear_tarea", { p: { titulo: $("#t-tit").value.trim(), descripcion: $("#t-desc").value.trim() || null, unidad: $("#t-u").value, responsable: $("#t-resp").value.trim() || null, vence: $("#t-v").value || null, prioridad: segVal(root, "prio"), empresa_id: preset.empresa_id || null } });
      toast("Tarea creada"); cargarAvisos(); after && after();
    }, "Crear tarea");
  bindSeg(root);
}
async function modalAsisma(opId) {
  const root = modal("Ficha para Asisma", loading(5), null);
  try {
    const f = await rpc("app_ficha_asisma", { p_id: opId });
    const rows = [["RUT", fmtRut(f.rut)], ["Razón social", f.razon_social], ["Giro", f.giro], ["Región", f.region], ["Comuna", f.comuna], ["Dirección", f.direccion], ["Contacto", f.contacto], ["Cargo", f.cargo], ["Teléfono", f.telefono], ["Correo", f.email], ["Flota", f.flota], ["Interés", f.interes]];
    const texto = rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + (f.resumen ? `\n\nContexto: ${f.resumen}` : "") + (f.ultima_gestion ? `\nÚltima gestión: ${f.ultima_gestion}` : "");
    $(".modal-b", root).innerHTML = `${f.faltan?.length ? `<div class="alert">${ico("alert", 16)}<div>Antes de cargar en Asisma falta: <b>${f.faltan.map(esc).join(", ")}</b>.</div></div>` : '<span class="pill ok" style="justify-self:start">Lista para cargar</span>'}
      <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="faint">—</span>'}</dd>`).join("")}</dl>
      <textarea class="input" id="as-txt" style="min-height:120px;font-size:12px" readonly>${esc(texto)}</textarea>
      <div class="row"><button type="button" class="btn" id="as-copy">Copiar ficha</button></div>`;
    $("#as-copy").onclick = async () => { try { await navigator.clipboard.writeText(texto); toast("Ficha copiada"); } catch { $("#as-txt").select(); toast("Selecciona y copia con Ctrl+C"); } };
  } catch (e) { $(".modal-b", root).innerHTML = fail(e); }
}

/* ---------- onboarding ---------- */
function onboarding(force = false) {
  if (!force && lsGet("cc_onb_v2")) return;
  const pasos = [
    ["spark", "Bienvenido a Carclass Core", "Tu holding en un solo lugar: Carclass, Carwash.hf, NOM, BlackGPS y somosB2B. El menú de la izquierda está ordenado como tu día: analizar, vender, operar y cobrar."],
    ["bell", "Activa los avisos", "Te avisamos cuando entra un lead y cuando lleva 5 minutos sin respuesta. En iPhone, primero instala la app: Safari → Compartir → Agregar a pantalla de inicio."],
    ["inbox", "Empieza por la Bandeja", "Ahí está cada lead con su reloj de minutos sin respuesta. Cada gestión que registras avanza el embudo solo; tú decides cuándo se gana o se pierde."],
  ];
  let i = 0;
  const root = $("#modal-root");
  const pinta = () => {
    const [ic, t, p] = pasos[i];
    root.innerHTML = `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true" aria-label="Bienvenida"><div class="modal-b"><div class="onb"><span class="big">${ico(ic, 30)}</span><h4>${t}</h4><p>${p}</p><div class="dots">${pasos.map((_, n) => `<i class="${n === i ? "on" : ""}"></i>`).join("")}</div></div></div>
      <div class="modal-f">${i === 1 ? `<button class="btn" id="o-av">${ico("bell", 15)} Activar avisos</button>` : ""}<button class="btn ghost" id="o-skip">Saltar</button><button class="btn primary" id="o-next">${i < pasos.length - 1 ? "Siguiente" : "Ir a la Bandeja"}</button></div></div></div>`;
    const fin = () => { lsSet("cc_onb_v2", "1"); root.innerHTML = ""; };
    $("#o-skip").onclick = fin;
    $("#o-next").onclick = () => { if (i < pasos.length - 1) { i++; pinta(); } else { fin(); location.hash = "#/bandeja"; } };
    if ($("#o-av")) $("#o-av").onclick = async () => { await activarAvisos(); $("#o-av").textContent = "Listo"; };
  };
  pinta();
}

/* ---------- router ---------- */
async function render() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ME = null; viewLogin(); return; }
  if (!ME) {
    try { ME = await rpc("app_yo"); } catch { ME = null; }
    if (!ME) {
      $("#app").innerHTML = `<div class="login-form" style="min-height:100vh"><div class="card" style="max-width:420px">${empty("team", "Tu usuario no tiene acceso a Carclass Core", "Pídele a Felipe que te habilite.")}<div style="text-align:center;padding:0 0 20px"><button class="btn" id="lo">Salir</button></div></div></div>`;
      $("#lo").onclick = async () => { await sb.auth.signOut(); render(); }; return;
    }
    shell(); cargarAvisos(); clearInterval(render._t); render._t = setInterval(cargarAvisos, 60000);
    setTimeout(() => onboarding(), 400);
  }
  const [path, qs] = (location.hash.slice(2) || "dashboard").split("?");
  const [r, a1, a2] = path.split("/");
  const params = new URLSearchParams(qs || "");
  window.scrollTo(0, 0);
  const R = { dashboard: () => viewDashboard(params), notificaciones: viewNotificaciones, bandeja: () => viewBandeja(params), conversaciones: viewConversaciones,
    embudo: () => viewEmbudo(a1, a2), agenda: () => viewAgenda(params), cotizaciones: viewCotizaciones, clientes: () => viewClientes(params),
    cliente: () => a1 ? viewCliente(a1) : viewClientes(params), vehiculos: () => viewVehiculos(params), tareas: () => viewTareas(params),
    finanzas: viewFinanzas, equipo: viewEquipo, ayuda: () => viewAyuda(params) };
  return (R[r] || R.dashboard)();
}
window.addEventListener("hashchange", () => ME && render());
document.addEventListener("visibilitychange", () => { if (!document.hidden && ME) cargarAvisos(); });
sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") ME = null; if (ev === "PASSWORD_RECOVERY") recoverPassword(); });
function recoverPassword() {
  modal("Crear nueva contraseña", `<div class="field"><label for="np">Nueva contraseña</label><input class="input" id="np" type="password" minlength="8" autocomplete="new-password"></div><p class="faint" style="margin:0;font-size:12px">Mínimo 8 caracteres.</p>`, async () => {
    if ($("#np").value.length < 8) throw new Error("Usa al menos 8 caracteres.");
    const { error } = await sb.auth.updateUser({ password: $("#np").value }); if (error) throw new Error(error.message); toast("Contraseña actualizada");
  });
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; const b = $("#install"); if (b) b.hidden = false; });
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => { if (e.data?.href) location.hash = e.data.href; });
}
render();
})();
