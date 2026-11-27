/* Carclass Core v2 · app web
   Lee y escribe solo por funciones app_* de Supabase; la seguridad por rol vive en la base (RLS). */
(() => {
"use strict";
const VERSION = "2.11.0";
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
  grupo:    { n: "Grupo", c: "var(--u-grupo)" },
};
const ETAPA_TXT = {
  tasado: "Tasado", oferta_enviada: "Oferta enviada", aceptada: "Aceptada", inspeccionado: "Inspeccionado", comprado: "Comprado",
  pre_revision: "Pre-revisión", por_contactar: "Por contactar", en_prospeccion: "En prospección", reunion_por_agendar: "Reunión por agendar",
  en_asisma: "En Asisma", onboarding: "Onboarding", nuevo: "Nuevo", calificando: "Calificando", pre_evaluado: "Pre-evaluado", cotizado: "Cotizado",
  negociando: "Negociando", agendado: "Agendado", en_taller: "En taller", entregado: "Entregado", coordinando: "Coordinando", atendido: "Atendido",
  revision_agendada: "Revisión agendada", revisado: "Revisado", propuesta: "Propuesta", contrato_firmado: "Contrato firmado", publicado: "Publicado",
  presentado: "Presentado", visita_agendada: "Visita agendada", reservado: "Reservado",
  analizada: "Analizada", factible: "Factible", contactable: "Contactable", contactado: "Contactado", en_servicio: "En servicio", postventa: "Postventa",
};
const nombreVis = (n) => { const t = String(n || "").trim(); return t && /\p{L}/u.test(t.replace(/^Lead\s+/i, "")) && !/^Lead\s+\d+$/i.test(t) ? t : (t.match(/\d{8,}/) ? "Sin nombre · " + t.match(/\d{8,}/)[0] : "Sin nombre"); };
const sinCodigos = (t) => String(t || "").replace(/\b(precio|competencia|sin_respuesta|fuera_zona|no_califica|desistio|datos_erroneos|duplicado)\b(?=[\s.,;)]|$)/g, (m) => m.includes("_") || m === "desistio" ? `«${((MOTIVOS.find(([k]) => k === m) || [])[1] || m).toLowerCase()}»` : m);
const MOTIVOS = [["precio", "Precio"], ["competencia", "Se fue con la competencia"], ["sin_respuesta", "Sin respuesta"], ["fuera_zona", "Fuera de zona"],
  ["no_califica", "No califica"], ["desistio", "Desistió"], ["datos_erroneos", "Datos erróneos"], ["duplicado", "Duplicado"], ["otro", "Otro"]];
const RESULTADOS = [["", "Sin resultado"], ["no_contesta", "No contesta"], ["interesado", "Interesado"], ["reunion_agendada", "Reunión agendada"], ["enviar_info", "Pide información"], ["no_interesado", "No interesado"]];
// resultados de una gestión: B2B (llamadas de prospección) o B2C (clientes particulares)
const RESULTADOS_B2C = [["", "Sin resultado"], ["no_contesta", "No contesta"], ["interesado", "Interesado"], ["envio_fotos", "Envió fotos"], ["cotizacion_enviada", "Cotización enviada"], ["agendo", "Agendó"], ["enviar_info", "Pide información"], ["no_interesado", "No interesado"]];
const resultadosDe = (u) => ["carclass", "carwash", "nom"].includes(u) ? RESULTADOS_B2C : RESULTADOS;
const CANALES = [["whatsapp", "WhatsApp"], ["meta", "Meta Ads"], ["google", "Google Ads"], ["web", "Sitio web"], ["referido", "Referido"], ["llamada", "Llamada"], ["presencial", "Presencial"], ["manual", "Otro"]];
const CANAL_TXT = Object.fromEntries([...CANALES, ["asisma", "Asisma"], ["prospeccion_blackgps", "Prospección BlackGPS"], ["landing", "Landing"]]);

let ME = null;
let PARAM = {}; // core.parametros (app_parametros): fuente única de horarios, políticas y comisiones
const P = (k) => PARAM[k] || {};
const DIAS_ORD = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
const DIA_LARGO = { lun: "lunes", mar: "martes", mie: "miércoles", jue: "jueves", vie: "viernes", sab: "sábado", dom: "domingo" };
const diaCod = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 3);
function diasAbiertos(spec) { // "vie-dom", "lun-sab", "lun,mie,vie" → códigos de día
  const out = new Set();
  String(spec || "lun-dom").split(",").forEach((seg) => { const [a, b] = seg.split(/[-–]/).map(diaCod); const i = DIAS_ORD.indexOf(a), j = b ? DIAS_ORD.indexOf(b) : i; if (i < 0 || j < 0) return; for (let k = i; ; k = (k + 1) % 7) { out.add(DIAS_ORD[k]); if (k === j) break; } });
  return out;
}
function horarioTxt(h) { // {dias:"vie-dom", apertura, cierre}
  if (!h || !h.dias) return "";
  const segs = String(h.dias).split(",").map((seg) => seg.split(/[-–]/).map((d) => DIA_LARGO[diaCod(d)] || d).join(" a ")).join(", ");
  return `${segs}${h.apertura ? `, ${h.apertura} a ${h.cierre}` : ""}`;
}
const cwNeg = () => P("carwash.negocio");
const cwHorario = () => horarioTxt(cwNeg().horario) || "según agenda";
const cwAbreEl = (fecha) => diasAbiertos(cwNeg().horario?.dias).has(DIAS_ORD[(parseD(fecha).getDay() + 6) % 7]);
const clpTxt = (n) => "$" + Number(n || 0).toLocaleString("es-CL");
function comisionNomTxt() {
  const c = P("nom.comision"); if (!c.pct_hasta_umbral) return "Comisión según política vigente.";
  return `Comisión ${c.pct_hasta_umbral}% de los primeros ${clpM(c.umbral_clp)} y ${c.pct_sobre_umbral}% del exceso; mínimo ${clpTxt(c.minimo_clp)}.${c.fee_entrada_clp ? ` Fee de entrada ${clpTxt(c.fee_entrada_clp)} en la visita${c.fee_descontable_de_comision ? ", descontable de la comisión" : ""}.` : ""}`;
}
function retiroTxt() { const r = P("carclass.retiro"); const z = r.comunas_sin_costo || r.zonas || []; return z.length ? `retiro y entrega a domicilio sin costo en ${z.join(" y ")}${r.aplica_a ? ` (${r.aplica_a})` : ""}; otras zonas, se evalúa según distancia` : "retiro a domicilio según zona"; }
let AVISOS = [];
let installPrompt = null;

/* ---------- líneas de negocio ---------- */
// Core gestiona completo Carclass, NOM y Carwash.hf. BlackGPS: solo setter hasta la reunión; desde ahí manda Asisma.
const LINEAS = [
  ["", "Grupo", "Tres unidades. Un mismo respaldo."],
  ["blackgps", "BlackGPS", "Setter hasta la reunión · luego manda Asisma."],
  ["carclass", "Carclass", "Tu auto, en manos correctas."],
  ["nom", "NOM", "Más confianza. Mejor decisión."],
  ["carwash", "Carwash.hf", "Lavado y cuidado en Huertos Familiares."],
];
let UNI = "";
const enLinea = (u) => !UNI || u === UNI || (UNI === "blackgps" && u === "somosb2b");
function setLinea(u) { UNI = u || ""; lsSet("cc_linea", UNI); document.documentElement.dataset.linea = UNI || "grupo"; const s = $("#linea-sel"); if (s) s.value = UNI; }

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clp = (n) => n == null ? "—" : (Number(n) < 0 ? "-$" : "$") + Math.abs(Math.round(Number(n))).toLocaleString("es-CL");
const clpM = (n) => n == null ? "—" : Math.abs(n) >= 1e6 ? (n < 0 ? "-$" : "$") + (Math.abs(n) / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " MM" : clp(n);
// Campos de monto: texto con formato chileno (25.000), aceptan puntos, comas, $ y espacios
const montoIn = (id, v, attrs = "") => `<input class="input clp-in" id="${id}" type="text" inputmode="numeric" autocomplete="off" placeholder="$0" value="${v != null && v !== "" ? Number(v).toLocaleString("es-CL") : ""}" ${attrs}>`;
const montoVal = (el) => { const s = String(el?.value ?? "").replace(/,\d{1,2}$/, "").replace(/[^\d-]/g, ""); return s && s !== "-" ? Number(s) : null; };
document.addEventListener("input", (e) => { const el = e.target; if (!el.classList?.contains("clp-in")) return; const n = montoVal(el); el.value = n == null ? (el.value.trim().startsWith("-") ? "-" : "") : n.toLocaleString("es-CL"); });
const int = (n) => n == null ? "—" : Number(n).toLocaleString("es-CL");
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const hoyISO = () => iso(new Date());
const masDias = (n, base = new Date()) => { const x = new Date(base); x.setDate(x.getDate() + n); return iso(x); };
// fechas propuestas para próximas acciones: nunca sábado ni domingo
const diaHabil = (n) => { const x = new Date(); x.setDate(x.getDate() + n); while ([0, 6].includes(x.getDay())) x.setDate(x.getDate() + 1); return iso(x); };
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
const initials = (s) => (s || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((x) => [...x][0].toUpperCase()).join("") || "?";
const fmtRut = (r) => { if (!r) return ""; const b = r.slice(0, -1), dv = r.slice(-1); return b.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv; };
const waLink = (tel, txt = "") => { const d = String(tel || "").replace(/\D/g, ""); if (d.length < 8) return null; const n = d.length === 9 ? "56" + d : d.length === 8 ? "569" + d : d; return `https://wa.me/${n}${txt ? "?text=" + encodeURIComponent(txt) : ""}`; };
const ORDEN_U = ["carclass", "nom", "carwash", "blackgps", "somosb2b"];
const unidadesMias = () => (ME?.unidades || []).filter((x) => x !== "grupo" && UNIDADES[x]).sort((a, b) => ORDEN_U.indexOf(a) - ORDEN_U.indexOf(b));

const I = {
  send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pin: '<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
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
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
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
    <div class="login-scene" aria-hidden="true"><span class="grid"></span><span class="ring r1"></span><span class="ring r2"></span><span class="beam"></span></div>
    <section class="login-brand">
      <div class="logo-row">${logoDisc()}<div><b>Carclass Core</b><small>Carclass Group</small></div></div>
      <div>
        <h1>Cada negocio, <em>bajo control</em>.</h1>
        <p class="lead">BlackGPS, Carclass, NOM, Carwash.hf y somosB2B en una sola base: leads, conversaciones, agenda, ventas y márgenes, con asesores IA que trabajan contigo.</p>
        <ul class="benefits">
          <li><span class="ck">${ico("check", 14)}</span><div><b>Ningún lead sin respuesta</b><span class="s">Bandeja con reloj, avisos al teléfono y asesor IA en WhatsApp las 24 horas.</span></div></li>
          <li><span class="ck">${ico("check", 14)}</span><div><b>El embudo siempre al día</b><span class="s">Cada gestión avanza la etapa y deja la próxima acción agendada.</span></div></li>
          <li><span class="ck">${ico("check", 14)}</span><div><b>Números reales</b><span class="s">Ventas, cobros y márgenes por unidad y por mes.</span></div></li>
        </ul>
      </div>
      <div class="foot">© ${new Date().getFullYear()} Carclass Group · Puertas de Chicureo</div>
    </section>
    <section class="login-form">
      <form id="f-login" class="login-card" autocomplete="on" novalidate>
        <div class="login-head">${logoDisc()}<div class="name">Carclass Core</div><div class="bar"></div><div class="tag">Gestión integral de Carclass Group</div></div>
        <h2>Iniciar sesión</h2>
        <p class="sub">Accede a tu espacio de trabajo.</p>
        <div class="field"><label for="l-email">Correo electrónico</label><input class="input" id="l-email" type="email" autocomplete="email" placeholder="nombre@carclass.cl" required></div>
        <div class="field"><label for="l-pass">Contraseña</label><div class="pass-wrap"><input class="input" id="l-pass" type="password" autocomplete="current-password" required><button type="button" class="btn ghost sm icon" id="l-eye" aria-label="Mostrar contraseña">${ico("eye", 18)}</button></div></div>
        <div class="login-opts"><label class="check-row"><input type="checkbox" id="l-rec" ${recordar() ? "checked" : ""}> Recordar dispositivo</label><a href="#" id="l-reset">¿Olvidaste tu contraseña?</a></div>
        <div class="err" id="l-err">${esc(msg)}</div>
        <button class="btn primary" type="submit" id="l-btn">Ingresar</button>
        <p class="login-note">Acceso privado · Carclass Core ${VERSION}</p>
      </form>
    </section>
  </div>`;
  $("#l-eye").onclick = () => { const p = $("#l-pass"); const show = p.type === "password"; p.type = show ? "text" : "password"; $("#l-eye").innerHTML = ico(show ? "eyeoff" : "eye", 18); };
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
  ["Dirección", [["directorio", "Directorio", "trophy", "dir"]], "dueno"],
  ["Análisis", [["dashboard", "Dashboard", "dash"], ["notificaciones", "Notificaciones", "bell", "avisos"]]],
  ["Comercial", [["bandeja", "Bandeja", "inbox", "bandeja"], ["conversaciones", "Conversaciones", "chat", "conv"], ["embudo", "Embudo", "kanban"], ["agenda", "Agenda", "cal"], ["cotizaciones", "Cotizaciones", "doc"], ["tasaciones", "Tasaciones NOM", "car"], ["clientes", "Clientes", "users"]]],
  ["Catálogo", [["vehiculos", "Vehículos", "car"], ["herramientas", "Herramientas", "link"]]],
  ["Post-venta", [["tareas", "Tareas y postventa", "tasks", "tareas"]]],
  ["Finanzas", [["finanzas", "Resultados", "chart"], ["flujo", "Flujo de caja", "money"], ["registro", "Registro", "doc"], ["importar", "Importar", "dl"]], "fin"],
  ["Organización", [["equipo", "Equipo", "team"]]],
  ["Ayuda", [["ayuda", "Procesos y ayuda", "help"]]],
];
const TITULOS = Object.fromEntries(NAV.flatMap(([g, items]) => items.map(([r, t]) => [r, [g, t]])));
TITULOS.cliente = ["Comercial", "Ficha del cliente"];
TITULOS.tasacion = ["Comercial", "Tasación NOM"];

function shell() {
  const nav = NAV.filter(([, , f]) => (f !== "fin" || ME.ve_finanzas) && (f !== "dueno" || ME.rol === "dueno")).map(([g, items]) =>
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
        <label class="linea-pick" title="Línea de negocio"><span class="ldot"></span><select id="linea-sel" aria-label="Línea de negocio">${LINEAS.filter(([k]) => !k || unidadesMias().includes(k)).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>
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
  $("#linea-sel").onchange = (e) => { setLinea(e.target.value); render(); };
  $("#notify").onclick = activarAvisos;
  $("#install").onclick = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("#install").hidden = true; };
  if (installPrompt) $("#install").hidden = false;
  pintarNotify();
}
function setActive(r, titulo) {
  $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === r));
  const [g, t] = TITULOS[r] || ["", ""];
  $("#crumbs").innerHTML = `<span class="org">${UNI ? esc(uName(UNI)) : "Carclass Group"}</span><span class="sep">/</span><span class="org">${esc(g)}</span><span class="sep">/</span><b>${esc(titulo || t)}</b>`;
  document.title = `${titulo || t} · Carclass Core`;
  $("#side").classList.remove("open");
}

/* ---------- avisos (notificaciones) ---------- */
// leídos: los del servidor (compartidos entre dispositivos, core_v83) más los locales de este dispositivo
let LEIDOS_SRV = new Set(); let leidosSubidos = false;
const leidosLocal = () => { try { return new Set(JSON.parse(lsGet("cc_leidos", "[]"))); } catch { return new Set(); } };
const leidos = () => { const s = leidosLocal(); LEIDOS_SRV.forEach((x) => s.add(x)); return s; };
function marcarLeidos(ids) {
  ids = ids.filter(Boolean); if (!ids.length) return;
  const s = leidosLocal(); ids.forEach((x) => { s.add(x); LEIDOS_SRV.add(x); }); guardarSet("cc_leidos", s);
  rpc("app_avisos_marcar", { p_ids: ids }).catch(() => {});
}
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
  if (p === "granted") {
    const push = await suscribirPush().catch(() => false);
    mostrarAviso({ id: "test", title: "Avisos activados", body: push ? "Te llegarán aunque la app esté cerrada: lead nuevo, sin respuesta a los 5 min, cliente que pide hablar contigo, cotización vista y cita en 1 hora." : "Te avisaremos mientras la app esté abierta o en segundo plano.", href: "#/notificaciones" });
    toast(push ? "Avisos activados, también con la app cerrada" : "Avisos activados en este dispositivo");
  }
}
/* Web Push: avisos con la app cerrada (core-push). En iPhone requiere la app instalada en la pantalla de inicio. */
const b64u = (s) => { const p = "=".repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
async function suscribirPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.ready;
  let s = await reg.pushManager.getSubscription();
  // si el servicio de push dio por muerto este endpoint (404/410 en core-push), se cancela y se pide uno nuevo
  if (s) { const e = await rpc("app_push_estado", { p_endpoint: s.endpoint }).catch(() => null); if (e && e.existe && !e.activa) { await s.unsubscribe().catch(() => {}); s = null; } }
  if (!s) { const k = await rpc("app_push_clave"); if (!k) return false; s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(k) }); }
  await rpc("app_push_suscribir", { p: { ...s.toJSON(), dispositivo: navigator.userAgent.slice(0, 180) } });
  lsSet("cc_push", "1"); avisoPushApagado(false);
  return true;
}
/* Aviso visible cuando este dispositivo dejó de recibir avisos (permiso revocado, datos borrados o suscripción muerta) */
function avisoPushApagado(mostrar, bloqueado) {
  let el = $("#push-off");
  if (!mostrar) { if (el) el.remove(); return; }
  if (!el && $("#page")) { $("#page").insertAdjacentHTML("beforebegin", '<div id="push-off" class="push-off" role="alert"></div>'); el = $("#push-off"); }
  if (!el) return;
  el.innerHTML = `${ico("bell", 16)}<span><b>Los avisos están desactivados en este dispositivo.</b> ${bloqueado ? "Están bloqueados en el navegador: abre la configuración del sitio app.carclass.cl y permite las notificaciones." : "No te llegarán leads nuevos ni clientes que piden hablar contigo."}</span>${bloqueado ? "" : '<button class="btn sm primary" id="push-off-act">Activar</button>'}<button class="btn sm ghost icon" id="push-off-x" aria-label="Ocultar">${ico("x", 14)}</button>`;
  if ($("#push-off-act")) $("#push-off-act").onclick = async () => { await activarAvisos(); revisarPush(); };
  $("#push-off-x").onclick = () => { try { sessionStorage.setItem("cc_push_off_x", "1"); } catch {} el.remove(); };
}
async function revisarPush() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const esperaba = lsGet("cc_push") === "1" || instalada;
  let oculto = false; try { oculto = sessionStorage.getItem("cc_push_off_x") === "1"; } catch {}
  if (Notification.permission === "granted") {
    const ok = await suscribirPush().catch(() => false);
    if (!ok && esperaba && !oculto) avisoPushApagado(true);
    return;
  }
  if (esperaba && !oculto) avisoPushApagado(true, Notification.permission === "denied");
}
async function mostrarAviso(a) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = { body: a.body, icon: "img/core-192.png", badge: "img/icon-96.png", tag: a.id, data: { href: a.href } };
    if (reg) await reg.showNotification(a.title, opts); else new Notification(a.title, opts);
  } catch {}
}
async function cargarAvisos() {
  if (!ME) return;
  try {
    const [bandeja, tareas, cots, todasConvs, srv] = await Promise.all([rpc("app_bandeja", { p_tipo: "todas" }), rpc("app_tareas", { p_estado: "pendiente,en_curso" }), rpc("app_cotizaciones").catch(() => []), rpc("app_conversaciones").catch(() => []), rpc("app_avisos_leidos").catch(() => null)]);
    if (Array.isArray(srv)) {
      LEIDOS_SRV = new Set(srv);
      // una vez por sesión, sube los leídos que este dispositivo tenía solo en local
      if (!leidosSubidos) { leidosSubidos = true; const faltan = [...leidosLocal()].filter((x) => !LEIDOS_SRV.has(x)).slice(-400); if (faltan.length) marcarLeidos(faltan); }
    }
    // proveedores, equipo y clientes BlackGPS no son leads: no cuentan en avisos ni en el badge
    const convs = todasConvs.filter((c) => c.es_lead !== false);
    const hoy = hoyISO(); const L = [];
    for (const c of convs.filter((c) => c.traspaso)) L.push({ id: `persona:${c.id}:${c.traspaso}`, level: "bad", icon: "users", title: `Cliente pide hablar contigo · ${c.nombre || c.telefono}`, body: String(c.traspaso).replace(/^\[WhatsApp\]\s*/, ""), href: "#/conversaciones/" + c.id, at: c.ultima_entrada || c.orden });
    for (const c of convs.filter((c) => c.borradores > 0)) L.push({ id: `borrador:${c.id}:${c.ultima_entrada || ""}`, level: "brand", icon: "spark", title: `Borrador del asesor por revisar · ${c.nombre || c.telefono}`, body: `${c.unidad ? uName(c.unidad) + " · " : ""}${c.ultimo_mensaje || "nuevo mensaje"}`, href: "#/conversaciones/" + c.id, at: c.ultima_entrada || c.orden });
    const ncv = $("#nb-conv"); if (ncv) { const n = convs.filter((c) => c.sin_responder || c.borradores > 0).length; ncv.textContent = n || ""; ncv.className = "badge" + (convs.some((c) => c.borradores > 0) ? " brand" : ""); }
    for (const b of bandeja) {
      const nombre = b.contacto || b.empresa;
      if (b.bandeja === "pre_revision") L.push({ id: "pre:" + b.oportunidad_id, level: "info", icon: "spark", title: `Análisis por revisar · ${b.empresa}`, body: `${uName(b.unidad)} · el GPT lo dejó en pre-revisión`, href: "#/bandeja?t=pre_revision", at: b.creado });
      else {
        L.push({ id: "lead:" + b.oportunidad_id, level: "brand", icon: "inbox", title: `Lead nuevo · ${nombre}`, body: `${uName(b.unidad)}${b.canal ? " · " + (CANAL_TXT[b.canal] || b.canal) : ""}${b.campana ? " · " + b.campana : ""}`, href: "#/bandeja", at: b.creado });
        if (b.minutos_sin_respuesta != null && b.minutos_sin_respuesta >= 5) L.push({ id: "sla:" + b.oportunidad_id, level: "bad", icon: "clock", title: `Sin respuesta hace ${minTxt(b.minutos_sin_respuesta)} · ${nombre}`, body: `${uName(b.unidad)} · el objetivo es responder en 5 minutos`, href: "#/bandeja", at: new Date(parseD(b.creado).getTime() + 5 * 6e4).toISOString() });
      }
    }
    for (const t of tareas.filter((t) => t.vence && t.vence <= hoy)) L.push({ id: `tarea:${t.id}`, level: t.vence < hoy ? "bad" : "warn", icon: "tasks", title: `${t.vence < hoy ? "Tarea vencida" : "Tarea para hoy"} · ${t.titulo}`, body: [uName(t.unidad), t.empresa].filter(Boolean).join(" · "), href: "#/tareas", at: t.vence + "T08:00:00" });
    for (const q of cots.filter((q) => q.vista_en && Date.now() - parseD(q.vista_en) < 14 * 864e5)) L.push({ id: "vista:" + q.id, level: "info", icon: "eye", title: `Cotización vista · ${q.cliente || q.numero}`, body: `${q.numero} · ${clp(q.total)}${q.vistas > 1 ? ` · abierta ${q.vistas} veces` : ""}`, href: "#/cot/" + q.id, at: q.vista_en });
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
      // con push activo, el servidor ya avisa de leads, SLA, traspasos y cotizaciones vistas: aquí solo los borradores
      const rx = lsGet("cc_push") === "1" ? /^borrador:/ : /^(lead|sla|vista|borrador|persona):/;
      // no se muestra en este dispositivo lo que ya se leyó en otro
      for (const a of L.filter((a) => rx.test(a.id) && !nt.has(a.id))) { if (!primera && !rd.has(a.id)) mostrarAviso(a); nt.add(a.id); }
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
  const u = UNI;
  setActive("dashboard", u ? `Dashboard · ${uName(u)}` : "Dashboard");
  const pre = params.get("r") || (params.get("desde") ? "" : "30d");
  const [d0, d1] = pre ? rangoPreset(pre) : [params.get("desde"), params.get("hasta") || hoyISO()];
  const link = (o) => { const p = new URLSearchParams({ r: pre, desde: pre ? "" : d0, hasta: pre ? "" : d1, ...o }); [...p.keys()].forEach((k) => !p.get(k) && p.delete(k)); return "#/dashboard?" + p; };
  const P = $("#page");
  const nombre = (ME.nombre || "").split(" ")[0];
  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
  const lin = LINEAS.find(([k]) => k === u);
  P.innerHTML = `
    <div class="page-head"><div><h1>${u ? esc(uName(u)) : `${saludo}, ${esc(nombre)}`}</h1><p>${u ? esc(lin?.[2] || "") : `${new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })} · las cuatro líneas del grupo de un vistazo.`}</p></div>
      <div class="actions"><button class="btn" id="csv">${ico("dl", 16)} Exportar CSV</button></div></div>
    <div class="ltabs">${LINEAS.filter(([k]) => !k || unidadesMias().includes(k)).map(([k, n]) => `<button class="${k === u ? "on" : ""}" data-go-linea="${k}" style="--c:${k ? UNIDADES[k].c : "var(--brand)"}"><span class="ldot"></span>${n}</button>`).join("")}</div>
    <div class="filters">
      <div class="chips">${PRESETS.map(([k, t]) => `<a class="chip ${pre === k ? "on" : ""}" href="${link({ r: k, desde: "", hasta: "" })}">${t}</a>`).join("")}</div>
      <form class="daterange" id="f-rango">${ico("cal", 15)}<input type="date" id="r-d" value="${d0}" aria-label="Desde"><span class="faint">→</span><input type="date" id="r-h" value="${d1}" aria-label="Hasta"></form>
    </div>
    <div id="dash">${loading(8)}</div>`;
  const go = () => { location.hash = link({ r: "", desde: $("#r-d").value, hasta: $("#r-h").value }); };
  $("#r-d").onchange = go; $("#r-h").onchange = go;
  bindLineas(P);
  $("#csv").onclick = async () => {
    try { const rows = (await rpc("app_leads", { p_desde: d0, p_hasta: d1, p_unidad: null })).filter((r) => enLinea(r.unidad)); downloadCSV(`leads_${d0}_${d1}${u ? "_" + u : ""}.csv`, rows); }
    catch (e) { toast(e.message, true); }
  };
  try {
    const [d, L, BU] = await Promise.all([rpc("app_dashboard2", { p_desde: d0, p_hasta: d1, p_unidad: u || null }), rpc("app_lineas", { p_desde: d0, p_hasta: d1 }), ME.ve_finanzas && (!u || u === "blackgps") ? rpc("app_bgps_ventas_unicas", { p_meses: 6 }).catch(() => null) : null]);
    if (L.blackgps && BU) L.blackgps.unicas = BU;
    $("#dash").innerHTML = (u ? unidadDash(u, L) : holdingDash(L)) + comercialDash(d, u);
    bindLineas($("#dash"));
    $$("#dash [data-cotnueva]").forEach((b) => b.onclick = () => modalNuevaCotizacion());
  } catch (e) { $("#dash").innerHTML = fail(e); }
}
function bindLineas(root) {
  $$("[data-go-linea]", root).forEach((b) => b.onclick = (e) => { e.preventDefault(); setLinea(b.dataset.goLinea); location.hash = "#/dashboard"; render(); });
}
const metaV = (L, k) => Number(L.metas?.[k]?.meta || 0);
function metaBar(v, meta, fmt = int, label = "") {
  const pct = meta ? Math.max(0, Math.min(100, (Number(v || 0) / meta) * 100)) : 0;
  return `<div class="meta">${label ? `<div class="meta-k">${label}</div>` : ""}<div class="meta-l"><span><b>${fmt(v || 0)}</b> <span class="faint">de ${fmt(meta)}</span></span><span class="${pct >= 100 ? "ok-t" : pct < 40 ? "bad-t" : ""}">${Math.round(pct)}%</span></div><div class="meta-t"><i style="width:${pct}%"></i></div></div>`;
}
const TIPO_UNICA = { equipos: "Equipos y cámaras", instalaciones: "Instalaciones", desinstalaciones: "Desinstalaciones", servicios: "Otros servicios", otros: "Notas de crédito y otros" };
const mesNombre = (iso) => parseD(iso).toLocaleDateString("es-CL", { month: "long" });
function unicasMes(U) { // ventas BlackGPS no MRR del mes en curso
  if (!U) return null;
  const hoy = new Date(), clave = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
  return (U.meses || []).find((m) => m.mes === clave) || { mes: clave, total: 0, n: 0, por_tipo: {} };
}
const unicasDetalle = (m) => Object.entries(m.por_tipo || {}).sort((a, b) => b[1] - a[1]).map(([t, v]) => `${TIPO_UNICA[t] || t} ${clpM(v)}`).join(" · ");
const mini = (l, v, s = "") => `<div class="mini"><span class="l">${l}</span><b>${v}</b>${s ? `<span class="s">${s}</span>` : ""}</div>`;
function lineCard(u, body, alertas) {
  const lin = LINEAS.find(([k]) => k === u);
  return `<a class="ucard" href="#/dashboard" data-go-linea="${u}" style="--c:${UNIDADES[u].c}">
    <div class="uc-h"><span class="ldot"></span><div><b>${esc(uName(u))}</b><span class="faint">${esc(lin?.[2] || "")}</span></div><span class="go">${ico("right", 16)}</span></div>
    ${body}${alertas.length ? `<div class="uc-al">${alertas.map((a) => `<div>${ico("alert", 14)}<span>${a}</span></div>`).join("")}</div>` : `<div class="uc-al ok">${ico("check", 14)}<span>Sin alertas</span></div>`}</a>`;
}
const diasDesde = (f) => f ? Math.floor((Date.now() - parseD(f)) / 864e5) : null;
function holdingDash(L) {
  const cards = [];
  const C = L.comun || {};
  if (L.blackgps) {
    const b = L.blackgps, c = C.blackgps || {}, al = [];
    if (b.top?.[0]?.pct > 20) al.push(`<b>${esc(b.top[0].empresa)}</b> concentra el ${String(b.top[0].pct).replace(".", ",")}% del MRR`);
    const alto = (b.riesgo || []).filter((r) => r.riesgo === "alto").length; if (alto) al.push(`${alto} cliente${alto > 1 ? "s" : ""} con riesgo alto de fuga`);
    if (c.vencidas) al.push(`${int(c.vencidas)} próximas acciones vencidas`);
    cards.push(lineCard("blackgps", `${metaBar(b.equipos, metaV(L, "blackgps.equipos"), int, "Equipos facturando · meta diciembre")}
      <div class="minis">${b.mrr != null ? mini("MRR", clpM(b.mrr)) : ""}${mini("Clientes", int(b.clientes))}${mini("Llamadas hoy", `${int(b.llamadas_hoy)}<span class="faint">/${metaV(L, "blackgps.llamadas_dia")}</span>`)}${mini("Reuniones 7 días", int(b.reuniones_7d))}</div>${(() => { const m = unicasMes(b.unicas); return m ? `<div class="unicas"><div class="l">Ventas únicas de ${mesNombre(m.mes)} <span class="faint">· fuera del MRR</span></div><b>${clpM(m.total)}</b>${m.total ? `<span class="s">${esc(unicasDetalle(m))}</span>` : '<span class="s">Sin instalaciones ni equipos facturados este mes</span>'}</div>` : ""; })()}`, al));
  }
  if (L.carclass) {
    const k = L.carclass, c = C.carclass || {}, al = [], dv = diasDesde(k.ultima_venta);
    if (k.venta_mes != null && dv != null && dv > 30) al.push(`Última venta registrada hace ${dv} días (${fecha(k.ultima_venta)})`);
    if (!c.abiertas) al.push("Sin oportunidades abiertas en Core");
    if (k.sin_seguimiento) al.push(`${k.sin_seguimiento} cotizaciones sin seguimiento en 48 h`);
    cards.push(lineCard("carclass", `${k.venta_mes != null ? metaBar(k.venta_mes, metaV(L, "carclass.venta_mes"), clpM, `Venta del mes · meta ${clpM(metaV(L, "carclass.venta_mes"))}`) : ""}
      <div class="minis">${mini("Cotizaciones abiertas", int(k.cot_pendientes), k.cot_vistas ? `${k.cot_vistas} vistas` : "")}${mini("Agendados", int(k.agendados))}${mini("En taller", int(k.en_taller))}${k.ticket_12m != null ? mini("Ticket 12 meses", clpM(k.ticket_12m)) : ""}</div>`, al));
  }
  if (L.nom) {
    const n = L.nom, c = C.nom || {}, al = [], tope = metaV(L, "nom.rotacion_dias") || 45;
    const viejos = (n.stock || []).filter((s) => s.dias > tope).length; if (viejos) al.push(`${viejos} auto${viejos > 1 ? "s" : ""} sobre ${tope} días en stock`);
    const sinInsp = (n.stock || []).filter((s) => !s.inspeccion).length; if (sinInsp) al.push(`${sinInsp} sin inspección registrada`);
    if (!c.abiertas) al.push("Sin consignantes ni compradores en el embudo");
    const prom = n.stock?.length ? Math.round(n.stock.reduce((a, s) => a + (s.dias || 0), 0) / n.stock.length) : null;
    cards.push(lineCard("nom", `${metaBar(n.ventas_mes, metaV(L, "nom.ventas_mes"), int, "Ventas del mes · meta mínima")}
      <div class="minis">${mini("Stock", int(n.stock?.length), prom != null ? `${prom} días promedio` : "")}${mini("Consignantes", int(n.consignantes))}${mini("Compradores", int(n.compradores))}${mini("Visitas agendadas", int(n.visitas))}</div>`, al));
  }
  if (L.carwash) {
    const w = L.carwash, c = C.carwash || {}, al = [], cap = metaV(L, "carwash.capacidad_dia") || 4;
    const ag = (w.agenda_7d || []).reduce((a, d) => a + d.n, 0), abiertos = (w.agenda_7d || []).filter((d) => cwAbreEl(d.fecha)).length;
    if (!w.atendidos_30d) al.push("Sin servicios registrados en 30 días");
    cards.push(lineCard("carwash", `${metaBar(ag, cap * abiertos, int, `Ocupación próximos 7 días · ${abiertos} días de atención × ${cap} autos`)}
      <div class="minis">${mini("Atendidos 30 días", int(w.atendidos_30d))}${w.venta_mes != null ? mini("Venta del mes", clpM(w.venta_mes)) : ""}${mini("Por recomprar", int(w.recompra))}${mini("En bandeja", int(c.bandeja))}</div>`, al));
  }
  const ORD = LINEAS.map(([k]) => k).filter(Boolean) /* prioridad del Cerebro: BlackGPS, Carclass, NOM, Carwash.hf */, k = (h) => ORD.indexOf(h.match(/data-go-linea="(\w+)"/)[1]);
  return `<div class="ucards">${cards.sort((x, y) => k(x) - k(y)).join("")}</div>`;
}
const ETAPAS = {
  blackgps: ["pre_revision", "por_contactar", "en_prospeccion", "reunion_por_agendar", "en_asisma", "onboarding"],
  carclass: ["nuevo", "calificando", "pre_evaluado", "cotizado", "negociando", "agendado", "en_taller", "entregado"],
  carwash: ["nuevo", "coordinando", "agendado", "atendido"],
  consignante: ["nuevo", "calificando", "revision_agendada", "revisado", "propuesta", "contrato_firmado", "publicado", "negociando"],
  comprador: ["nuevo", "calificando", "presentado", "visita_agendada", "negociando", "reservado", "entregado"],
  compra_directa: ["nuevo", "calificando", "tasado", "oferta_enviada", "aceptada", "inspeccionado", "comprado"],
};
const FLUJO_TXT = { consignante: "Consignantes", comprador: "Compradores", compra_directa: "Compra directa" };
function embudoCard(titulo, orden, rows, href) {
  const by = {}; rows.forEach((r) => (by[r.etapa] = (by[r.etapa] || 0) + Number(r.n)));
  const max = Math.max(1, ...orden.map((e) => by[e] || 0));
  const total = orden.reduce((a, e) => a + (by[e] || 0), 0);
  return `<section class="card"><div class="card-h"><h3>${titulo}</h3><span class="badge">${int(total)}</span><a class="r btn sm ghost" href="${href}">Abrir embudo</a></div>
    <div class="card-b funnel">${orden.map((e, i) => `<div class="fstep"><span class="fi">${i + 1}</span><span class="lab">${esc(etapaTxt(e))}</span><span class="bar-track"><i style="width:${((by[e] || 0) / max) * 100}%"></i></span><span class="n">${int(by[e] || 0)}</span></div>`).join("")}</div></section>`;
}
function uBand(u, metaHtml) {
  return `<section class="uband" style="--c:${UNIDADES[u].c}"><div class="ub-meta">${metaHtml}</div></section>`;
}
function chartVentaMes(rows, meta) {
  if (!rows?.length) return empty("chart", "Sin datos");
  const W = 640, H = 210, pl = 40, pb = 26, pt = 12;
  const max = Math.max(meta || 0, ...rows.map((r) => r.venta)) * 1.1 || 1;
  const bw = (W - pl - 6) / rows.length, y = (v) => H - pb - (v / max) * (H - pb - pt);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Venta por mes contra la meta">`;
  [0, 0.5, 1].forEach((f) => { const v = max / 1.1 * f; s += `<line class="grid" x1="${pl}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 3.5}" font-size="10" text-anchor="end">${(v / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 })}M</text>`; });
  rows.forEach((r, i) => { const x = pl + i * bw + bw * 0.2, w = bw * 0.6; s += `<rect x="${x}" y="${y(r.venta)}" width="${w}" height="${H - pb - y(r.venta)}" rx="3" fill="var(--c)"><title>${r.mes}: ${clp(r.venta)}</title></rect><text x="${x + w / 2}" y="${H - 8}" font-size="10.5" text-anchor="middle">${new Date(r.mes + "-15").toLocaleDateString("es-CL", { month: "short" }).replace(".", "")}</text>`; });
  if (meta) s += `<line x1="${pl}" x2="${W - 4}" y1="${y(meta)}" y2="${y(meta)}" stroke="var(--gold)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${W - 6}" y="${y(meta) - 5}" font-size="10.5" text-anchor="end" style="fill:var(--gold)">meta ${clpM(meta)}</text>`;
  return s + "</svg>";
}
function unidadDash(u, L) {
  const C = (L.comun || {})[u] || {};
  if (u === "blackgps" && L.blackgps) {
    const b = L.blackgps;
    return `${uBand(u, `${metaBar(b.equipos, metaV(L, "blackgps.equipos"), int, "Equipos instalados y facturando · meta diciembre 2026")}${metaBar(b.llamadas_hoy, metaV(L, "blackgps.llamadas_dia"), int, "Llamadas de hoy")}${metaBar(b.reuniones_hoy, metaV(L, "blackgps.reuniones_dia"), int, "Reuniones agendadas hoy")}`)}
    <div class="kpis">${b.mrr != null ? `<div class="kpi"><span class="l">MRR</span><span class="v">${clpM(b.mrr)}</span><span class="s">${clp(b.equipos ? b.mrr / b.equipos : 0)} por equipo</span></div>` : ""}
      <div class="kpi"><span class="l">Clientes activos</span><span class="v">${int(b.clientes)}</span><span class="s">${int(b.equipos)} equipos</span></div>
      <div class="kpi"><span class="l">Actividad 7 días</span><span class="v">${int(b.llamadas_7d)}</span><span class="s">llamadas · ${int(b.reuniones_7d)} reuniones</span></div>
      <a class="kpi" href="#/bandeja"><span class="l">Por revisar y entrantes</span><span class="v ${C.bandeja ? "warn" : ""}">${int(C.bandeja)}</span><span class="s">${int(C.vencidas)} acciones vencidas</span></a>
      ${b.unicas ? (() => { const m = unicasMes(b.unicas); return `<div class="kpi"><span class="l">Ventas únicas de ${mesNombre(m.mes)}</span><span class="v">${clpM(m.total)}</span><span class="s">${int(m.n)} facturas fuera del MRR · licencias del mes ${clpM(b.unicas.licencias_mes)}</span></div>`; })() : ""}</div>
    ${b.unicas ? (() => { const U = b.unicas, max = Math.max(1, ...(U.meses || []).map((m) => m.total)); return `<div class="grid2">
      <section class="card"><div class="card-h"><h3>Ventas únicas por mes</h3><span class="r faint" style="font-size:12px">equipos, cámaras, instalaciones y desinstalaciones</span></div><div class="card-b bars">${(U.meses || []).length ? U.meses.map((m) => `<div class="bar-row" title="${esc(unicasDetalle(m))}"><span class="lab" style="text-transform:capitalize">${mesNombre(m.mes)}</span><span class="bar-track"><i style="width:${Math.max(0, (m.total / max) * 100)}%;background:var(--u-blackgps)"></i></span><span class="n">${clpM(m.total)}</span></div>`).join("") : '<div class="muted">Sin ventas únicas en los últimos meses.</div>'}</div></section>
      <section class="card"><div class="card-h"><h3>Facturas únicas de ${mesNombre(unicasMes(U).mes)}</h3><span class="badge">${(U.mes_actual || []).length}</span></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${(U.mes_actual || []).length ? U.mes_actual.map((f) => `<div class="row" style="gap:10px;align-items:flex-start"><span class="pill">${esc(TIPO_UNICA[f.tipo] || f.tipo)}</span><div style="flex:1;min-width:0"><b>${f.documento ? "Factura " + esc(f.documento) : "Sin folio"}</b> · ${fecha(f.fecha)}<div class="muted" style="font-size:12px">${esc((f.detalle || "").replace(/^Factura (N° )?\d+ ?·? ?/, ""))}</div></div><b style="white-space:nowrap">${clp(f.monto)}</b></div>`).join("") : '<div class="muted">Sin facturas fuera del MRR este mes.</div>'}</div></section></div>`; })() : ""}
    <div class="grid2">
      ${embudoCard("Embudo BlackGPS · somosB2B", ETAPAS.blackgps, C.por_etapa || [], "#/embudo/blackgps")}
      ${b.top ? `<section class="card"><div class="card-h"><h3>Concentración de la cartera</h3><span class="r faint" style="font-size:12px">sobre 20% es riesgo estructural</span></div><div class="card-b bars">${b.top.map((t) => `<a class="bar-row" href="#/cliente/${t.empresa_id}"><span class="lab">${esc(t.empresa)}</span><span class="bar-track"><i style="width:${Math.min(100, t.pct * 3)}%;background:${t.pct > 20 ? "var(--bad)" : "var(--c, var(--brand))"}"></i></span><span class="n">${String(t.pct).replace(".", ",")}%</span></a>`).join("")}</div></section>` : ""}
    </div>
    <div class="grid2">
      <section class="card"><div class="card-h"><h3>Clientes en riesgo</h3><span class="badge ${b.riesgo?.length ? "bad" : ""}">${(b.riesgo || []).length}</span></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${(b.riesgo || []).length ? b.riesgo.map((r) => `<a class="row" href="#/cliente/${r.empresa_id}" style="justify-content:space-between"><span>${esc(r.empresa)} <span class="faint">· ${int(r.equipos)} equipos</span></span><span class="pill ${r.riesgo === "alto" ? "bad" : "warn"}">${esc(r.riesgo)}${r.valor != null ? " · " + clpM(r.valor) : ""}</span></a>`).join("") : '<span class="muted">Sin clientes marcados en riesgo.</span>'}</div></section>
      <section class="card"><div class="card-h"><h3>Cuentas grandes en curso</h3><span class="r faint" style="font-size:12px">flota de 50 o más</span></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${(b.cuentas_clave || []).length ? b.cuentas_clave.map((c) => `<a class="row" href="#/cliente/${c.empresa_id}" style="justify-content:space-between"><span>${esc(c.empresa)} <span class="faint">· ${int(c.flota)} veh. · ${esc(etapaTxt(c.etapa))}</span></span><span class="pill ${c.proxima_fecha && c.proxima_fecha < hoyISO() ? "bad" : ""}">${fecha(c.proxima_fecha)}</span></a>`).join("") : '<span class="muted">Sin cuentas grandes en reunión, Asisma u onboarding.</span>'}</div></section>
    </div>`;
  }
  if (u === "carclass" && L.carclass) {
    const k = L.carclass, util = k.venta_mes != null ? k.venta_mes - (k.costo_mes || 0) : null;
    const mz = k.mezcla || [], maxM = Math.max(1, ...mz.map((m) => m.venta));
    return `${uBand(u, `${k.venta_mes != null ? metaBar(k.venta_mes, metaV(L, "carclass.venta_mes"), clpM, "Venta del mes · meta diciembre") + metaBar(util, metaV(L, "carclass.utilidad_mes"), clpM, "Margen del mes (venta − costo de partner)") : ""}`)}
    <div class="kpis">
      <a class="kpi" href="#/cotizaciones"><span class="l">Cotizaciones abiertas</span><span class="v">${int(k.cot_pendientes)}</span><span class="s">${int(k.cot_vistas)} vistas por el cliente</span></a>
      <a class="kpi" href="#/embudo/carclass"><span class="l">Sin seguimiento 48 h</span><span class="v ${k.sin_seguimiento ? "bad" : ""}">${int(k.sin_seguimiento)}</span><span class="s">de ${int(k.cotizadas)} cotizadas o negociando</span></a>
      <a class="kpi" href="#/embudo/carclass"><span class="l">Agenda y taller</span><span class="v">${int(k.agendados)}<span class="faint" style="font-size:18px"> · ${int(k.en_taller)}</span></span><span class="s">agendados · en Hiendcar</span></a>
      ${k.ticket_12m != null ? `<div class="kpi"><span class="l">Ticket promedio 12 meses</span><span class="v">${clpM(k.ticket_12m)}</span><span class="s">última venta ${fecha(k.ultima_venta)}</span></div>` : ""}
    </div>
    ${k.meses ? `<div class="grid-main"><section class="card" style="--c:var(--u-carclass)"><div class="card-h"><h3>Venta por mes</h3><span class="r faint" style="font-size:12px">con IVA · registro en Core</span></div><div class="card-b">${chartVentaMes(k.meses, metaV(L, "carclass.venta_mes"))}</div></section>
      <section class="card"><div class="card-h"><h3>Mezcla de servicios</h3><span class="r faint" style="font-size:12px">12 meses · margen %</span></div><div class="card-b bars">${mz.map((m) => `<div class="bar-row"><span class="lab">${esc(m.tipo)}</span><span class="bar-track"><i style="width:${(m.venta / maxM) * 100}%;background:var(--u-carclass)"></i></span><span class="n">${m.venta ? Math.round((m.margen / m.venta) * 100) : 0}%</span></div>`).join("")}
        <p class="faint" style="font-size:12px;margin:6px 0 0">Lavado, detailing y cerámico dejan más margen que pintura y reparación: es la palanca para la meta.</p></div></section></div>` : ""}
    <div class="grid2">${embudoCard("Embudo Carclass", ETAPAS.carclass, C.por_etapa || [], "#/embudo/carclass")}
      <section class="card"><div class="card-h"><h3>Reglas que cuidan el margen</h3></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">
        <div>${ico("check", 14)} PPF nunca solo: va con cerámico, corrección y láminas.</div><div>${ico("check", 14)} XPEL Ultimate Plus por defecto; Gloss solo como ancla.</div><div>${ico("check", 14)} Pago 50/50: reserva y saldo a la entrega.</div><div>${ico("check", 14)} Seguimiento de cotización a las 48 h y a los 5 días.</div>
        <button class="btn primary sm" data-cotnueva style="justify-self:start;margin-top:6px">${ico("doc", 14)} Nueva cotización</button></div></section></div>`;
  }
  if (u === "nom" && L.nom) {
    const n = L.nom, tope = metaV(L, "nom.rotacion_dias") || 45, st = n.stock || [];
    const valor = st.reduce((a, s) => a + Number(s.precio || 0), 0), prom = st.length ? Math.round(st.reduce((a, s) => a + (s.dias || 0), 0) / st.length) : 0;
    const porF = (f) => (C.por_etapa || []).filter((r) => r.flujo === f);
    return `${uBand(u, `${metaBar(n.ventas_mes, metaV(L, "nom.ventas_mes"), int, "Ventas cerradas este mes · meta mínima")}<div class="meta"><div class="meta-k">Días promedio en stock · tope de rotación ${tope} días</div><div class="meta-l"><span><b>${prom} días</b></span><span class="${prom > tope ? "bad-t" : "ok-t"}">${prom > tope ? `${prom - tope} días sobre el tope` : "dentro del tope"}</span></div><div class="meta-t"><i style="width:${Math.min(100, (prom / tope) * 100)}%;background:${prom > tope ? "var(--bad)" : "var(--ok)"}"></i></div></div>`)}
    <div class="kpis">
      <a class="kpi" href="#/vehiculos?f=stock"><span class="l">Stock disponible</span><span class="v">${int(st.length)}</span><span class="s">${valor ? clpM(valor) + " publicado" : "sin precio publicado cargado"}</span></a>
      <a class="kpi" href="#/embudo/nom/consignante"><span class="l">Consignantes en curso</span><span class="v">${int(n.consignantes)}</span><span class="s">${int(n.revisiones)} revisiones agendadas</span></a>
      <a class="kpi" href="#/embudo/nom/comprador"><span class="l">Compradores en curso</span><span class="v">${int(n.compradores)}</span><span class="s">${int(n.visitas)} visitas agendadas</span></a>
      ${n.ingreso_mes != null ? `<div class="kpi"><span class="l">Ingreso del mes</span><span class="v">${clpM(n.ingreso_mes)}</span><span class="s">última venta ${fecha(n.ultima_venta)}</span></div>` : ""}
    </div>
    <section class="card"><div class="card-h"><h3>Stock y rotación</h3><span class="r faint" style="font-size:12px">tope ${tope} días</span></div>${st.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Vehículo</th><th>Patente</th><th>Modalidad</th><th class="num">Precio publicado</th><th class="num">Días</th><th>Inspección</th></tr></thead><tbody>
      ${st.map((s) => `<tr><td class="name">${esc(s.auto)}</td><td>${esc(s.patente || "—")}</td><td>${s.modalidad === "compra_directa" ? "Propio" : "Consignado"}</td><td class="num">${s.precio ? clp(s.precio) : '<span class="pill warn">sin precio</span>'}</td><td class="num"><span class="pill ${s.dias > tope ? "bad" : s.dias > tope * 0.7 ? "warn" : "ok"}">${int(s.dias)}</span></td><td>${s.inspeccion ? `<span class="pill ${s.inspeccion.veredicto === "APTO" ? "ok" : "warn"}">${esc(s.inspeccion.veredicto || "")} · ${int(s.inspeccion.score)}%</span>` : '<span class="pill">sin inspección</span>'}</td></tr>`).join("")}
      </tbody></table></div>` : empty("car", "Sin stock disponible", "La palanca es captar consignantes.")}</section>
    <div class="grid2">${embudoCard("Consignantes", ETAPAS.consignante, porF("consignante"), "#/embudo/nom/consignante")}${embudoCard("Compradores", ETAPAS.comprador, porF("comprador"), "#/embudo/nom/comprador")}</div>`;
  }
  if (u === "carwash" && L.carwash) {
    const w = L.carwash, cap = metaV(L, "carwash.capacidad_dia") || 4, ag = (w.agenda_7d || []).reduce((a, d) => a + d.n, 0), abiertos = (w.agenda_7d || []).filter((d) => cwAbreEl(d.fecha)).length;
    return `${uBand(u, metaBar(ag, cap * abiertos, int, `Ocupación de los próximos 7 días · ${abiertos} días de atención × ${cap} autos · ${cwHorario()}`))}
    <div class="kpis">
      <div class="kpi"><span class="l">Atendidos 30 días</span><span class="v">${int(w.atendidos_30d)}</span><span class="s">servicios cerrados</span></div>
      ${w.venta_mes != null ? `<div class="kpi"><span class="l">Venta del mes</span><span class="v">${clpM(w.venta_mes)}</span><span class="s">con IVA</span></div>` : ""}
      <div class="kpi"><span class="l">Por recomprar</span><span class="v">${int(w.recompra)}</span><span class="s">clientes sin volver en 30 días</span></div>
      <a class="kpi" href="#/bandeja"><span class="l">En bandeja</span><span class="v">${int(C.bandeja)}</span><span class="s">esperando coordinación</span></a>
    </div>
    <div class="grid2"><section class="card"><div class="card-h"><h3>Agenda de la semana</h3><span class="r faint" style="font-size:12px">máximo ${cap} por día</span></div><div class="card-b bars">${(w.agenda_7d || []).map((d) => { const ab = cwAbreEl(d.fecha); return `<div class="bar-row"${ab ? "" : ' style="opacity:.45"'}><span class="lab" style="text-transform:capitalize">${parseD(d.fecha).toLocaleDateString("es-CL", { weekday: "short", day: "numeric" })}</span><span class="bar-track"><i style="width:${ab ? Math.min(100, (d.n / cap) * 100) : 0}%;background:${d.n >= cap || (!ab && d.n) ? "var(--bad)" : "var(--u-carwash)"}"></i></span><span class="n">${ab ? `${d.n}/${cap}` : d.n ? `${d.n} · cerrado` : "cerrado"}</span></div>`; }).join("")}</div></section>
      ${embudoCard("Embudo Carwash.hf", ETAPAS.carwash, C.por_etapa || [], "#/embudo/carwash")}</div>`;
  }
  return "";
}
function comercialDash(d, u) {
  const conv = d.leads ? (d.ganadas / d.leads) * 100 : 0;
  const slaPct = d.con_respuesta ? Math.round((d.sla_5min / d.con_respuesta) * 100) : null;
  const canales = d.por_canal || []; const maxC = Math.max(1, ...canales.map((x) => x.n));
  return `
    <h2 class="sec">Comercial${u ? "" : " del grupo"} <span class="faint">· leads del rango</span></h2>
    <div class="kpis">
      <div class="kpi"><div class="top-row"><span class="l">Leads totales</span><span class="ki">${ico("inbox", 17)}</span></div><span class="v">${int(d.leads)}</span><span class="s">${int(d.abiertas)} abiertos · ${int(d.perdidas)} perdidos</span></div>
      <div class="kpi"><div class="top-row"><span class="l">Tasa de conversión</span><span class="ki">${ico("trophy", 17)}</span></div><span class="v">${conv.toLocaleString("es-CL", { maximumFractionDigits: 1 })}%</span><span class="s">${int(d.ganadas)} ganados de ${int(d.leads)}</span></div>
      <div class="kpi"><div class="top-row"><span class="l">Respuesta promedio</span><span class="ki">${ico("clock", 17)}</span></div><span class="v ${d.respuesta_min > 5 ? "warn" : ""}">${d.respuesta_min == null ? "—" : minTxt(d.respuesta_min)}</span><span class="s">${slaPct == null ? "sin respuestas medidas en el rango" : `${slaPct}% en 5 min o menos`}</span></div>
      ${ME.ve_finanzas ? `<a class="kpi" href="#/finanzas"><div class="top-row"><span class="l">Ventas pagadas</span><span class="ki gold">${ico("money", 17)}</span></div><span class="v">${clpM(d.ventas_pagadas)}</span><span class="s">${clpM(d.ventas_cerradas)} cerradas · ${int(d.n_ventas)} ventas</span></a>` : ""}
    </div>
    <div class="grid-main">
      <section class="card"><div class="card-h"><h3>Evolución mensual</h3><div class="r legend"><span style="--c:var(--brand-100)">Leads creados</span><span style="--c:var(--brand)">Ganados</span></div></div><div class="card-b">${chartEvolucion(d.evolucion || [])}</div></section>
      <section class="card"><div class="card-h"><h3>Origen y canal</h3></div><div class="card-b bars">${canales.length ? canales.map((x) => `<div class="bar-row"><span class="lab">${esc(CANAL_TXT[x.canal] || x.canal)}</span><span class="bar-track"><i style="width:${(x.n / maxC) * 100}%"></i></span><span class="n">${int(x.n)}<span class="faint" style="font-weight:500"> · ${int(x.ganadas)}✓</span></span></div>`).join("") : empty("inbox", "Sin leads en el rango")}
        ${(d.por_campana || []).length ? `<div style="margin-top:14px"><div class="lbl" style="margin-bottom:8px">Campañas</div>${d.por_campana.map((x) => `<div class="row" style="justify-content:space-between;font-size:13px;padding:4px 0"><span>${esc(x.campana)}</span><span class="num"><b>${int(x.n)}</b> <span class="faint">· ${int(x.ganadas)} ganados</span></span></div>`).join("")}</div>` : ""}
        <div class="lbl" style="margin:14px 0 6px">SLA de primera respuesta</div>${d.con_respuesta ? `<div class="sla-bar"><i style="width:${slaPct}%;background:var(--ok)"></i><i style="width:${100 - slaPct}%;background:var(--warn)"></i></div>` : `<div class="muted" style="font-size:12.5px">Sin respuestas medidas en este rango.</div>`}</div></section>
    </div>
    <p class="faint" style="font-size:12px;margin:0">Leads = oportunidades creadas en el rango.</p>`;
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

/* ---------- directorio · tablero central de los agentes (solo dueño, core_v84) ---------- */
// Lo escriben los agentes de Claude (Director, Comercial, Marketing, Operaciones, Finanzas, Estrategia) y el asesor de WhatsApp.
const DIR_U = [["blackgps", "BlackGPS"], ["carclass", "Carclass"], ["nom", "NOM"], ["carwash", "Carwash.hf"], ["holding", "Grupo"]];
const DIR_TABS = [["resumen", "Resumen"], ["blackgps", "BlackGPS"], ["carclass", "Carclass"], ["nom", "NOM"], ["carwash", "Carwash.hf"], ["asesor", "Asesor WhatsApp"], ["alertas", "Alertas"], ["bitacora", "Bitácora"]];
const DIR_EST = [["pendiente", "Pendiente"], ["en_curso", "En curso"], ["bloqueado", "Bloqueado"], ["hecho", "Hecho"], ["descartado", "Descartado"]];
const DIR_AG = { director: "Director", comercial: "Comercial", marketing: "Marketing", operaciones: "Operaciones", finanzas: "Finanzas", estrategia: "Estrategia", asesor_wa: "Asesor WA", felipe: "Tú" };
const DIR_TIPO = { avance: "ok", retroceso: "bad", bloqueo: "bad", decision: "gold", prueba: "info", nota: "" };
const dirU = (k) => (DIR_U.find((x) => x[0] === k) || [k, uName(k)])[1];
const dirUc = (k) => k === "holding" ? "var(--u-grupo)" : `var(--u-${k})`;
function dirLuz(D, u) {
  if (u === "carwash") return "n";
  const hoy = hoyISO(), a = D.alert.filter((x) => x.unidad === u), p = D.pend.filter((x) => x.unidad === u);
  if (a.some((x) => x.prioridad === "alta")) return "r";
  if (a.length || p.some((x) => x.estado === "bloqueado" || (x.fecha && x.fecha < hoy))) return "y";
  return "g";
}
const DIR_LUZ = { g: ["ok", "En curso"], y: ["warn", "Atención"], r: ["bad", "En rojo"], n: ["", "En pausa"] };
function dirPend(p) {
  const hoy = hoyISO(), venc = p.fecha && p.fecha < hoy;
  return `<div class="task"><span class="pill ${p.prioridad === 1 ? "bad" : p.prioridad === 2 ? "warn" : ""}" title="Prioridad">P${esc(p.prioridad)}</span>
    <div><div class="t" style="font-weight:600">${esc(p.titulo)}</div>
    <div class="muted" style="font-size:12.5px">${[dirU(p.unidad), DIR_AG[p.dueno] || esc(p.dueno), p.area ? esc(p.area.replace("_", " ")) : "", p.origen ? esc(p.origen) : ""].filter(Boolean).join(" · ")}</div>
    ${p.detalle ? `<div class="muted" style="font-size:13px;margin-top:4px">${esc(p.detalle)}</div>` : ""}</div>
    <div style="display:grid;gap:6px;justify-items:end"><span class="pill ${venc ? "bad" : p.fecha === hoy ? "warn" : ""}">${p.fecha ? fecha(p.fecha) + (venc ? " · vencido" : "") : "sin fecha"}</span>
    <select class="input" data-dp="${esc(p.id)}" aria-label="Estado" style="height:34px;width:auto">${DIR_EST.map(([k, t]) => `<option value="${k}" ${k === p.estado ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>`;
}
function dirAlerta(a) {
  return `<div class="task"><span class="pill ${a.prioridad === "alta" ? "bad" : a.prioridad === "media" ? "warn" : ""}">${esc(a.prioridad)}</span>
    <div><div class="t" style="font-weight:600">${esc(a.titulo)}</div>${a.detalle ? `<div class="muted" style="font-size:13px;margin-top:4px">${esc(a.detalle)}</div>` : ""}
    <div class="faint" style="font-size:12px;margin-top:4px">${dirU(a.unidad)} · ${fecha(a.fecha)}</div></div>
    <button class="btn sm" data-da="${esc(a.id)}">${ico("check", 14)} Resolver</button></div>`;
}
function dirBit(b) {
  return `<div class="task"><span class="pill ${DIR_TIPO[b.tipo] ?? ""}">${esc(b.tipo === "decision" ? "decisión" : b.tipo)}</span>
    <div><div class="t" style="font-weight:600">${esc(b.titulo)}</div>${b.detalle ? `<div class="muted" style="font-size:13px;margin-top:4px">${esc(b.detalle)}</div>` : ""}
    <div class="faint" style="font-size:12px;margin-top:4px">${[fecha(b.fecha), DIR_AG[b.agente] || esc(b.agente), dirU(b.unidad), b.fuente ? esc(b.fuente) : ""].filter(Boolean).join(" · ")}</div></div><span></span></div>`;
}
const dirCard = (titulo, html, vacio, extra = "") => `<section class="card"><div class="card-h"><h3>${titulo}</h3>${extra}</div>${html || `<div class="card-b">${empty("check", vacio)}</div>`}</section>`;
function dirMarcador(rows) {
  if (!rows.length) return `<div class="card">${empty("chart", "Sin marcador esta semana", "El Director carga las metas el viernes en la revisión semanal.")}</div>`;
  const val = (v, m) => v == null ? "—" : /CLP/.test(m || "") ? clpM(v) : int(v);
  return `<div class="kpis">${rows.map((r) => { const pc = r.meta && r.real != null ? Math.min(100, Math.round((r.real / r.meta) * 100)) : null;
    return `<div class="kpi"><span class="l">${esc(r.kpi)}</span><span class="v ${pc != null && pc < 50 ? "warn" : ""}">${val(r.real, r.medida)}</span>
      <span class="s">Meta ${val(r.meta, r.medida)}${r.medida && !/CLP/.test(r.medida) ? " " + esc(r.medida) : ""}${pc != null ? ` · ${pc}%` : ""} · ${esc(r.tipo)}</span>
      ${pc != null ? `<div class="bar-track"><i style="width:${pc}%"></i></div>` : ""}${r.nota ? `<span class="s faint">${esc(r.nota)}</span>` : ""}<span class="s faint">${esc(r.fuente || "")}</span></div>`; }).join("")}</div>`;
}
async function viewDirectorio(params) {
  setActive("directorio");
  const t = params.get("t") || "resumen", bf = params.get("u") || "";
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Directorio</h1><p>Tablero central de los agentes: lo que avanza, lo que retrocede, lo que está bloqueado y lo que necesita tu atención. Lo escriben el Director, los directores de área y el asesor de WhatsApp.</p></div>
    <div class="actions"><button class="btn" id="d-new">${ico("plus", 16)} Pendiente</button><button class="btn primary" id="d-nota">${ico("note", 16)} Nota al Director</button></div></div>
    <div class="tabs">${DIR_TABS.map(([k, tt]) => `<a href="#/directorio?t=${k}" class="${t === k ? "on" : ""}">${tt}</a>`).join("")}</div><div id="dl" style="display:grid;gap:20px">${loading(6)}</div>`;
  const recargar = () => viewDirectorio(params);
  $("#d-nota").onclick = () => dirModalNota(recargar);
  $("#d-new").onclick = () => dirModalPend(recargar, DIR_U.some(([k]) => k === t) ? t : "holding");
  let D;
  try { D = await rpc("app_directorio"); } catch (e) { $("#dl").innerHTML = fail(e); return; }
  const hoy = hoyISO(), $l = $("#dl");
  const altas = D.alert.filter((a) => a.prioridad === "alta"), p1 = D.pend.filter((p) => p.prioridad === 1), venc = D.pend.filter((p) => p.fecha && p.fecha < hoy);
  if (t === "resumen") {
    $l.innerHTML = `<p class="muted" style="margin:0;font-size:15px"><b>${altas.length} alertas altas, ${p1.length} pendientes de prioridad 1 y ${venc.length} vencidos.</b> Empieza por lo rojo. Actualizado ${esc(D.generado)}.</p>
      <div class="kpis">${DIR_U.map(([k, n]) => { const L = DIR_LUZ[dirLuz(D, k)], p = D.pend.filter((x) => x.unidad === k), a = D.alert.filter((x) => x.unidad === k);
        return `<a class="kpi" href="#/directorio?t=${k === "holding" ? "alertas" : k}" style="border-top:3px solid ${dirUc(k)}"><div class="top-row"><span class="l">${n}</span><span class="pill ${L[0]}">${L[1]}</span></div>
          <span class="v">${p.length}</span><span class="s">pendientes · ${p.filter((x) => x.estado === "bloqueado").length} bloqueados · ${a.length} alertas</span></a>`; }).join("")}</div>
      <div class="grid-main">${dirCard("Prioridad 1", p1.map(dirPend).join(""), "Nada en prioridad 1", `<span class="badge">${p1.length}</span>`)}
        ${dirCard("Alertas altas", altas.map(dirAlerta).join(""), "Sin alertas altas", `<span class="badge bad">${altas.length}</span>`)}</div>
      ${dirCard("Últimos movimientos", D.bit.slice(0, 8).map(dirBit).join(""), "Sin registros", `<a class="r" href="#/directorio?t=bitacora">Ver bitácora</a>`)}`;
  } else if (DIR_U.some(([k]) => k === t)) {
    const m = D.marc.filter((x) => x.unidad === t), p = D.pend.filter((x) => x.unidad === t), a = D.alert.filter((x) => x.unidad === t), b = D.bit.filter((x) => x.unidad === t).slice(0, 15);
    const emb = D.emb.filter((e) => e.unidad === t && e.estado === "abierta").sort((x, y) => y.n - x.n), mx = Math.max(1, ...emb.map((e) => e.n));
    const L = DIR_LUZ[dirLuz(D, t)];
    $l.innerHTML = `<div class="row" style="align-items:center;gap:10px"><h2 style="margin:0">${dirU(t)}</h2><span class="pill ${L[0]}">${L[1]}</span>${m[0] ? `<span class="faint" style="font-size:13px">Marcador semana del ${fecha(m[0].semana)}</span>` : ""}</div>
      ${dirMarcador(m)}
      <div class="grid-main">${dirCard("Pendientes", p.map(dirPend).join(""), "Sin pendientes abiertos", `<span class="badge">${p.length}</span>`)}
        <div style="display:grid;gap:20px">${dirCard("Alertas", a.map(dirAlerta).join(""), "Sin alertas")}
        ${dirCard("Embudo en Core · 30 días", emb.length ? `<div class="card-b bars">${emb.map((e) => `<div class="bar-row"><span class="lab">${esc(etapaTxt(e.etapa))}</span><div class="bar-track"><i style="width:${Math.round((e.n / mx) * 100)}%"></i></div><span class="n">${int(e.n)}</span></div>`).join("")}</div>` : "", "Sin oportunidades abiertas")}</div></div>
      ${dirCard("Bitácora de la unidad", b.map(dirBit).join(""), "Sin registros")}`;
  } else if (t === "asesor") {
    const w = D.wa, mx = Math.max(1, ...w.map((x) => x.respuestas_ok + x.errores)), last = w.find((x) => x.ultimo_error);
    const tot = w.reduce((s, x) => s + Number(x.costo_usd || 0), 0), ok = w.reduce((s, x) => s + x.respuestas_ok, 0), er = w.reduce((s, x) => s + x.errores, 0);
    $l.innerHTML = `<div class="kpis"><div class="kpi"><span class="l">Respuestas OK · 14 días</span><span class="v">${int(ok)}</span><span class="s">${int(w.reduce((s, x) => s + x.leads_nuevos, 0))} leads nuevos</span></div>
      <div class="kpi"><span class="l">Errores · 14 días</span><span class="v ${er ? "bad" : ""}">${int(er)}</span><span class="s">${w[0] && w[0].errores && !w[0].respuestas_ok ? "hoy no está enviando" : "sin caída total hoy"}</span></div>
      <div class="kpi"><span class="l">Costo IA · 14 días</span><span class="v">US$${tot.toLocaleString("es-CL", { maximumFractionDigits: 2 })}</span><span class="s">API de Anthropic</span></div></div>
      ${last ? `<div class="alert">${ico("alert", 16)}<div><b>Último error (${fecha(last.dia)}):</b> <span style="overflow-wrap:anywhere">${esc(last.ultimo_error)}</span></div></div>` : ""}
      <div class="grid-main">${dirCard("Respuestas y errores por día", `<div class="card-b bars">${w.map((x) => `<div class="bar-row"><span class="lab">${fecha(x.dia)} · ${int(x.leads_nuevos)} leads</span><div class="bar-track" style="display:flex"><i style="width:${(x.respuestas_ok / mx) * 100}%;border-radius:0"></i><i style="width:${(x.errores / mx) * 100}%;background:var(--bad);border-radius:0"></i></div><span class="n">${int(x.respuestas_ok)}/${int(x.errores)}</span></div>`).join("")}</div>`, "Sin datos")}
        ${dirCard("Pendientes del asesor", D.pend.filter((p) => p.area === "asesor_wa").map(dirPend).join(""), "Sin pendientes")}</div>
      ${dirCard("Bitácora del asesor", D.bit.filter((b) => b.agente === "asesor_wa").map(dirBit).join(""), "Sin registros")}`;
  } else if (t === "alertas") {
    $l.innerHTML = dirCard("Alertas abiertas", D.alert.map(dirAlerta).join(""), "Sin alertas abiertas", `<span class="badge">${D.alert.length}</span>`);
  } else {
    const rows = D.bit.filter((b) => !bf || b.unidad === bf);
    $l.innerHTML = `<div class="chips">${[["", "Todas"], ...DIR_U].map(([k, n]) => `<a class="chip ${bf === k ? "on" : ""}" href="#/directorio?t=bitacora${k ? "&u=" + k : ""}">${n}</a>`).join("")}</div>
      ${dirCard("Bitácora del Directorio", rows.map(dirBit).join(""), "Sin registros")}
      ${D.hechos.length ? dirCard("Pendientes cerrados recientemente", D.hechos.map((h) => `<div class="task hecha"><span class="check">${ico("check", 13)}</span><div><div class="t">${esc(h.titulo)}</div><div class="faint" style="font-size:12px">${dirU(h.unidad)} · ${fecha(h.actualizado)}</div></div><span></span></div>`).join(""), "") : ""}`;
  }
  $$("[data-dp]", $l).forEach((sel) => sel.onchange = async () => {
    try { await rpc("app_dir_pendiente", { p_id: sel.dataset.dp, p_estado: sel.value }); toast("Estado guardado"); setTimeout(recargar, 300); } catch (e) { toast(e.message, true); }
  });
  $$("[data-da]", $l).forEach((b) => b.onclick = async () => {
    b.disabled = true; try { await rpc("app_dir_alerta", { p_id: b.dataset.da }); toast("Alerta resuelta"); recargar(); } catch (e) { b.disabled = false; toast(e.message, true); }
  });
}
function dirModalNota(after) {
  const root = modal("Nota al Director", `<p class="muted" style="margin:0;font-size:13px">Una decisión, un avance o algo que el Director debe saber. Queda en la bitácora y los agentes la leen al abrir.</p>
    <div class="field"><label for="dn-t">Nota</label><textarea class="input" id="dn-t" style="min-height:110px"></textarea></div>
    <div class="row"><div class="field"><label for="dn-u">Unidad</label><select class="input" id="dn-u">${DIR_U.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></div>
    <div class="field"><span class="lbl">Tipo</span>${seg("dntipo", [["nota", "Nota"], ["decision", "Decisión"], ["avance", "Avance"], ["retroceso", "Retroceso"], ["bloqueo", "Bloqueo"]], "nota")}</div></div>`,
    async () => { await rpc("app_dir_nota", { p_unidad: $("#dn-u").value, p_tipo: segVal(root, "dntipo"), p_texto: $("#dn-t").value }); toast("Nota guardada en la bitácora"); after && after(); }, "Guardar nota");
  bindSeg(root);
}
function dirModalPend(after, unidad) {
  const root = modal("Nuevo pendiente del Directorio", `
    <div class="field"><label for="dp-t">Qué hay que hacer</label><input class="input" id="dp-t"></div>
    <div class="field"><label for="dp-d">Detalle</label><textarea class="input" id="dp-d" style="min-height:70px"></textarea></div>
    <div class="row"><div class="field"><label for="dp-u">Unidad</label><select class="input" id="dp-u">${DIR_U.map(([k, n]) => `<option value="${k}" ${k === unidad ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="dp-a">Área</label><select class="input" id="dp-a">${["comercial", "marketing", "operaciones", "finanzas", "estrategia", "asesor_wa", "postventa", "direccion"].map((k) => `<option value="${k}">${k.replace("_", " ")}</option>`).join("")}</select></div></div>
    <div class="row"><div class="field"><label for="dp-o">Dueño</label><select class="input" id="dp-o">${Object.entries(DIR_AG).filter(([k]) => k !== "asesor_wa").map(([k, n]) => `<option value="${k}" ${k === "felipe" ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div class="field"><label for="dp-f">Fecha</label><input class="input" id="dp-f" type="date" value="${diaHabil(1)}"></div></div>
    <div class="field"><span class="lbl">Prioridad</span>${seg("dpprio", [["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]], "2")}</div>`,
    async () => {
      if (!$("#dp-t").value.trim()) throw new Error("Escribe qué hay que hacer.");
      await rpc("app_dir_pendiente_nuevo", { p: { titulo: $("#dp-t").value.trim(), detalle: $("#dp-d").value.trim(), unidad: $("#dp-u").value, area: $("#dp-a").value, dueno: $("#dp-o").value, fecha: $("#dp-f").value, prioridad: Number(segVal(root, "dpprio")) } });
      toast("Pendiente creado"); after && after();
    }, "Crear pendiente");
  bindSeg(root);
}

/* ---------- notificaciones ---------- */
async function viewNotificaciones() {
  setActive("notificaciones");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Notificaciones</h1><p>Centro de avisos. Con los avisos activos, los leads nuevos y los que llevan 5 minutos sin respuesta también llegan a este dispositivo.</p></div>
    <div class="actions"><button class="btn" id="n-all">${ico("check", 16)} Marcar todo como leído</button></div></div><div id="nl">${loading(5)}</div>`;
  await cargarAvisos();
  const rd = leidos();
  const tipos = [["Lead nuevo", "activo"], ["Lead sin respuesta a los 5 minutos", "activo"], ["Cliente pide hablar con una persona", "activo"], ["Cotización vista", "activo"], ["Cita en 1 hora (agendada por el asesor)", "activo"]];
  $("#nl").innerHTML = `<div class="grid-main"><section class="card">${AVISOS.length ? AVISOS.map((a) => `<a class="notif ${rd.has(a.id) ? "" : "unread"}" href="${a.href}" data-id="${esc(a.id)}"><span class="ic ${a.level === "bad" ? "bad" : a.level === "warn" ? "warn" : ""}">${ico(a.icon, 17)}</span><div><div class="t">${esc(a.title)}</div><div class="muted" style="font-size:12.5px">${esc(a.body)}</div><div class="d">${hace(a.at)}</div></div></a>`).join("") : empty("bell", "Sin avisos", "Cuando entre un lead o venza una tarea, aparecerá aquí.")}</section>
    <section class="card"><div class="card-h"><h3>Avisos al dispositivo</h3></div><div class="card-b" style="display:grid;gap:10px;font-size:13px">
      ${tipos.map(([t, s]) => `<div class="row" style="justify-content:space-between;align-items:center"><span>${t}</span><span class="pill ${s === "activo" ? "ok" : ""}">${s}</span></div>`).join("")}
      <p class="faint" style="margin:6px 0 0;font-size:12px">${lsGet("cc_push") === "1" ? "Este dispositivo recibe avisos también con la app cerrada." : "Activa los avisos en cada dispositivo (teléfono y computador) para recibirlos también con la app cerrada."} En iPhone, primero instala la app: Safari → Compartir → Agregar a pantalla de inicio.</p>
      <button class="btn primary" id="n-act">${ico("bell", 15)} ${"Notification" in window && Notification.permission === "granted" ? "Probar aviso" : "Activar avisos en este dispositivo"}</button>
      <div class="push-devs"><div class="row" style="justify-content:space-between;align-items:center"><b style="font-size:13px">Dispositivos que reciben avisos</b><button class="btn sm" id="n-probar">Enviar prueba a todos</button></div><div id="n-devs">${loading(2)}</div></div></div></section></div>`;
  $$("#nl .notif").forEach((a) => a.addEventListener("click", () => marcarLeidos([a.dataset.id])));
  $("#n-all").onclick = () => { const rd2 = leidos(); marcarLeidos(AVISOS.map((a) => a.id).filter((x) => !rd2.has(x))); viewNotificaciones(); };
  $("#n-act").onclick = activarAvisos;
  const pintarDevs = async () => {
    let l = []; try { l = await rpc("app_push_dispositivos") || []; } catch (e) { $("#n-devs").innerHTML = `<p class="faint" style="font-size:12px">${esc(e.message)}</p>`; return; }
    const nav = (ua) => /edg\//i.test(ua) ? "Edge" : /chrome\//i.test(ua) ? "Chrome" : /firefox/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "";
    $("#n-devs").innerHTML = l.length ? l.map((d) => `<div class="push-dev ${d.activa ? "" : "off"}"><span>${ico(["iPhone", "Android"].includes(d.tipo) ? "phone" : "monitor", 15)}</span>
      <div><b>${esc(d.tipo || "Dispositivo")}${nav(d.dispositivo || "") ? " · " + nav(d.dispositivo) : ""}</b><div class="faint">${d.activa ? (d.ultimo_envio ? "Último aviso " + hace(d.ultimo_envio) : "Sin avisos todavía") : "Dado de baja: ábrelo y vuelve a activar los avisos"}</div></div>
      <span class="pill ${d.activa ? "ok" : "bad"}">${d.activa ? "activo" : "inactivo"}</span></div>`).join("")
      : `<p class="faint" style="font-size:12px;margin:0">Ningún dispositivo registrado. Pulsa «Activar avisos» en cada teléfono y computador.</p>`;
    $("#n-probar").disabled = !l.some((d) => d.activa);
  };
  pintarDevs();
  $("#n-probar").onclick = async (ev) => { const b = ev.currentTarget; b.disabled = true;
    try { const r = await rpc("app_push_probar"); toast(r && r.ok ? `Aviso de prueba enviado a ${r.activos} dispositivo${r.activos === 1 ? "" : "s"}` : (r && r.mensaje) || "No hay dispositivos activos", !(r && r.ok)); }
    catch (e) { toast(e.message, true); } finally { setTimeout(pintarDevs, 3000); } };
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
    const all = (await rpc("app_bandeja", { p_tipo: "todas" })).filter((x) => enLinea(x.unidad));
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
        <div><div class="t"><a href="#/cliente/${b.empresa_id}">${esc(nombreVis(b.contacto || b.empresa))}</a>${b.contacto && b.contacto !== b.empresa && b.tipo !== "persona" ? ` <span class="muted" style="font-weight:500">· ${esc(b.empresa)}</span>` : ""}</div>
          <div class="meta">${unidadPill(b.unidad)}${b.flujo ? `<span class="pill">${esc(b.flujo)}</span>` : ""}<span>${esc(etapaTxt(b.etapa))}</span>${b.canal ? `<span>${esc(CANAL_TXT[b.canal] || b.canal)}</span>` : ""}${b.campana ? `<span class="pill gold">${esc(b.campana)}</span>` : ""}<span>${hace(b.creado)}</span>${b.telefono ? `<a href="tel:${esc(b.telefono)}">${esc(b.telefono)}</a>` : ""}${b.flota ? `<span>${int(b.flota)} vehículos</span>` : ""}</div>
          ${b.ultimo_mensaje ? `<div class="msg">${esc(b.ultimo_mensaje)}</div>` : ""}
          ${b.analisis?.resumen ? `<div class="msg"><b style="font-size:12px;color:var(--muted)">Análisis GPT${b.analisis.score != null ? ` · calce ${b.analisis.score}` : ""}${b.analisis.pilar ? ` · ${esc(b.analisis.pilar)}` : ""}</b><div>${esc(b.analisis.resumen)}</div></div>` : ""}</div>
        <div class="acts">${t === "pre_revision"
          ? `<button class="btn sm primary" data-ok="${b.oportunidad_id}">${ico("check", 14)} Aprobar</button><button class="btn sm" data-no="${b.oportunidad_id}">Descartar</button>`
          : `${wa ? `<a class="btn sm primary" href="${wa}" target="_blank" rel="noopener">${ico("chat", 14)} WhatsApp</a>` : ""}<button class="btn sm" data-act="${b.oportunidad_id}" data-nom="${esc(b.contacto || b.empresa)}" data-uni="${b.unidad || ""}">${ico("call", 14)} Registrar</button><button class="btn sm ghost" data-lose="${b.oportunidad_id}" data-nom="${esc(b.contacto || b.empresa)}">Descartar</button>`}</div>
      </div>`; }).join("")}</div>`;
    const again = () => { viewBandeja(params); cargarAvisos(); };
    $$("[data-act]").forEach((x) => x.onclick = () => modalActividad(x.dataset.act, x.dataset.nom, again, x.dataset.uni));
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
/* Chats del WhatsApp del grupo (wa.*). Nunca muestra conversaciones personales.
   El asesor IA trabaja en modo «borrador»: propone y Felipe envía desde su WhatsApp (coexistencia);
   al responder desde el teléfono, el webhook descarta el borrador y pausa al asesor 12 h. */
const MODO_TXT = { borrador: "propone borradores", observar: "solo observa", activo: "responde solo", auto: "responde solo" };
// Acciones que el asesor dejó en el borrador (crear cotización, reservar cita, traspasar…)
const ACCION_TXT = { crear_cotizacion: ["Cotización creada", "gold"], reservar_cita: ["Cita reservada", "info"], proponer_horarios: ["Propuso horarios", ""], registrar_comprobante: ["Comprobante recibido", "warn"],
  programar_seguimiento: ["Seguimiento programado", ""], traspasar_humano: ["Te lo traspasa", "bad"], descartar: ["Descartar lead (se aplica al enviar)", "warn"], asignar_unidad: ["Clasificó el chat", ""], actualizar_ficha: ["Actualizó la ficha", ""], marcar_personal: ["Marcó como personal", ""] };
const accionesTxt = (acc) => (Array.isArray(acc) ? acc : []).filter((a) => a?.herramienta && !/^consultar_/.test(a.herramienta))
  .map((a) => { const [t, cls] = ACCION_TXT[a.herramienta] || [a.herramienta.replace(/_/g, " "), ""]; const extra = a.input?.motivo || a.input?.servicio || ""; return { txt: t + (extra ? ` · ${String(extra).slice(0, 40)}` : ""), cls }; });
// Envía por WhatsApp desde Core (función wa-enviar de la sesión carclass-whatsapp)
async function waEnviar(body) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Tu sesión expiró: vuelve a ingresar.");
  const r = await fetch(`${SB_URL}/functions/v1/wa-enviar`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) { const e = new Error(r.status === 402 || /limit|cupo/i.test(j.error || "") ? "Kapso sin cupo: WhatsApp no está enviando por la API" : (j.error || `No se pudo enviar (${r.status})`)); e.kapso = r.status === 402 || /limit|cupo/i.test(j.error || ""); throw e; }
  return j;
}
// Chat de Felipe con el asesor IA (wa-agente/supervisor): instrucciones, correcciones, mensajes programados y reglas
async function supervisorEnviar(texto) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error("Tu sesión expiró: vuelve a ingresar.");
  const r = await fetch(`${SB_URL}/functions/v1/wa-agente/supervisor`, { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `El asesor no respondió (${r.status})`);
  return j;
}
const accionSup = (a) => { const h = String(a.herramienta || "").toLowerCase();
  const t = /program|enviar|mensaje/.test(h) ? "Programó mensaje" : /instruc/.test(h) ? "Anotó instrucción" : /regla/.test(h) ? (/quit|borr|elim/.test(h) ? "Regla quitada" : "Regla agregada")
    : /cancel/.test(h) ? "Canceló seguimiento" : /busc|revis|ver_|leer|list|consult/.test(h) ? "Revisó chats" : h.replace(/_/g, " ");
  return `<span class="pill ${a.ok === false ? "bad" : "gold"}">${esc(t)}${a.ok === false ? " · falló" : ""}</span>`; };
const borradorTxt = (b) => (Array.isArray(b.mensajes) ? b.mensajes : []).map((x) => typeof x === "string" ? x : x?.texto || x?.text || x?.body || "").filter(Boolean);
// --- chat: helpers de presentación (2.10) ---
const MEDIO = { image: ["image", "Foto"], video: ["video", "Video"], audio: ["mic", "Audio"], document: ["doc", "Documento"], sticker: ["image", "Sticker"], location: ["pin", "Ubicación"], contacts: ["users", "Contacto"] };
const medioTxt = (t) => t === "unsupported" ? "Mensaje no compatible" : t === "revoke" ? "Mensaje eliminado" : t === "reaction" ? "Reacción" : (MEDIO[t] || [0, t ? "Archivo" : "Mensaje"])[1];
const fmtTel = (t) => { const d = String(t || "").replace(/\D/g, ""); return d.length === 11 && d.startsWith("569") ? `+56 9 ${d.slice(3, 7)} ${d.slice(7)}` : d ? "+" + d : ""; };
// nombre visible: los emoji, signos o números sueltos no son un nombre
function nombreChat(c) {
  const n = String(c.nombre || "").trim(), sinLetras = !/\p{L}/u.test(n.replace(/^Lead\s+/i, "")) || /^Lead\s+\d+$/i.test(n);
  if (!n || sinLetras) return { txt: "Sin nombre", html: `<span class="faint">Sin nombre</span> · ${esc(fmtTel(c.telefono))}`, ini: "" };
  return { txt: n, html: esc(n), ini: initials(n) };
}
function avatarChat(c) {
  const n = nombreChat(c), col = c.unidad ? UNIDADES[c.unidad]?.c : null;
  return `<span class="c-av ${col ? "" : "none"}" ${col ? `style="--c:${col}"` : ""}>${n.ini ? esc(n.ini) : ico("users", 16)}${col ? '<i class="c-av-dot"></i>' : ""}</span>`;
}
const hhmm = (s) => parseD(s).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
const diaClave = (s) => { const d = parseD(s); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function diaTxt(s) {
  const d = parseD(s), hoy = new Date(), ayer = new Date(Date.now() - 864e5);
  if (diaClave(d.toISOString()) === diaClave(hoy.toISOString())) return "Hoy";
  if (diaClave(d.toISOString()) === diaClave(ayer.toISOString())) return "Ayer";
  return d.toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
}
function horaCorta(s) { if (!s) return ""; const d = parseD(s); const dias = (Date.now() - d) / 864e5; return dias < 1 && diaClave(s) === diaClave(new Date().toISOString()) ? hhmm(s) : dias < 2 ? "ayer" : dias < 7 ? d.toLocaleDateString("es-CL", { weekday: "short" }) : d.toLocaleDateString("es-CL", { day: "numeric", month: "short" }); }
const autorMsg = (m) => m.direccion === "entrante" ? "in" : m.direccion === "saliente_api" ? "ia" : "out";
// burbujas agrupadas por autor (menos de 5 min), separadores de día, medios como chips y reacciones sobre la burbuja
function burbujas(mensajes) {
  const ms = mensajes.filter((m) => m.tipo !== "revoke" || !mensajes.some((x) => x.direccion === m.direccion && x.fecha === m.fecha && x.tipo !== "revoke"));
  const out = []; let dia = null, prev = null;
  ms.forEach((m) => {
    if (m.tipo === "reaction") { // va pegada a la última burbuja del otro lado
      const destino = [...out].reverse().find((o) => o.m && autorMsg(o.m) !== autorMsg(m));
      if (destino) (destino.reac ||= []).push(m.texto || "👍"); return;
    }
    const dk = diaClave(m.fecha);
    if (dk !== dia) { out.push({ sep: diaTxt(m.fecha) }); dia = dk; prev = null; }
    const a = autorMsg(m), junto = prev && autorMsg(prev) === a && (parseD(m.fecha) - parseD(prev.fecha)) < 5 * 60e3;
    if (!junto && out.length && out[out.length - 1].m) out[out.length - 1].ultimo = true;
    out.push({ m, primero: !junto }); prev = m;
  });
  if (out.length && out[out.length - 1].m) out[out.length - 1].ultimo = true;
  if (!out.length) return '<div class="chat-nada">Sin mensajes guardados.</div>';
  return out.map((o) => {
    if (o.sep) return `<div class="chat-day"><span>${esc(o.sep)}</span></div>`;
    const m = o.m, a = autorMsg(m), med = MEDIO[m.tipo];
    const cuerpo = m.texto && m.tipo === "text" ? `<span class="b-txt">${esc(m.texto)}</span>`
      : med ? `<span class="b-media">${ico(med[0], 16)} ${med[1]}${m.texto ? `<span class="b-cap">${esc(m.texto)}</span>` : ""}</span>`
      : `<span class="b-raro">${esc(m.texto || medioTxt(m.tipo))}</span>`;
    return `<div class="bub ${a} ${o.primero ? "first" : ""} ${o.ultimo ? "last" : ""}">${o.primero && a === "ia" ? `<span class="ia-tag">${ico("spark", 11)} Asesor IA</span>` : ""}${cuerpo}<span class="bt">${hhmm(m.fecha)}${a !== "in" && m.estado === "read" ? ' <span class="b-ok">✓✓</span>' : ""}</span>${o.reac ? `<span class="b-reac">${o.reac.map(esc).join("")}</span>` : ""}</div>`;
  }).join("");
}
const TIPO_CONTACTO = { cliente: "Cliente BlackGPS", proveedor: "Proveedor", equipo: "Equipo", negocio: "Otro trabajo" };
async function viewConversaciones(id) {
  setActive("conversaciones");
  const P = $("#page");
  let tab = lsGet("cc_conv_tab", "mios"); let MODOS = {}; let LISTA = []; let TODO = [];
  P.innerHTML = `<div class="page-head cv-head ${id ? "con-chat" : ""}"><div><h1>Conversaciones</h1><p>WhatsApp del grupo. El asesor IA atiende Carclass, NOM y los chats nuevos; BlackGPS y los que tomas o te traspasa son tuyos.</p></div>
      <div class="actions"><button class="btn sm" id="cv-cfg">${ico("spark", 15)} Asesor IA <span class="cv-cfg-dot" id="cv-cfg-dot"></span></button></div></div>
    <div class="chat-layout ${id ? "con-chat" : ""}">
      <section class="card chat-list"><div class="chat-list-h"><div class="seg" id="cv-tabs">${[["mios", "Míos"], ["asesor", "Asesor"], ["todas", "Todas"], ["contactos", "Contactos"]].map(([k, t]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}">${t} <span class="badge" id="cv-n-${k}"></span></button>`).join("")}</div></div><div class="chat-list-b" id="cv-l">${loading(5)}</div></section>
      <section class="card chat-pane" id="cv-c">${id ? loading(6) : ""}</section></div>`;
  $(".chat-layout", P).insertAdjacentHTML("beforebegin", '<div id="cv-kapso"></div>');
  // el asesor atiende Carclass, NOM y los chats nuevos aún sin clasificar (él mismo los clasifica o los marca personales)
  // wa-agente solo atiende chats «lead» o «sin_unidad» de sus líneas, sin pausa y con modo que responde o propone
  const esAsesor = (c) => ["lead", "sin_unidad"].includes(c.estado) && (!c.unidad || ["carclass", "nom", "carwash"].includes(c.unidad))
    && !c.humano && !c.traspaso && ["activo", "borrador"].includes(c.modo);
  $$("#cv-tabs [data-tab]").forEach((b) => b.onclick = () => { tab = b.dataset.tab; lsSet("cc_conv_tab", tab); $$("#cv-tabs button").forEach((x) => x.classList.toggle("on", x === b)); pintarLista(); });

  // ---- modos del asesor: panel aparte, con confirmación (antes eran selectores sueltos sobre la lista) ----
  const MODO_OPC = [["activo", "Responde solo"], ["borrador", "Propone borradores"], ["observar", "Solo observa"], ["apagado", "Apagado"]];
  let MODOS_INFO = null;
  const cargarModos = async () => { try { MODOS_INFO = await rpc("app_asesor_modos"); MODOS = MODOS_INFO.modos || {}; } catch { MODOS_INFO = null; }
    const dot = $("#cv-cfg-dot"); if (dot) dot.className = "cv-cfg-dot " + (MODOS_INFO && !MODOS_INFO.programado ? "off" : Object.values(MODOS).includes("activo") ? "on" : "");
    const kp = $("#cv-kapso"), lim = MODOS_INFO?.kapso_limite_hasta;
    if (kp) kp.innerHTML = lim ? `<div class="alert" style="border-color:var(--bad);margin-bottom:12px">${ico("alert", 16)}<div><b>WhatsApp no está enviando por la API (Kapso sin cupo del plan).</b> El asesor deja borradores en vez de responder y los envíos desde Core no salen. Responde desde tu WhatsApp: en cada chat y borrador está el botón «Abrir en mi WhatsApp». Se reintenta solo el ${fechaHora(lim)}; se resuelve subiendo el plan de Kapso.</div></div>` : ""; };
  cargarModos();
  $("#cv-cfg").onclick = async () => {
    await cargarModos(); const m = MODOS_INFO || { modos: {} };
    const fila = (u) => `<div class="cv-modo-row" style="--c:${UNIDADES[u].c}"><span class="ldot"></span><b>${uName(u)}</b>${m.puede_editar
      ? `<select class="input" data-modo="${u}" aria-label="Modo del asesor en ${uName(u)}">${MODO_OPC.map(([k, t]) => `<option value="${k}" ${m.modos[u] === k ? "selected" : ""}>${t}</option>`).join("")}</select>`
      : `<span class="pill">${esc(MODO_TXT[m.modos[u]] || m.modos[u] || "—")}</span>`}</div>`;
    const root = modal("Asesor IA por línea", `<div class="cv-modos-p">${["carclass", "nom", "blackgps"].map(fila).join("")}
        <div class="cv-modo-row" style="--c:${UNIDADES.carwash.c}"><span class="ldot"></span><b>Carwash.hf</b><span class="pill">Lo atiendes tú</span></div>
        <p class="hint">Carwash.hf no tiene asesor habilitado todavía. ${m.programado ? "" : "<b>La ejecución automática del asesor aún no está encendida.</b>"} Los cambios se aplican al guardar.</p></div>`, m.puede_editar ? async () => {
      const cambios = $$("[data-modo]", root).filter((s) => s.value !== m.modos[s.dataset.modo]);
      for (const s of cambios) await rpc("app_asesor_modo", { p_unidad: s.dataset.modo, p_modo: s.value });
      toast(cambios.length ? cambios.map((s) => `${uName(s.dataset.modo)}: ${(MODO_OPC.find(([k]) => k === s.value) || [])[1]}`).join(" · ") : "Sin cambios");
      cargarModos(); refrescar();
    } : null, "Guardar cambios");
  };

  // ---- lista ----
  const esContacto = (c) => c.es_lead === false;
  const estadoChat = (c) => esContacto(c) ? ["tc", TIPO_CONTACTO[c.tipo_contacto] || "Contacto"]
    : c.traspaso ? ["bad", "te necesita"] : c.sin_responder ? ["dotbad", "sin responder"] : c.borradores ? ["gold", c.borradores > 1 ? `${c.borradores} borradores` : "borrador"] : null;
  const previa = (c) => { const pre = c.ultima_direccion === "saliente_api" ? "IA: " : c.ultima_direccion && c.ultima_direccion !== "entrante" ? "Tú: " : "";
    return pre + (c.ultimo_mensaje ? esc(c.ultimo_mensaje) : `<i>${esc(medioTxt(c.ultimo_tipo))}</i>`); };
  const pintarLista = async () => {
    const todo = (await rpc("app_conversaciones")).filter((c) => !c.unidad || enLinea(c.unidad)); TODO = todo;
    // solo los leads van a Míos, Asesor IA y Todas; proveedores, equipo y clientes BlackGPS quedan en Contactos
    const todas = todo.filter((c) => !esContacto(c)); LISTA = todas;
    const grupos = { asesor: todas.filter(esAsesor), mios: todas.filter((c) => !esAsesor(c)), todas, contactos: todo.filter(esContacto) };
    Object.entries(grupos).forEach(([k, l]) => { const b = $(`#cv-n-${k}`); if (b) b.textContent = k === "contactos" ? "" : (k === "todas" ? l.length : l.filter((c) => c.sin_responder || c.borradores || c.traspaso).length) || ""; });
    const l = grupos[tab] || todas;
    // chat fijo de Felipe con el asesor (solo dueño)
    const sup = ME.rol === "dueno" && tab !== "contactos" ? `<a class="chat-item sup-item ${id === "supervisor" ? "on" : ""}" href="#/conversaciones/supervisor"><span class="c-av sup-av">${ico("spark", 18)}</span>
      <div class="ci-b"><div class="ci-l1"><span class="ci-n ell">Instrucciones al asesor</span></div><div class="ci-l2"><span class="ell">Correcciones, mensajes programados y reglas</span></div></div></a>` : "";
    $("#cv-l").innerHTML = sup + (l.length ? l.map((c) => { const st = estadoChat(c), nom = nombreChat(c);
      return `<a class="chat-item ${c.id === id ? "on" : ""} ${!esContacto(c) && (c.sin_responder || c.traspaso) ? "unread" : ""}" href="#/conversaciones/${c.id}">
      ${avatarChat(c)}
      <div class="ci-b"><div class="ci-l1"><span class="ci-n ell">${nom.html}</span><span class="ci-t">${esAsesor(c) ? `<span class="ci-who ia" title="Atiende el asesor IA">${ico("spark", 12)}</span>` : `<span class="ci-who" title="Atiendes tú">${ico("users", 12)}</span>`}${horaCorta(c.orden)}</span></div>
        <div class="ci-l2"><span class="ell">${previa(c)}</span>${st ? `<span class="ci-st ${st[0]}">${st[1]}</span>` : ""}</div></div></a>`; }).join("")
      : `<div class="card-b">${empty("chat", tab === "asesor" ? "El asesor no tiene chats abiertos" : tab === "contactos" ? "Sin contactos" : "Sin conversaciones", tab === "mios" ? "Aquí llegan BlackGPS, los chats que tomas y los que el asesor te traspasa." : tab === "contactos" ? "Proveedores, equipo y clientes BlackGPS. Marca un chat con «No es lead» para moverlo aquí." : "")}</div>`);
    if (!id) pintarVacio();
    return l;
  };
  const pintarVacio = () => {
    if (tab === "contactos") { $("#cv-c").innerHTML = `<div class="chat-empty">${ico("users", 28)}<h3>Contactos</h3><p class="faint" style="max-width:34ch;text-align:center">Proveedores, equipo, clientes BlackGPS y otros chats de trabajo. No cuentan como leads ni generan avisos.</p></div>`; return; }
    const nec = LISTA.filter((c) => c.traspaso).length, sr = LISTA.filter((c) => c.sin_responder).length, bo = LISTA.filter((c) => c.borradores).length;
    $("#cv-c").innerHTML = `<div class="chat-empty">${ico("chat", 28)}<h3>Elige una conversación</h3>
      <div class="chat-empty-k">${nec ? `<button class="btn sm" data-ir="traspaso"><span class="ci-st bad">${nec}</span> te necesitan</button>` : ""}${sr ? `<button class="btn sm" data-ir="sin_responder"><span class="ci-st dotbad">${sr}</span> sin responder</button>` : ""}${bo ? `<button class="btn sm" data-ir="borradores"><span class="ci-st gold">${bo}</span> con borrador</button>` : ""}${!nec && !sr && !bo ? '<span class="faint">Todo al día.</span>' : ""}</div></div>`;
    $$("[data-ir]").forEach((b) => b.onclick = () => { const c = LISTA.find((x) => x[b.dataset.ir]); if (c) location.hash = "#/conversaciones/" + c.id; });
  };

  // ---- chat ----
  const pintarChat = async () => {
    const d = await rpc("app_conversacion", { p_id: id });
    if (!d) { $("#cv-c").innerHTML = `<div class="card-b">${empty("chat", "Conversación no disponible")}</div>`; return; }
    const c = d.conversacion || {}; const wa = waLink(c.telefono); const nom = nombreChat(c);
    const lc = TODO.find((x) => x.id === id); const contacto = lc ? esContacto(lc) : c.estado === "contacto";
    const tipoC = (lc && lc.tipo_contacto) || c.tipo_contacto; const dueno = ME.rol === "dueno";
    const ventana = c.ventana_hasta && parseD(c.ventana_hasta) > new Date();
    const estado = c.humano ? `Atiendes tú${c.agente_pausado_hasta ? ` · el asesor vuelve el ${fechaHora(c.agente_pausado_hasta)}` : ""}`
      : esAsesor(c) ? `Atiende el asesor IA · ${esc(MODO_TXT[c.modo] || c.modo)}` : `Atiendes tú · el asesor ${esc(MODO_TXT[c.modo] || c.modo)} en esta línea`;
    $("#cv-c").innerHTML = `<div class="chat-h"><a class="btn ghost sm icon solo-movil" href="#/conversaciones" aria-label="Volver">${ico("left", 16)}</a>
        ${avatarChat(c)}
        <div class="chat-h-t"><div class="row" style="gap:8px;flex-wrap:nowrap;min-width:0"><b class="ell">${nom.ini ? nom.html : esc(fmtTel(c.telefono))}</b>${c.unidad ? unidadPill(c.unidad) : ""}</div>
          <div class="chat-h-s ell">${nom.ini ? esc(fmtTel(c.telefono)) : "Sin nombre"}${c.etapa ? " · " + esc(etapaTxt(c.etapa)) : ""} · ${estado}</div></div>
        ${c.empresa_id ? `<a class="btn sm ghost icon" href="#/cliente/${c.empresa_id}" title="Ver ficha" aria-label="Ver ficha">${ico("users", 16)}</a>` : ""}
        ${contacto
          ? `<span class="ci-st tc">${esc(TIPO_CONTACTO[tipoC] || "Contacto")}</span>${dueno ? '<button class="btn sm" id="cv-lead">Es un lead</button>' : ""}`
          : `${dueno ? '<button class="btn sm ghost" id="cv-nolead">No es lead</button>' : ""}<button class="btn sm ${c.humano ? "" : "primary"}" id="cv-at">${c.humano ? "Devolver al asesor" : "Tomar"}</button>`}</div>
      ${c.traspaso ? `<div class="chat-alert">${ico("alert", 15)}<span><b>Te necesita.</b> ${esc(String(c.traspaso).replace(/^\[WhatsApp\]\s*/, ""))}</span></div>` : ""}
      ${contacto ? `<div class="clasificar"><span class="faint" style="font-size:12.5px">Contacto, no lead: el asesor no responde aquí y no cuenta en avisos. Puedes escribirle igual.</span></div>` : (() => { const actual = (k, fl) => c.unidad === k && (!fl || c.flujo === fl) ? "primary" : "";
        const botones = `<button class="btn sm ${actual("carclass")}" data-cls="carclass">Carclass</button><button class="btn sm ${actual("nom", "consignante")}" data-cls="nom" data-fl="consignante">NOM · vende su auto</button><button class="btn sm ${actual("nom", "comprador")}" data-cls="nom" data-fl="comprador">NOM · compra</button><button class="btn sm ${actual("carwash")}" data-cls="carwash">Carwash.hf</button><button class="btn sm ${actual("blackgps")}" data-cls="blackgps">BlackGPS</button><button class="btn sm ghost" data-cls="personal">Personal</button>
          <label class="check-row" style="font-size:12.5px;margin-left:4px"><input type="checkbox" id="cv-der" checked> Que lo atienda el asesor</label>`;
        return c.unidad
          ? `<details class="clasificar-d"><summary>Cambiar línea o derivar · hoy ${esc(uName(c.unidad))}${c.flujo ? " · " + (c.flujo === "consignante" ? "vende" : "compra") : ""}</summary><div class="clasificar">${botones}</div></details>`
          : `<div class="clasificar"><span class="faint" style="font-size:12.5px">¿De qué es este chat?</span>${botones}</div>`; })()}
      <div class="chat-msgs" id="cv-m">${burbujas(d.mensajes || [])}</div>
      ${(d.borradores || []).map((b) => { const t = borradorTxt(b); const acc = accionesTxt(b.acciones); return `<div class="borrador" data-bor="${b.id}">
        <div class="bor-h"><span class="ia-tag">${ico("spark", 12)} Borrador del asesor</span><span class="faint">${hace(b.creado_en)}</span></div>
        <div class="bor-txt">${t.map((x) => `<p>${esc(x)}</p>`).join("") || '<p class="faint">Sin texto.</p>'}</div>
        ${acc.length ? `<div class="bor-acc">${acc.map((a) => `<span class="pill ${a.cls}">${esc(a.txt)}</span>`).join("")}</div>` : ""}
        <div class="bor-f">${!ventana ? '<span class="faint">Ventana de 24 h cerrada: solo plantilla aprobada.</span>' : ""}<button class="btn sm ghost danger" data-desc="${b.id}">Descartar</button>${t.length && ventana ? `<button class="btn sm ghost" data-edit="${b.id}">Editar</button><button class="btn sm primary" data-env="${b.id}">${ico("send", 14)} Enviar</button>` : wa && t.length ? `<a class="btn sm" href="${waLink(c.telefono, t.join("\n\n"))}" target="_blank" rel="noopener">Abrir en mi WhatsApp</a>` : ""}</div></div>`; }).join("")}
      ${(d.citas || []).length ? `<div class="chat-citas">${d.citas.map((ci) => `<div>${ico("cal", 14)} <b>${esc(ci.tipo)}</b> · ${fechaHora(ci.inicio)}${ci.lugar ? " · " + esc(ci.lugar) : ""} <span class="pill ${ci.reserva_validada ? "ok" : "warn"}">${ci.reserva_validada ? "reserva validada" : "reserva por validar"}</span></div>`).join("")}</div>` : ""}
      <div class="chat-foot">${ventana ? `<form id="cv-f" class="chat-compose"><textarea id="cv-txt" rows="1" placeholder="Escribe un mensaje" aria-label="Mensaje"></textarea><button class="chat-send" id="cv-send" aria-label="Enviar">${ico("send", 18)}</button></form>
        <div class="chat-hint" id="cv-hint">Enter envía · Shift+Enter, salto de línea · al responder tú, el asesor queda en pausa 12 h</div>`
        : `<div class="chat-closed"><span>Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo permite plantillas aprobadas.</span>${wa ? `<a class="btn sm primary" href="${wa}" target="_blank" rel="noopener">${ico("chat", 14)} Abrir en mi WhatsApp</a>` : ""}</div>`}</div>`;
    const box = $("#cv-m"); box.scrollTop = box.scrollHeight;
    if ($("#cv-nolead")) $("#cv-nolead").onclick = () => {
      const root = modal("No es lead", `<p style="margin:0 0 10px">El chat pasa a «Contactos»: el asesor deja de responder, se cancelan sus borradores y seguimientos y, si se creó una oportunidad por error, queda descartada. Los próximos chats de este número nacen como contacto.</p>
        <div class="clasificar" style="padding:0;border:0">${Object.entries(TIPO_CONTACTO).map(([k, t]) => `<button type="button" class="btn sm" data-tc="${k}">${t}</button>`).join("")}</div>`, null);
      $$("[data-tc]", root).forEach((b) => b.onclick = async () => {
        b.disabled = true;
        try { await rpc("app_conversacion_contacto", { p_id: id, p_tipo: b.dataset.tc }); $("[data-x]", root).click(); toast(`Movido a Contactos · ${TIPO_CONTACTO[b.dataset.tc]}`); cargarAvisos(); refrescar(); }
        catch (e) { b.disabled = false; toast(e.message, true); }
      });
    };
    if ($("#cv-lead")) $("#cv-lead").onclick = () => modal("Es un lead", '<p style="margin:0">El chat vuelve a la bandeja de leads, sin línea asignada: clasifícalo después para que lo atienda el asesor o tú.</p>', async () => {
      await rpc("app_conversacion_es_lead", { p_id: id }); toast("Vuelve a la bandeja de leads"); cargarAvisos(); refrescar(); }, "Es un lead");
    if ($("#cv-at")) $("#cv-at").onclick = async () => { try { await rpc("app_conversacion_atender", { p_id: id, p_accion: c.humano ? "devolver" : "tomar" }); toast(c.humano ? "El asesor vuelve a atender" : "Tomaste la conversación: el asesor queda en pausa"); refrescar(); } catch (e) { toast(e.message, true); } };
    const clasificar = async (b) => {
      const dest = b.dataset.cls; b.disabled = true;
      // BlackGPS lo atiendes tú; el asesor solo atiende Carclass, NOM y Carwash.hf
      const derivar = !!$("#cv-der")?.checked && ["carclass", "nom", "carwash"].includes(dest);
      try {
        await rpc("app_conversacion_clasificar", { p_id: id, p_destino: dest, p_flujo: b.dataset.fl || null, p_derivar: derivar });
        const modo = MODOS[dest];
        toast(dest === "personal" ? "Marcado como personal" : derivar
          ? (["observar", "apagado"].includes(modo) ? `Clasificado como ${uName(dest)}. Ojo: en ${uName(dest)} el asesor está en «${MODO_TXT[modo] || modo}»; cámbialo en «Asesor IA».` : `Clasificado como ${uName(dest)} y derivado al asesor`)
          : `Clasificado como ${uName(dest)}: lo atiendes tú`);
        if (dest === "personal") location.hash = "#/conversaciones"; else refrescar(); cargarAvisos(); }
      catch (e) { toast(e.message, true); b.disabled = false; }
    };
    $$("[data-cls]").forEach((b) => b.onclick = () => b.dataset.cls === "personal"
      ? modal("Marcar como personal", '<p style="margin:0">Se borran los mensajes guardados en Core y el chat deja de aparecer aquí. En tu WhatsApp no cambia nada.</p>', () => clasificar(b), "Marcar como personal")
      : clasificar(b));
    $$("[data-desc]").forEach((b) => b.onclick = () => modal("Descartar borrador", '<p style="margin:0">El asesor no enviará este borrador. Puedes responder tú o esperar al próximo mensaje del cliente.</p>', async () => { await rpc("app_borrador_descartar", { p_id: b.dataset.desc }); toast("Borrador descartado"); refrescar(); }, "Descartar"));
    const enviar = async (body, btn, ok) => {
      if (btn) btn.disabled = true;
      try { const r = await waEnviar(body); toast(ok(r)); refrescar(); cargarAvisos(); }
      catch (e) {
        if (btn) btn.disabled = false;
        if (!e.kapso) return toast(e.message, true);
        // Kapso sin cupo: se ofrece enviar el mismo texto desde el WhatsApp del teléfono
        const txt = (body.mensajes || borradorTxt((d.borradores || []).find((x) => x.id === body.borrador_id) || {})).join("\n\n");
        const link = waLink(c.telefono, txt);
        modal("WhatsApp sin cupo en Kapso", `<p style="margin:0 0 10px">El mensaje no salió: Kapso, la conexión de WhatsApp por API, llegó al límite de su plan. Envíalo desde tu WhatsApp; al enviarlo, el asesor queda en pausa en este chat.</p>${link ? `<a class="btn primary" href="${link}" target="_blank" rel="noopener">${ico("chat", 15)} Abrir en mi WhatsApp con el mensaje</a>` : '<p class="faint">Este chat no tiene un teléfono válido.</p>'}`, null);
        cargarModos();
      }
    };
    $$("[data-env]").forEach((b) => b.onclick = () => enviar({ borrador_id: b.dataset.env }, b, (r) => `Enviado (${r.enviados} mensaje${r.enviados > 1 ? "s" : ""})`));
    $$("[data-edit]").forEach((b) => b.onclick = () => {
      const box = b.closest(".borrador"); const bor = (d.borradores || []).find((x) => x.id === b.dataset.edit); const t = borradorTxt(bor);
      $(".bor-txt", box).innerHTML = t.map((x, i) => `<textarea class="input bor-ed" rows="3" aria-label="Mensaje ${i + 1}">${esc(x)}</textarea>`).join("");
      b.outerHTML = `<button class="btn sm primary" data-envedit="${bor.id}">${ico("send", 14)} Enviar editado</button>`;
      $(`[data-env="${bor.id}"]`)?.remove();
      $(`[data-envedit="${bor.id}"]`).onclick = (ev) => { const m = $$(".bor-ed", box).map((x) => x.value.trim()).filter(Boolean); if (!m.length) return toast("Escribe al menos un mensaje", true); enviar({ borrador_id: bor.id, mensajes: m }, ev.currentTarget, () => "Enviado con tus cambios"); };
    });
    if ($("#cv-f")) {
      const txt = $("#cv-txt"), hint = $("#cv-hint");
      const crecer = () => { txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 6 * 22 + 16) + "px"; hint.classList.toggle("on", !!txt.value); };
      txt.oninput = crecer;
      txt.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#cv-f").requestSubmit(); } };
      $("#cv-f").onsubmit = (e) => { e.preventDefault(); const m = txt.value.trim(); if (!m) return; enviar({ conversacion_id: id, mensajes: [m] }, $("#cv-send"), () => "Mensaje enviado · el asesor queda en pausa 12 h"); };
    }
  };
  // ---- chat de Felipe con el asesor IA ----
  let supPensando = false;
  const pintarSupervisor = async () => {
    if (ME.rol !== "dueno") { $("#cv-c").innerHTML = `<div class="card-b">${empty("chat", "Solo para el dueño")}</div>`; return; }
    const h = await rpc("app_supervisor_historial", { p_limite: 60 }).catch(() => ({ mensajes: [], reglas: [] }));
    const ms = h.mensajes || [], reglas = h.reglas || [];
    let prevDia = "", prevRol = "";
    const burb = ms.map((m, i) => {
      const dia = diaClave(m.creado_en); const sep = dia !== prevDia ? `<div class="chat-day"><span>${esc(diaTxt(m.creado_en))}</span></div>` : ""; prevDia = dia;
      const yo = m.rol === "felipe"; const first = m.rol !== prevRol || sep; prevRol = m.rol;
      const last = !ms[i + 1] || ms[i + 1].rol !== m.rol;
      const acc = (m.acciones || []).filter((a) => a && a.herramienta);
      return `${sep}<div class="bub ${yo ? "out" : "ia"} ${first ? "first" : ""} ${last ? "last" : ""}">${first && !yo ? `<span class="ia-tag">${ico("spark", 11)} Asesor IA</span>` : ""}${esc(m.texto || "").replace(/\n/g, "<br>")}${acc.length ? `<span class="sup-acc">${acc.map(accionSup).join("")}</span>` : ""}<span class="bt">${hhmm(m.creado_en)}</span></div>`;
    }).join("");
    $("#cv-c").innerHTML = `<div class="chat-h"><a class="btn ghost sm icon solo-movil" href="#/conversaciones" aria-label="Volver">${ico("left", 16)}</a>
        <span class="c-av sup-av">${ico("spark", 18)}</span>
        <div class="chat-h-t"><b class="ell">Instrucciones al asesor</b><div class="chat-h-s ell">Correcciones, mensajes programados y reglas que el asesor aplica en todos los chats</div></div></div>
      <details class="clasificar-d sup-reglas"><summary>Reglas vigentes (${reglas.length})</summary><div class="sup-reglas-b">${reglas.length ? `<ol>${reglas.map((r) => `<li>${esc(r.texto)}${r.desde ? ` <span class="faint">· ${fechaHora(r.desde)}</span>` : ""}</li>`).join("")}</ol>` : '<p class="faint" style="margin:0">Aún no hay reglas. Escribe por ejemplo «desde ahora, nunca ofrezcas descuento en PPF».</p>'}</div></details>
      <div class="chat-msgs" id="sup-m">${burb || `<div class="chat-empty" style="padding:30px 10px">${ico("spark", 26)}<h3>Dale instrucciones al asesor</h3><p class="faint" style="max-width:40ch;text-align:center">Ejemplos: «escríbele a Claudio mañana a las 10 preguntando si revisó la cotización», «en el chat de Berni no ofrezcas retiro», «desde ahora pide siempre la patente».</p></div>`}${supPensando ? `<div class="bub ia first last sup-pensando"><span class="ia-tag">${ico("spark", 11)} Asesor IA</span>pensando…</div>` : ""}</div>
      <div class="chat-foot"><form id="sup-f" class="chat-compose"><textarea id="cv-txt" rows="1" placeholder="Escribe una instrucción para el asesor" aria-label="Instrucción"></textarea><button class="chat-send" id="sup-send" aria-label="Enviar" ${supPensando ? "disabled" : ""}>${ico("send", 18)}</button></form>
        <div class="chat-hint on">Enter envía · Shift+Enter, salto de línea · tarda entre 5 y 30 segundos</div></div>`;
    const box = $("#sup-m"); box.scrollTop = box.scrollHeight;
    const txt = $("#cv-txt");
    txt.oninput = () => { txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 6 * 22 + 16) + "px"; };
    txt.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#sup-f").requestSubmit(); } };
    $("#sup-f").onsubmit = async (e) => {
      e.preventDefault(); const t = txt.value.trim(); if (!t || supPensando) return;
      supPensando = true;
      box.insertAdjacentHTML("beforeend", `<div class="bub out first last">${esc(t).replace(/\n/g, "<br>")}<span class="bt">${hhmm(new Date().toISOString())}</span></div><div class="bub ia first last sup-pensando"><span class="ia-tag">${ico("spark", 11)} Asesor IA</span>pensando…</div>`);
      box.scrollTop = box.scrollHeight; txt.value = ""; txt.style.height = "auto"; $("#sup-send").disabled = true;
      try { await supervisorEnviar(t); } catch (err) { toast(err.message, true); }
      supPensando = false; if (location.hash === "#/conversaciones/supervisor") pintarSupervisor();
    };
  };
  const refrescar = async () => { try { await pintarLista(); if (id === "supervisor") { if (!supPensando) await pintarSupervisor(); } else if (id) await pintarChat(); } catch (e) { $("#cv-l").innerHTML = fail(e); } };
  await refrescar();
  clearInterval(viewConversaciones._t);
  viewConversaciones._t = setInterval(() => { if (!location.hash.startsWith("#/conversaciones")) return clearInterval(viewConversaciones._t); if (!document.hidden && !$("#modal-root").innerHTML && !$("#cv-txt")?.value && !$(".bor-ed") && !$(".sup-reglas[open]")) refrescar(); }, 20000);
}

/* ---------- embudo ---------- */
async function viewEmbudo(u, flujo) {
  const unis = unidadesMias();
  u = unis.includes(u) ? u : (unis.includes("carclass") ? "carclass" : unis[0]);
  if (u === "nom") flujo = ["comprador", "compra_directa"].includes(flujo) ? flujo : "consignante"; else flujo = null;
  setActive("embudo", `Embudo · ${uName(u)}${flujo ? " · " + FLUJO_TXT[flujo] : ""}`);
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Embudo</h1><p>Arrastra una tarjeta (o usa «Mover» en el celular) para cambiar su etapa, o suéltala en «Ganada» o «Perdida». Cada gestión registrada avanza la etapa sola; nunca retrocede sin que tú lo decidas.</p></div>
      <div class="actions"><button class="btn primary" id="e-new">${ico("plus", 16)} Nuevo lead</button></div></div>
    <div class="tabs">${unis.map((x) => `<a href="#/embudo/${x}" class="${x === u ? "on" : ""}">${uName(x)}</a>`).join("")}</div>
    ${u === "nom" ? `<div class="seg">${Object.entries(FLUJO_TXT).map(([k, t]) => `<button class="${flujo === k ? "on" : ""}" data-f="${k}">${t}</button>`).join("")}</div>` : ""}
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
          <b>${esc(nombreVis(it.empresa))}</b>
          <div class="meta">${it.flota ? `<span>${int(it.flota)} veh.</span>` : ""}${it.comuna ? `<span>${esc(it.comuna)}</span>` : ""}${it.canal ? `<span>${esc(CANAL_TXT[it.canal] || it.canal)}</span>` : ""}${it.monto ? `<span class="num">${clpM(it.monto)}</span>` : ""}${it.sin_respuesta ? '<span class="pill bad">sin respuesta</span>' : ""}</div>
          <div class="nx-t" title="${esc(sinCodigos(it.proxima_accion || ""))}">${esc(sinCodigos(it.proxima_accion) || hace(it.ultima))}</div>
          <div class="next">${it.proxima_fecha ? `<span class="pill ${it.proxima_fecha < hoyISO() ? "bad" : it.proxima_fecha === hoyISO() ? "warn" : ""}">${fecha(it.proxima_fecha)}</span>` : '<span class="pill">sin fecha</span>'}<button type="button" class="btn ghost sm kmove" data-mover aria-label="Mover de etapa">Mover</button></div>
        </article>`).join("")}${c.total > (c.items || []).length ? `<div class="col-more">y ${int(c.total - c.items.length)} más</div>` : ""}${!c.total ? '<div class="col-more">Sin oportunidades</div>' : ""}</div></section>`; }).join("")}</div>
      <div class="dropbar"><div class="dropzone win" data-cerrar="ganada">${ico("trophy", 16)} Soltar aquí: Ganada</div><div class="dropzone lose" data-cerrar="perdida">${ico("x", 16)} Soltar aquí: Perdida</div></div>`;
    let drag = null;
    $$(".kcard").forEach((k) => {
      k.ondragstart = (e) => { drag = k; k.classList.add("drag"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", k.dataset.id); };
      k.ondragend = () => k.classList.remove("drag");
      k.onclick = (e) => { if (e.target.closest("[data-mover]")) return; location.hash = "#/cliente/" + k.dataset.emp; };
      $("[data-mover]", k).onclick = (e) => { e.stopPropagation(); modalMover(k); };
    });
    const moverA = async (card, etapa) => {
      const prev = card.parentElement; const col = $(`.col[data-etapa="${CSS.escape(etapa)}"] .col-b`); if (col) col.prepend(card);
      try { await rpc("app_mover_etapa", { p: { oportunidad_id: card.dataset.id, etapa, proxima_fecha: card.dataset.fecha && card.dataset.fecha >= hoyISO() ? card.dataset.fecha : diaHabil(2) } }); toast(`Movida a ${etapaTxt(etapa)}`); }
      catch (err) { prev.prepend(card); toast(err.message, true); }
    };
    // «Mover»: alternativa al arrastre, que no funciona con el dedo en el celular
    const modalMover = (card) => {
      const actual = card.closest(".col").dataset.etapa;
      const root = modal(`Mover · ${card.dataset.nom}`, `<div class="mover-list">${etapas.map((et) => `<button type="button" class="btn ${et === actual ? "primary" : ""}" data-et="${esc(et)}" ${et === actual ? "disabled" : ""}>${esc(etapaTxt(et))}</button>`).join("")}</div>
        <div class="row"><button type="button" class="btn" data-fin="ganada">${ico("trophy", 15)} Ganada</button><button type="button" class="btn ghost danger" data-fin="perdida">Perdida</button></div>`, null);
      $$("[data-et]", root).forEach((b) => b.onclick = () => { root.innerHTML = ""; moverA(card, b.dataset.et); });
      $$("[data-fin]", root).forEach((b) => b.onclick = () => { root.innerHTML = ""; modalCerrar(card.dataset.id, card.dataset.nom, b.dataset.fin, () => viewEmbudo(u, flujo), { unidad: u }); });
    };
    const zona = (el, onDrop) => { el.ondragover = (e) => { e.preventDefault(); el.classList.add("drop"); }; el.ondragleave = () => el.classList.remove("drop"); el.ondrop = (e) => { e.preventDefault(); el.classList.remove("drop"); if (drag) onDrop(drag); }; };
    $$(".col").forEach((col) => zona(col, (card) => { if (card.closest(".col") !== col) moverA(card, col.dataset.etapa); }));
    $$("[data-cerrar]").forEach((z) => zona(z, (card) => modalCerrar(card.dataset.id, card.dataset.nom, z.dataset.cerrar, () => viewEmbudo(u, flujo), { unidad: u })));
  } catch (e) { $("#kb").innerHTML = fail(e); }
}

/* ---------- agenda ---------- */
async function viewAgenda(params) {
  setActive("agenda");
  const v = params.get("v") || lsGet("cc_agenda_v", "semana"); lsSet("cc_agenda_v", v);
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
  const evHtml = (e) => `<a class="ev ${e.tipo} ${e.fecha < hoyISO() ? "past" : ""}" href="${e.empresa_id ? "#/cliente/" + e.empresa_id : "#/tareas"}" style="${e.tipo === "accion" ? `--c:${UNIDADES[e.unidad]?.c || "var(--brand)"}` : ""}" title="${esc(`${e.titulo} · ${e.cliente || ""}`)}">${e.cliente ? `<b>${esc(e.cliente)}</b> · ` : ""}${esc(e.titulo)}</a>`;
  try {
    const evs = (await rpc("app_agenda", { p_desde: iso(d0), p_hasta: iso(d1) })).filter((e) => enLinea(e.unidad));
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
    const ve = (await rpc("app_agenda", { p_desde: masDias(-365), p_hasta: masDias(-1) })).filter((e) => enLinea(e.unidad)).sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (ve.length) {
      $("#venc-c").hidden = false; $("#venc-n").textContent = ve.length;
      $("#venc").innerHTML = `<div class="card-b" style="display:grid;gap:6px">${ve.slice(0, 8).map((e) => `<div class="row" style="justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:8px"><span style="min-width:0;flex:1">${evHtml(e)}</span><span class="pill bad">${fecha(e.fecha)}</span></div>`).join("")}${ve.length > 8 ? `<div class="faint" style="font-size:12px">y ${ve.length - 8} más. Registra una gestión en cada una para darle nueva fecha.</div>` : ""}</div>`;
    }
  } catch {}
  try {
    const sg = (await rpc("app_sugerencias")).filter((x) => enLinea(x.unidad));
    $("#sg-n").textContent = sg.length || "";
    const icS = { tras_cotizar: "call", detenido: "clock", mensual: "users" };
    $("#sg").innerHTML = sg.length ? sg.map((s, i) => `<div class="sug"><span class="ic">${ico(icS[s.tipo] || "spark", 16)}</span><div><div style="font-weight:600;font-size:13px">${esc(s.titulo)}</div><div class="muted" style="font-size:12.5px"><a href="#/cliente/${s.empresa_id}">${esc(s.cliente)}</a> · ${esc(uName(s.unidad))} · ${esc(etapaTxt(s.etapa))} · ${s.desde ? "última gestión " + hace(s.desde) : "sin gestiones"}</div></div><button class="btn sm" data-sg="${i}">Agendar mañana</button></div>`).join("")
      : `<div class="card-b muted" style="font-size:13px">Sin sugerencias. La agenda propone llamar 2 días después de cotizar, retomar lo detenido 14 días y el contacto mensual con clientes.</div>`;
    $$("[data-sg]").forEach((b) => b.onclick = async () => {
      const s = sg[b.dataset.sg]; b.disabled = true;
      try { await rpc("app_crear_tarea", { p: { titulo: `${s.titulo} · ${s.cliente}`, unidad: s.unidad, vence: diaHabil(1), prioridad: "media", empresa_id: s.empresa_id, responsable: (ME.nombre || "").split(" ")[0] || null } }); toast("Tarea creada para mañana"); b.textContent = "Agendada"; }
      catch (e) { toast(e.message, true); b.disabled = false; }
    });
  } catch (e) { $("#sg").innerHTML = `<div class="card-b err">${esc(e.message)}</div>`; }
}

/* ---------- cotizaciones ---------- */
const COT_UNIDADES = ["carclass", "carwash"];
const COT_EST = { borrador: "", enviada: "info", vista: "gold", aceptada: "ok", rechazada: "bad", vencida: "warn" };
const DEF_NOTAS = {
  get carclass() {
    const pg = P("carclass.transferencia").pago || {}, res = pg.reserva_monto;
    const pago = res ? `Reserva de ${clpTxt(res)}${pg.reserva_abonable ? " (se abona al total)" : ""}; en la recepción se completa el 50% del total y el saldo se paga a la entrega.${pg.cancelacion ? " " + pg.cancelacion + "." : ""}` : "Pago 50/50: mitad al reservar y mitad a la entrega.";
    return `Valores con IVA incluido. Precio final sujeto a evaluación presencial del vehículo. ${pago} Recepción en nuestra oficina en Puertas de Chicureo o en el centro de instalación de Alto Portezuelo, con previa coordinación; retiro y entrega a domicilio según zona. Incluye corrección de pintura en todo plan de cerámico, garantía XPEL y acta de entrega.`.replace(/\.\./g, ".");
  },
  get carwash() { const n = cwNeg(); return `Valores «desde», con IVA incluido, según el tamaño del vehículo. Servicio en ${n.direccion || "Huertos Familiares"}, ${cwHorario()}. Pago al momento de la entrega.`; },
};
const MARCA = {
  carclass: ["Carclass", "Tu auto, en manos correctas.", "Instalador oficial XPEL · desde 2017"],
  carwash: ["Carwash.hf", "Lavado y cuidado estético", "Huertos Familiares, Tiltil"],
  nom: ["NOM · Nor-Oriente Motors", "Más confianza. Mejor decisión.", "Chicureo"],
  blackgps: ["BlackGPS", "Tecnología que cuida tu flota.", "Distribuidor autorizado"],
};
const linkPublico = (token) => `${location.origin}${location.pathname}#/c/${token}`;
async function viewCotizaciones() {
  setActive("cotizaciones");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Cotizaciones</h1><p>Del catálogo vigente, con banda de precio, PDF y link público. Cuando el cliente abre el link, la cotización pasa a «vista» y te avisamos.</p></div>
    <div class="actions"><a class="btn" href="${TOOLS.cotizador}" target="_blank" rel="noopener">${ico("link", 15)} Cotizador clásico</a><button class="btn primary" id="q-new">${ico("plus", 16)} Nueva cotización</button></div></div><div id="ql">${loading(4)}</div>`;
  $("#q-new").onclick = () => modalNuevaCotizacion();
  try {
    const q = (await rpc("app_cotizaciones")).filter((x) => enLinea(x.unidad));
    $("#ql").innerHTML = `<section class="card">${q.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>N°</th><th>Fecha</th><th>Cliente</th><th>Unidad</th><th class="num">Total</th><th>Válida hasta</th><th>Estado</th><th></th></tr></thead><tbody>
      ${q.map((x) => `<tr class="click" data-id="${x.id}" data-emp="${x.empresa_id || ""}" data-v2="${x.oportunidad_id ? 1 : ""}"><td class="name">${esc(x.numero || "—")}</td><td>${fecha(x.fecha)}</td><td>${esc(x.cliente || "—")}</td><td>${unidadPill(x.unidad)}</td><td class="num">${clp(x.total)}</td><td>${fecha(x.vigencia)}</td>
        <td><span class="pill ${COT_EST[x.estado] || ""}">${esc(x.estado)}</span>${x.vista_en ? `<div class="sub">vista ${hace(x.vista_en)}${x.vistas > 1 ? ` · ${x.vistas} veces` : ""}</div>` : ""}</td>
        <td>${x.oportunidad_id && x.estado !== "borrador" ? `<button class="btn sm" data-link="${x.token}" onclick="event.stopPropagation()">${ico("link", 14)} Link</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : empty("doc", "Sin cotizaciones", "Crea una desde aquí o desde la ficha del cliente.")}</section>`;
    $$("#ql tr[data-id]").forEach((tr) => tr.onclick = () => (location.hash = tr.dataset.v2 ? "#/cot/" + tr.dataset.id : tr.dataset.emp ? "#/cliente/" + tr.dataset.emp : "#/cotizaciones"));
    $$("#ql [data-link]").forEach((b) => b.onclick = async (e) => { e.stopPropagation(); copiar(linkPublico(b.dataset.link), "Link copiado"); });
  } catch (e) { $("#ql").innerHTML = fail(e); }
}
async function copiar(txt, ok = "Copiado") { try { await navigator.clipboard.writeText(txt); toast(ok); } catch { prompt("Copia el texto:", txt); } }
function modalNuevaCotizacion() {
  const root = modal("Nueva cotización", `<div class="field"><label for="nc-q">Cliente</label><input class="input" id="nc-q" placeholder="Nombre, teléfono o RUT" autocomplete="off"></div><div id="nc-r" class="muted" style="font-size:13px">Busca el cliente. Si no existe, créalo primero con «Nuevo lead».</div>`, null);
  let t;
  $("#nc-q", root).oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const q = $("#nc-q", root).value.trim(); if (q.length < 2) return;
    try {
      const d = await rpc("app_empresas", { p_q: q, p_filtro: null, p_pagina: 0 });
      $("#nc-r", root).innerHTML = d.filas.length ? d.filas.slice(0, 8).map((r) => `<button type="button" class="pick" data-id="${r.id}"><b>${esc(r.nombre)}</b><span class="faint">${esc([r.telefono, r.comuna].filter(Boolean).join(" · "))}</span></button>`).join("") : "Sin resultados.";
      $$(".pick", root).forEach((b) => b.onclick = async () => {
        const f = await rpc("app_ficha", { p_id: b.dataset.id });
        const ops = f.oportunidades.filter((o) => o.estado === "abierta" && COT_UNIDADES.includes(o.unidad));
        if (!ops.length) { $("#nc-r", root).innerHTML = `<div class="alert">${ico("alert", 16)}<div><b>${esc(f.empresa.nombre)}</b> no tiene oportunidades abiertas en Carclass ni Carwash.hf. Crea un lead primero.</div></div>`; return; }
        if (ops.length === 1) { root.innerHTML = ""; return modalCotizador({ oportunidad_id: ops[0].id, unidad: ops[0].unidad, cliente: f.empresa.nombre }); }
        $("#nc-r", root).innerHTML = ops.map((o) => `<button type="button" class="pick" data-op="${o.id}" data-u="${o.unidad}"><b>${esc(uName(o.unidad))} · ${esc(etapaTxt(o.etapa))}</b><span class="faint">${esc(o.titulo || o.proxima_accion || "")}</span></button>`).join("");
        $$("[data-op]", root).forEach((x) => x.onclick = () => { root.innerHTML = ""; modalCotizador({ oportunidad_id: x.dataset.op, unidad: x.dataset.u, cliente: f.empresa.nombre }); });
      });
    } catch (e) { $("#nc-r", root).textContent = e.message; }
  }, 280); };
}
async function modalCotizador({ oportunidad_id, unidad, cliente, cot = null, after }) {
  let cat = [];
  try { cat = await rpc("app_catalogo", { p_unidad: unidad }); } catch (e) { toast(e.message, true); return; }
  let lineas = cot?.items?.lineas ? JSON.parse(JSON.stringify(cot.items.lineas)) : [];
  const guardar = async (estado) => {
    if (!lineas.length) throw new Error("Agrega al menos un ítem.");
    const r = await rpc("app_guardar_cotizacion", { p: { id: cot?.id || null, oportunidad_id, lineas, auto: $("#q-auto").value.trim() || null, notas: $("#q-notas").value.trim() || null, vigencia_dias: Number($("#q-vig").value) || 7, estado } });
    if (estado === "enviada") setTimeout(() => modalCompartir({ ...r, cliente, unidad, oportunidad_id }), 50);
    else { toast(`Borrador ${r.numero} guardado`); }
    after && after();
  };
  const root = modal(`${cot ? "Cotización " + cot.numero : "Nueva cotización"} · ${cliente}`, `
    <div class="row"><div class="field"><label for="q-auto">Vehículo</label><input class="input" id="q-auto" placeholder="Marca, modelo, año y color" value="${esc(cot?.items?.auto || "")}"></div><div class="field" style="flex:0 1 130px"><label for="q-vig">Validez (días)</label><input class="input" id="q-vig" type="number" min="1" value="7"></div></div>
    <div class="field"><span class="lbl">Agregar del catálogo · ${esc(uName(unidad))}</span><div class="chips" id="q-cat">${cat.map((c, i) => `<button type="button" class="chip" data-add="${i}" title="${esc(c.descripcion || "")}">${ico("plus", 13)} ${esc(c.nombre)} <span class="faint">${c.aproximado ? "≈ " : ""}${clp(c.precio)}</span></button>`).join("")}<button type="button" class="chip" data-add="otro">${ico("plus", 13)} Otro ítem</button></div></div>
    <div id="q-lin"></div><div id="q-rules"></div>
    <div class="field"><label for="q-notas">Condiciones para el cliente</label><textarea class="input" id="q-notas" style="min-height:70px">${esc(cot?.notas || DEF_NOTAS[unidad] || "")}</textarea></div>`,
    () => guardar("enviada"), "Guardar y enviar", true, { text: "Guardar borrador", fn: () => guardar("borrador") });
  const pinta = () => {
    const total = lineas.reduce((a, l) => a + l.precio * l.cantidad, 0);
    const conM = lineas.filter((l) => cat.find((c) => c.codigo === l.codigo)?.margen_ref != null);
    const margen = conM.reduce((a, l) => a + l.precio * l.cantidad * (cat.find((c) => c.codigo === l.codigo).margen_ref / 100), 0);
    $("#q-lin", root).innerHTML = lineas.length ? `<div class="tbl-wrap"><table class="tbl qtbl"><thead><tr><th>Ítem</th><th class="num">Cant.</th><th class="num">Precio c/IVA</th><th class="num">Total</th><th></th></tr></thead><tbody>${lineas.map((l, i) => {
      const c = cat.find((x) => x.codigo === l.codigo); const bajo = c && l.precio < c.precio * (1 - (c.descuento_max_pct || 0) / 100);
      return `<tr><td><input class="input sm" data-f="nombre" data-i="${i}" value="${esc(l.nombre)}" aria-label="Ítem"><div class="sub">${c ? `Lista ${clp(c.precio)}` : "Ítem libre"}${bajo ? ' · <b style="color:var(--bad)">bajo la banda: requiere tu aprobación</b>' : ""}</div></td>
        <td class="num"><input class="input sm" type="number" min="1" data-f="cantidad" data-i="${i}" value="${l.cantidad}" style="width:62px" aria-label="Cantidad"></td>
        <td class="num"><input class="input sm" type="number" min="0" step="5000" data-f="precio" data-i="${i}" value="${l.precio}" style="width:118px" aria-label="Precio"></td>
        <td class="num"><b>${clp(l.precio * l.cantidad)}</b></td><td><button type="button" class="btn ghost sm icon" data-del="${i}" aria-label="Quitar">${ico("x", 14)}</button></td></tr>`; }).join("")}</tbody>
      </table></div>
      <div class="qtot"><span>Neto ${clp(Math.round(total / 1.19))} · IVA ${clp(total - Math.round(total / 1.19))}</span><span>Total <b style="font-size:15px">${clp(total)}</b></span>
      ${ME.ve_finanzas && conM.length ? `<span class="faint" style="flex-basis:100%;text-align:right">Margen estimado (interno, según catálogo): ${clp(margen)} · ${total ? Math.round((margen / total) * 100) : 0}%</span>` : ""}</div>`
      : '<div class="muted" style="font-size:13px">Agrega servicios del catálogo. Recomienda una solución y, como máximo, una alternativa.</div>';
    const cods = lineas.map((l) => l.codigo); const reglas = [];
    if (unidad === "carclass") {
      if (cods.includes("ppf_frontal") && !cods.some((c) => ["ceramico_1", "ceramico_4", "protect_plus", "shield"].includes(c))) reglas.push("El PPF nunca se cotiza solo: agrega cerámico, corrección y láminas de seguridad.");
      if (lineas.length > 4) reglas.push("Muchas opciones enfrían al cliente: deja una recomendada y una alternativa.");
      if (total >= (P("carclass.retiro").desde_monto || 600000) && !cods.includes("retiro")) reglas.push(`Venta de mayor valor: puedes ofrecer ${retiroTxt()}.`);
      if (lineas.some((l) => cat.find((c) => c.codigo === l.codigo)?.aproximado)) reglas.push("Incluye valores aproximados (cerámico, PPF total o desabolladura): se confirman con el cliente y el vehículo.");
      if (lineas.some((l) => cat.find((c) => c.codigo === l.codigo)?.requiere_humano)) reglas.push("Desabolladura y personalización las evalúa una persona con fotos y el especialista antes de enviar.");
    }
    if (unidad === "carclass" && lineas.some((l) => { const c = cat.find((x) => x.codigo === l.codigo); return c && l.precio < c.precio; })) reglas.push(Number(P("carclass.descuento").max_pct_sin_aprobacion || 0) > 0 ? `Hay descuento: hasta ${P("carclass.descuento").max_pct_sin_aprobacion}% sin aprobación; más que eso requiere tu aprobación.` : "Hay descuento: la política vigente es sin rebajas en venta unitaria (los paquetes ya traen su −5%). Cualquier descuento es decisión tuya.");
    if (unidad === "carwash") {
      if (lineas.some((l) => { const c = cat.find((x) => x.codigo === l.codigo); return c && l.precio < c.precio; })) reglas.push("Carwash.hf no hace descuentos: usa los precios del catálogo.");
      if (lineas.some((l) => cat.find((c) => c.codigo === l.codigo)?.requiere_humano)) reglas.push("Pulidos, cerámico e interior: confirma el valor con el auto a la vista antes de enviar.");
      reglas.push("Vans, furgones y flotas de más de 2 vehículos no tienen precio de catálogo: los cotiza Felipe.");
    }
    $("#q-rules", root).innerHTML = reglas.map((r) => `<div class="alert">${ico("alert", 16)}<div>${r}</div></div>`).join("");
  };
  $("#q-cat", root).onclick = (e) => { const b = e.target.closest("[data-add]"); if (!b) return; const c = cat[b.dataset.add]; lineas.push(c ? { codigo: c.codigo, nombre: c.nombre, descripcion: c.descripcion, cantidad: 1, precio: Number(c.precio) } : { codigo: null, nombre: "Ítem", cantidad: 1, precio: 0 }); pinta(); };
  $("#q-lin", root).onchange = (e) => { const x = e.target; if (x.dataset.f == null) return; const l = lineas[x.dataset.i]; l[x.dataset.f] = x.dataset.f === "nombre" ? x.value : Math.max(0, Number(x.value) || 0); pinta(); };
  $("#q-lin", root).onclick = (e) => { const b = e.target.closest("[data-del]"); if (b) { lineas.splice(Number(b.dataset.del), 1); pinta(); } };
  pinta();
}
function modalCompartir(r) {
  const url = linkPublico(r.token);
  modal(`Cotización ${r.numero} lista`, `<p style="margin:0">Total <b>${clp(r.total)}</b>${r.requiere_aprobacion ? ' · <span class="pill warn">tiene precios bajo la banda</span>' : ""}. Comparte el link: cuando el cliente lo abra, pasará a «vista» y te llegará un aviso.</p>
    <div class="field"><label for="cs-url">Link público</label><input class="input" id="cs-url" value="${esc(url)}" readonly></div>
    <div class="row"><button type="button" class="btn" id="cs-copy">${ico("link", 15)} Copiar link</button><button type="button" class="btn primary" id="cs-wa">${ico("chat", 15)} Enviar por WhatsApp</button><a class="btn" href="#/cot/${r.id}" id="cs-pdf">${ico("doc", 15)} Ver y descargar PDF</a></div>`, null);
  $("#cs-copy").onclick = () => copiar(url, "Link copiado");
  $("#cs-pdf").onclick = () => ($("#modal-root").innerHTML = "");
  $("#cs-wa").onclick = async () => {
    let tel = null; try { const q = await rpc("app_cotizacion", { p_id: r.id }); tel = q.telefono; r.cliente = q.contacto || q.cliente; } catch {}
    const txt = `Hola${r.cliente ? " " + String(r.cliente).split(" ")[0] : ""}, te comparto la cotización ${r.numero} de ${MARCA[r.unidad]?.[0] || "Carclass"}: ${url}`;
    window.open(waLink(tel, txt) || `https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank", "noopener");
  };
}
function cotDoc(q, interno = false) {
  const [marca, tag, pie] = MARCA[q.unidad] || MARCA.carclass;
  const lineas = q.lineas || q.items?.lineas || [];
  const total = Number(q.total || 0), neto = Number(q.neto || Math.round(total / 1.19));
  return `<article class="qdoc" style="--c:${UNIDADES[q.unidad]?.c || "var(--brand)"}">
    <header class="qd-h"><div class="qd-brand">${["carclass", "carwash"].includes(q.unidad) ? logoDisc() : ""}<div><b>${esc(marca)}</b><small>${esc(tag)}</small></div></div>
      <div class="qd-meta"><b>Cotización ${esc(q.numero || "")}</b><span>Emitida ${fecha(q.fecha)}</span><span>Válida hasta ${fecha(q.vigencia)}</span></div></header>
    <section class="qd-cli"><div><span class="lbl">Cliente</span><b>${esc(q.cliente || "—")}</b></div>${(q.auto || q.items?.auto) ? `<div><span class="lbl">Vehículo</span><b>${esc(q.auto || q.items?.auto)}</b></div>` : ""}</section>
    <table class="qd-items"><thead><tr><th>Servicio</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Total</th></tr></thead><tbody>
      ${lineas.map((l) => `<tr><td><b>${esc(l.nombre)}</b>${l.descripcion ? `<div class="sub">${esc(l.descripcion)}</div>` : ""}</td><td class="num">${int(l.cantidad || 1)}</td><td class="num">${clp(l.precio)}</td><td class="num">${clp(Number(l.precio) * Number(l.cantidad || 1))}</td></tr>`).join("")}
    </tbody></table>
    <div class="qd-tot"><div><span>Neto</span><span>${clp(neto)}</span></div><div><span>IVA 19%</span><span>${clp(total - neto)}</span></div><div class="big"><span>Total</span><span>${clp(total)}</span></div></div>
    ${q.notas ? `<section class="qd-notas"><h4>Condiciones</h4><p>${esc(q.notas)}</p></section>` : ""}
    <footer class="qd-f">${esc(marca)} · ${esc(pie)} · ${q.unidad === "carwash" ? "+56 9 4619 6226" : "+56 9 8670 4745 · fmontecinos@carclass.cl"}</footer>
    ${interno && q.costo_estimado != null ? `<div class="no-print faint" style="font-size:12px;margin-top:10px">Interno: costo estimado ${clp(q.costo_estimado)} · margen ${total ? Math.round(((total - q.costo_estimado) / total) * 100) : 0}%</div>` : ""}
  </article>`;
}
async function viewCot(id) {
  setActive("cotizaciones", "Cotización");
  const P = $("#page"); P.innerHTML = loading(6);
  try {
    const q = await rpc("app_cotizacion", { p_id: id });
    if (!q) { P.innerHTML = `<div class="card">${empty("doc", "Cotización no encontrada")}</div>`; return; }
    setActive("cotizaciones", `Cotización ${q.numero}`);
    const v2 = q.items?.v === 2;
    P.innerHTML = `<div class="page-head no-print"><div><h1>Cotización ${esc(q.numero)}</h1><p><span class="pill ${COT_EST[q.estado] || ""}">${esc(q.estado)}</span> ${q.vista_en ? `· vista por el cliente ${hace(q.vista_en)}${q.vistas > 1 ? ` (${q.vistas} veces)` : ""}` : q.enviada_en ? "· enviada, aún no abierta" : "· borrador"}</p></div>
      <div class="actions">${q.empresa_id ? `<a class="btn" href="#/cliente/${q.empresa_id}">${ico("users", 15)} Ficha</a>` : ""}${v2 ? `<button class="btn" id="cq-edit">Editar</button>` : ""}${q.estado !== "borrador" ? `<button class="btn" id="cq-link">${ico("link", 15)} Copiar link</button>` : ""}
        ${["enviada", "vista"].includes(q.estado) ? `<button class="btn" id="cq-ok">${ico("check", 15)} Aceptada</button><button class="btn ghost danger" id="cq-no">Rechazada</button>` : ""}${q.unidad === "carclass" && q.estado !== "rechazada" ? `<a class="btn" href="${TOOLS.cotizador}/?cot=${encodeURIComponent(q.id)}" target="_blank" rel="noopener" title="Abre esta cotización en el cotizador para emitir la orden de ingreso y el acta de entrega">${ico("link", 15)} Orden de ingreso</a>` : ""}<button class="btn primary" id="cq-pdf">${ico("dl", 15)} Descargar PDF</button></div></div>
      ${v2 ? cotDoc(q, true) : `<div class="card card-b"><p class="muted">Cotización importada del cotizador anterior (${esc(q.unidad)}). Total neto ${clp(q.neto)}.</p></div>`}`;
    $("#cq-pdf").onclick = () => window.print();
    if ($("#cq-link")) $("#cq-link").onclick = () => copiar(linkPublico(q.token), "Link copiado");
    if ($("#cq-edit")) $("#cq-edit").onclick = () => modalCotizador({ oportunidad_id: q.oportunidad_id, unidad: q.unidad, cliente: q.cliente, cot: q, after: () => viewCot(id) });
    const est = (e) => async () => { try { await rpc("app_cotizacion_estado", { p_id: id, p_estado: e }); toast(`Marcada como ${e}`); viewCot(id); } catch (err) { toast(err.message, true); } };
    if ($("#cq-ok")) $("#cq-ok").onclick = est("aceptada");
    if ($("#cq-no")) $("#cq-no").onclick = est("rechazada");
  } catch (e) { P.innerHTML = fail(e); }
}
async function viewPublica(token) {
  document.documentElement.dataset.theme = "light";
  $("#app").innerHTML = `<div class="pub">${loading(6)}</div>`;
  try {
    const { data, error } = await sb.rpc("cotizacion_publica", { p_token: token });
    if (error || !data) throw new Error("Esta cotización no existe o ya no está disponible.");
    document.title = `Cotización ${data.numero} · ${MARCA[data.unidad]?.[0] || "Carclass"}`;
    $("#app").innerHTML = `<div class="pub"><div class="pub-bar no-print"><span>Cotización ${esc(data.numero)}</span><button class="btn primary sm" id="pp">${ico("dl", 14)} Descargar PDF</button></div>${cotDoc(data)}
      <div class="pub-cta no-print"><p>¿Te acomoda? Responde por WhatsApp y te proponemos dos fechas.</p><a class="btn primary" href="${waLink(WA_UNIDAD[data.unidad] || "+56986704745", `Hola, revisé la cotización ${data.numero} y quiero avanzar.`)}" target="_blank" rel="noopener">${ico("chat", 15)} Responder por WhatsApp</a></div></div>`;
    $("#pp").onclick = () => window.print();
  } catch (e) { $("#app").innerHTML = `<div class="pub"><div class="card">${empty("doc", "Cotización no disponible", esc(e.message))}</div></div>`; }
}

/* ---------- NOM · tasador trazable (v2.9, core_v31) ----------
 * Ficha → avisos reales (agente investigador por MCP o carga manual) → cálculo en la base → ajuste motivado →
 * aprobación humana → informe cliente (payload de lista blanca) → envío registrado.
 * La app nunca arma el informe con datos internos: usa d.informe = nom.payload_cliente(id). */
const TAS_EST = { borrador: ["Borrador", ""], calculada: ["Por aprobar", "warn"], aprobada: ["Aprobada", "ok"], enviada: ["Enviada", "info"], reemplazada: ["Reemplazada", ""], anulada: ["Anulada", "bad"] };
const TAS_CONF = { alto: ["Confianza alta", "ok"], medio: ["Confianza media", "gold"], bajo: ["Confianza baja", "bad"] };
const TAS_VM = [["misma", "Misma versión"], ["equivalente", "Equivalente"], ["distinta", "Otra versión"], ["indeterminada", "No dice versión"]];
const TAS_COND = [["contado", "Contado"], ["financiamiento", "Con financiamiento"], ["bono_0km", "Bono 0 km"], ["liquidacion", "Liquidación"], ["remate", "Remate"], ["siniestro", "Siniestro / recuperado"], ["otro", "Otro"]];
const TAS_VERIF = [["verificado_activo", "Verificado activo"], ["no_verificado", "No verificado"], ["caido", "Caído"]];
const TAS_FUENTE = [["declarado_por_cliente", "Declarado por el cliente"], ["extraido_de_documento", "Extraído de documento (padrón, ficha)"], ["validado_por_ejecutivo", "Validado por ejecutivo NOM"], ["observado_en_inspeccion", "Observado en inspección"]];
const TAS_CAMPOS_AJ = [["precio_publicacion", "Precio de publicación"], ["valor_comercial", "Valor comercial"], ["cierre_min", "Cierre estimado mínimo"], ["cierre_max", "Cierre estimado máximo"], ["rango_oferta_min", "Rango de oferta mínimo"], ["rango_oferta_max", "Rango de oferta máximo"]];
const TAS_MODALIDAD = [["", "Sin definir"], ["consignacion_virtual", "Consignación virtual"], ["consignacion_custodia", "Consignación con custodia"], ["compra_directa", "Compra directa"], ["no_recomendable", "No recomendable"]];
const linkInforme = (t) => `${location.origin}${location.pathname}#/t/${t}`;
const opt = (list, v) => list.map(([k, t]) => `<option value="${esc(k)}" ${String(v ?? "") === k ? "selected" : ""}>${esc(t)}</option>`).join("");
const pillE = (e) => `<span class="pill ${TAS_EST[e]?.[1] || ""}">${esc(TAS_EST[e]?.[0] || e)}</span>`;
function informeHTML(d, borrador = false) {
  if (!window.NOMInforme) return `<div class="alert">${ico("alert", 16)}<div>No se cargó la plantilla del informe.</div></div>`;
  if (!$("#nomr-css")) { const s = document.createElement("style"); s.id = "nomr-css"; s.textContent = NOMInforme.FONTS("") + NOMInforme.CSS; document.head.appendChild(s); }
  return NOMInforme.html(d, { logo: "img/nom-logo.png", borrador });
}

async function viewTasaciones(params) {
  setActive("tasaciones");
  const P = $("#page"), est = params.get("e") || "", q = params.get("q") || "";
  P.innerHTML = `<div class="page-head"><div><h1>Tasaciones NOM</h1><p>Valorización con avisos reales y verificables, aprobación de NOM y un informe para el cliente que nunca muestra datos internos.</p></div>
    <div class="actions"><button class="btn primary" id="tz-new">${ico("plus", 15)} Nueva tasación</button></div></div>
    <div class="filters"><div class="seg">${[["", "Vigentes"], ["borrador", "Borrador"], ["calculada", "Por aprobar"], ["aprobada", "Aprobadas"], ["enviada", "Enviadas"]].map(([k, t]) => `<button class="${k === est ? "on" : ""}" data-e="${k}">${t}</button>`).join("")}</div>
      <form id="tz-f" class="row" style="gap:6px"><input class="input" id="tz-q" placeholder="Folio, auto, patente o cliente" value="${esc(q)}" style="width:240px"><button class="btn">Buscar</button></form></div>
    <div id="tz-l">${loading(5)}</div>`;
  $$("[data-e]").forEach((b) => b.onclick = () => (location.hash = `#/tasaciones?e=${b.dataset.e}${q ? "&q=" + encodeURIComponent(q) : ""}`));
  $("#tz-f").onsubmit = (e) => { e.preventDefault(); location.hash = `#/tasaciones?e=${est}&q=${encodeURIComponent($("#tz-q").value.trim())}`; };
  $("#tz-new").onclick = () => modalTasacion(null, { oportunidad_id: params.get("op") });
  if (params.get("op")) modalTasacion(null, { oportunidad_id: params.get("op") });
  try {
    const l = await rpc("app_nom_tasaciones", { p_estado: est || null, p_q: q || null });
    $("#tz-l").innerHTML = l.length ? `<div class="card"><div class="tbl-wrap"><table class="tbl click"><thead><tr><th>Folio</th><th>Vehículo</th><th>Propietario</th><th>Estado</th><th class="num">Comparables</th><th class="num">Publicación</th><th>Vigencia</th></tr></thead><tbody>
      ${l.map((t) => `<tr data-id="${t.id}" tabindex="0"><td><b>${esc(t.folio)}</b>${t.version_n > 1 ? ` <span class="faint">v${t.version_n}</span>` : ""}<div class="sub">${fecha(t.creado_en)}</div></td>
        <td>${esc(t.vehiculo)}<div class="sub">${t.km != null ? int(t.km) + " km" : "km sin informar"}</div></td><td>${esc(t.propietario || "—")}</td>
        <td>${pillE(t.estado)} ${t.tipo === "pre_estimacion" && t.estado !== "borrador" ? '<span class="pill warn">Pre-estimación</span>' : ""}${t.confianza ? ` <span class="pill ${TAS_CONF[t.confianza][1]}">${TAS_CONF[t.confianza][0]}</span>` : ""}</td>
        <td class="num">${t.validos ?? "—"}</td><td class="num">${clp(t.precio_publicacion)}</td><td>${t.vigencia_hasta ? `<span class="${t.vencida ? "bad-t" : ""}">${fecha(t.vigencia_hasta)}${t.vencida ? " · vencida" : ""}</span>` : "—"}</td></tr>`).join("")}</tbody></table></div></div>`
      : `<div class="card">${empty("car", "Sin tasaciones", "Crea la primera con «Nueva tasación» o pídesela a tu agente: él busca avisos reales y los registra aquí.")}</div>`;
    $$("#tz-l tr[data-id]").forEach((tr) => { tr.onclick = () => (location.hash = "#/tasacion/" + tr.dataset.id); tr.onkeydown = (e) => e.key === "Enter" && tr.onclick(); });
  } catch (e) { $("#tz-l").innerHTML = fail(e); }
}

function modalTasacion(t, pre = {}) {
  const v = t || pre || {}, nueva = !t;
  const fuente = Object.values(v.fuentes || {})[0] || "declarado_por_cliente";
  const sel = (id, list, val) => `<select class="input" id="${id}">${opt(list, val)}</select>`;
  const f = (id, label, val, attrs = "") => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(val ?? "")}" ${attrs}></div>`;
  return modal(nueva ? "Nueva tasación NOM" : `Editar ficha · ${t.folio}`, `
    <p class="faint" style="margin:0;font-size:12.5px">Solo datos reales. La versión exacta decide qué avisos son comparables: si no está validada, el resultado sale como pre-estimación.</p>
    <div class="grid2">${f("tf-marca", "Marca *", v.marca, "required")}${f("tf-modelo", "Modelo *", v.modelo, "required")}</div>
    <div class="grid2">${f("tf-version", "Versión exacta", v.version, 'placeholder="Ej: Comfortline 1.0 TSI AT 4x2"')}<div class="field"><label>&nbsp;</label><label class="row" style="gap:8px;font-weight:600"><input type="checkbox" id="tf-vc" ${v.version_confirmada ? "checked" : ""}> Versión validada (padrón, ficha o ejecutivo)</label></div></div>
    <div class="grid2">${f("tf-anio", "Año *", v.anio, 'inputmode="numeric" required')}${f("tf-km", "Kilometraje", v.km, 'inputmode="numeric"')}</div>
    <div class="grid2"><div class="field"><label for="tf-tr">Transmisión</label>${sel("tf-tr", [["", "—"], ["Automática", "Automática"], ["Manual", "Manual"], ["CVT", "CVT"], ["Automática DSG", "DSG / doble embrague"]], v.transmision)}</div>
      <div class="field"><label for="tf-comb">Combustible</label>${sel("tf-comb", [["", "—"], ["Bencina", "Bencina"], ["Diésel", "Diésel"], ["Híbrido", "Híbrido"], ["Híbrido enchufable", "Híbrido enchufable"], ["Eléctrico", "Eléctrico"]], v.combustible)}</div></div>
    <div class="grid2">${f("tf-trac", "Tracción", v.traccion, 'placeholder="4x2, 4x4, AWD"')}${f("tf-carr", "Carrocería", v.carroceria, 'placeholder="SUV, sedán, camioneta…"')}</div>
    <div class="grid2">${f("tf-motor", "Motor", v.motor)}${f("tf-color", "Color", v.color)}</div>
    <div class="grid2">${f("tf-pat", "Patente (uso interno)", v.patente)}<div class="field"><label>&nbsp;</label><label class="row" style="gap:8px"><input type="checkbox" id="tf-mp" ${v.mostrar_patente !== false ? "checked" : ""}> Mostrar patente en el informe</label></div></div>
    <div class="grid2">${f("tf-duenos", "Propietarios (informado)", v.duenos, 'placeholder="Único dueño"')}${f("tf-llaves", "Llaves", v.llaves, 'placeholder="2 llaves"')}</div>
    ${f("tf-eq", "Equipamiento distintivo", v.equipamiento)}
    <div class="field"><label for="tf-fu">¿De dónde salen estos datos?</label>${sel("tf-fu", TAS_FUENTE, fuente)}</div>
    <div class="field"><label for="tf-obs">Observaciones internas del vehículo</label><textarea class="input" id="tf-obs">${esc(v.observaciones || "")}</textarea></div>
    <h4 style="margin:8px 0 0">Textos del informe</h4>
    <div class="field"><label for="tf-res">Resumen comercial (2–4 líneas, obligatorio para aprobar)</label><textarea class="input" id="tf-res" placeholder="Fortalezas, demanda y factores de valor">${esc(v.resumen_comercial || "")}</textarea></div>
    <div class="grid2"><div class="field"><label for="tf-com">Comercialidad (solo con fundamento)</label>${sel("tf-com", [["", "No mostrar"], ["5", "5 · Muy alta"], ["4", "4 · Buena"], ["3", "3 · Media"], ["2", "2 · Acotada"], ["1", "1 · Baja"]], v.comercialidad != null ? String(v.comercialidad) : "")}</div>
      ${f("tf-comt", "Etiqueta (opcional)", v.comercialidad_txt, 'placeholder="BUENA COMERCIALIDAD"')}</div>
    <div class="field"><label for="tf-cri">Criterios de tasación</label><textarea class="input" id="tf-cri" placeholder="Si lo dejas vacío se usa el texto estándar NOM">${esc(v.criterios || "")}</textarea></div>
    <div class="field"><label for="tf-ana">Análisis de las referencias</label><textarea class="input" id="tf-ana" placeholder="Por qué estos comparables respaldan la recomendación">${esc(v.analisis_comparables || "")}</textarea></div>
    <div class="field"><label for="tf-alc">Alcance y supuestos</label><textarea class="input" id="tf-alc" placeholder="Si lo dejas vacío se usa el texto estándar NOM">${esc(v.alcance || "")}</textarea></div>`,
  async () => {
    const val = (id) => $("#" + id).value.trim();
    if (!val("tf-marca") || !val("tf-modelo") || !/^\d{4}$/.test(val("tf-anio"))) throw new Error("Marca, modelo y año (4 dígitos) son obligatorios.");
    const fu = val("tf-fu"), fuentes = {}; ["marca", "modelo", "version", "anio", "km", "transmision", "duenos", "llaves"].forEach((k) => (fuentes[k] = fu));
    const p = { id: t?.id || null, oportunidad_id: pre.oportunidad_id || undefined, marca: val("tf-marca"), modelo: val("tf-modelo"), version: val("tf-version"), version_confirmada: $("#tf-vc").checked,
      anio: val("tf-anio"), km: val("tf-km").replace(/\D/g, ""), transmision: val("tf-tr"), combustible: val("tf-comb"), traccion: val("tf-trac"), carroceria: val("tf-carr"), motor: val("tf-motor"),
      color: val("tf-color"), patente: val("tf-pat"), mostrar_patente: $("#tf-mp").checked, duenos: val("tf-duenos"), llaves: val("tf-llaves"), equipamiento: val("tf-eq"), observaciones: val("tf-obs"),
      fuentes, resumen_comercial: val("tf-res"), comercialidad: val("tf-com"), comercialidad_txt: val("tf-comt"), criterios: val("tf-cri"), analisis_comparables: val("tf-ana"), alcance: val("tf-alc") };
    if (!p.oportunidad_id) delete p.oportunidad_id;
    const r = await rpc("app_nom_tasacion_guardar", { p });
    toast(nueva ? "Tasación creada" : "Ficha guardada");
    if (nueva) location.hash = "#/tasacion/" + r.id; else viewTasacion(t.id);
  }, nueva ? "Crear" : "Guardar", true);
}

async function viewTasacion(id, tab = "comparables") {
  setActive("tasaciones", "Tasación");
  const P = $("#page"); P.innerHTML = loading(6);
  let d, inv = null;
  try { [d, inv] = await Promise.all([rpc("app_nom_tasacion", { p_id: id }), rpc("app_nom_investigacion", { p_id: id }).catch(() => null)]); } catch (e) { P.innerHTML = fail(e); return; }
  if (!d || !d.id) { P.innerHTML = `<div class="card">${empty("car", "Tasación no encontrada")}</div>`; return; }
  const invActiva = inv && ["pendiente", "en_curso"].includes(inv.estado);
  setActive("tasaciones", d.folio);
  const editable = ["borrador", "calculada"].includes(d.estado), st = d.estadisticas || {}, av = d.avisos || [];
  const veh = [d.marca, d.modelo, d.version, d.anio].filter(Boolean).join(" ");
  const kpi = (l, v, s = "") => `<div class="kpi"><span class="l">${l}</span><span class="v" style="font-size:22px">${v}</span>${s ? `<span class="s">${s}</span>` : ""}</div>`;
  const rng = (a, b) => a == null ? "—" : a === b || b == null ? clpM(a) : `${clpM(a)} – ${clpM(b)}`;
  const aj = d.ajustes_manuales || {};
  const marcaAj = (k) => aj[k] != null ? ' <span class="pill gold" title="Ajustado a mano; ver historial">ajustado</span>' : "";
  P.innerHTML = `<div class="page-head"><div><h1>${esc(veh)}</h1><p>${esc(d.folio)}${d.version_n > 1 ? ` · versión ${d.version_n}` : ""} · ${pillE(d.estado)} ${d.tipo === "pre_estimacion" ? '<span class="pill warn">Pre-estimación</span>' : '<span class="pill ok">Tasación respaldada</span>'}
      ${d.confianza ? `<span class="pill ${TAS_CONF[d.confianza][1]}">${TAS_CONF[d.confianza][0]}</span>` : ""} ${d.km != null ? "· " + int(d.km) + " km" : ""}${d.propietario ? ` · <a href="#/cliente/${d.propietario.id}">${esc(d.propietario.nombre)}</a>` : ""}</p></div>
    <div class="actions">${editable && d.puede_aprobar && !invActiva ? `<button class="btn" id="tz-inv">${ico("spark", 15)} ${av.length ? "Reinvestigar mercado" : "Investigar mercado con IA"}</button>` : ""}${editable ? `<button class="btn" id="tz-edit">Editar ficha</button><button class="btn primary" id="tz-calc">${ico("spark", 15)} Calcular</button>` : ""}
      ${d.estado === "calculada" ? `<button class="btn" id="tz-aj">Ajustar cifra</button>${d.puede_aprobar ? `<button class="btn primary" id="tz-apr">${ico("check", 15)} Revisar y aprobar</button>` : ""}` : ""}
      ${["aprobada", "enviada"].includes(d.estado) ? `<button class="btn primary" id="tz-env">${ico("chat", 15)} Enviar al cliente</button>` : ""}
      ${["calculada", "aprobada", "enviada"].includes(d.estado) ? `<button class="btn ghost" id="tz-ver">Nueva versión</button>` : ""}
      ${d.puede_aprobar && !["anulada", "reemplazada"].includes(d.estado) ? `<button class="btn ghost danger" id="tz-anu">Anular</button>` : ""}</div></div>
    ${(d.advertencias || []).length ? `<div class="alert" style="margin-bottom:14px">${ico("alert", 16)}<div>${d.advertencias.map((a) => `<div>${esc(a)}</div>`).join("")}</div></div>` : ""}
    ${invActiva ? `<div class="alert" style="margin-bottom:14px">${ico("spark", 16)}<div><b>Investigando el mercado${inv.etapas ? ` · etapa ${int(inv.etapas)}` : ""}.</b> Claude busca avisos comparables en Chileautos, Mercado Libre, Yapo y Kavak; toma unos minutos. Te aviso cuando la tasación esté lista para aprobar.${inv.error ? ` <span class="faint">Último reintento: ${esc(String(inv.error).slice(0, 120))}</span>` : ""}</div></div>`
      : inv && inv.estado === "error" ? `<div class="alert" style="margin-bottom:14px">${ico("alert", 16)}<div><b>La investigación automática falló.</b> ${esc(String(inv.error || "").slice(0, 200))} Puedes reintentar o agregar avisos a mano.</div></div>`
      : inv && inv.estado === "lista" && inv.notas ? `<div class="alert" style="margin-bottom:14px">${ico("spark", 16)}<div><b>Notas del investigador</b> (${int(inv.avisos ?? 0)} avisos, ${int(inv.verificados ?? 0)} verificados, USD ${esc(String(inv.costo_usd ?? "—"))}): ${esc(inv.notas)}</div></div>`
      : d.estado === "borrador" && !av.length ? `<div class="alert" style="margin-bottom:14px">${ico("spark", 16)}<div><b>Siguiente paso: investigar el mercado.</b> Pulsa «Investigar mercado con IA» (busca avisos reales con su URL y evidencia) o agrega avisos a mano.</div></div>` : ""}
    <div class="kpis" style="margin-bottom:16px">${kpi("Rango de oferta comparable" + marcaAj("rango_oferta_min"), rng(d.rango_oferta_min, d.rango_oferta_max), st.precio_min ? `Avisos válidos: ${clpM(st.precio_min)} a ${clpM(st.precio_max)}` : "")}
      ${kpi("Valor comercial" + marcaAj("valor_comercial"), clp(d.valor_comercial), st.mediana_ajustada ? `Mediana ajustada ${clp(st.mediana_ajustada)}` : "")}
      ${kpi("Publicación sugerida" + marcaAj("precio_publicacion"), clp(d.precio_publicacion), st.publicacion_calculada && st.publicacion_calculada !== d.precio_publicacion ? `Cálculo: ${clp(st.publicacion_calculada)}` : "")}
      ${kpi("Venta esperada" + marcaAj("cierre_min"), rng(d.cierre_min, d.cierre_max), `${int(st.validos ?? 0)} válidos de ${int(st.universo ?? av.length)} · dispersión ${st.dispersion_pct ?? "—"}%`)}</div>
    <div class="filters"><div class="seg" id="tz-tabs">${[["comparables", `Comparables (${av.length})`], ["informe", "Informe del cliente"], ...(d.ve_interna ? [["interno", "Interno NOM"]] : []), ["historial", "Historial"]].map(([k, t]) => `<button class="${k === tab ? "on" : ""}" data-tab="${k}">${t}</button>`).join("")}</div></div>
    <div id="tz-body"></div>`;
  const again = (t = tab) => viewTasacion(id, t);
  $$("#tz-tabs [data-tab]").forEach((b) => b.onclick = () => again(b.dataset.tab));
  if ($("#tz-edit")) $("#tz-edit").onclick = () => modalTasacion(d);
  if ($("#tz-inv")) $("#tz-inv").onclick = async () => { try { await rpc("app_nom_investigar", { p_id: id }); toast("Investigación en marcha: te aviso cuando esté lista"); again(); } catch (e) { toast(e.message, true); } };
  // Mientras investiga, la ficha se refresca sola cada 30 s (solo si sigue abierta)
  if (invActiva) setTimeout(() => { if (location.hash === "#/tasacion/" + id) again(); }, 30000);
  if ($("#tz-calc")) $("#tz-calc").onclick = async () => { try { await rpc("app_nom_tasacion_calcular", { p_id: id }); toast("Tasación calculada"); again(); } catch (e) { toast(e.message, true); } };
  if ($("#tz-aj")) $("#tz-aj").onclick = () => modalAjuste(d, again);
  if ($("#tz-apr")) $("#tz-apr").onclick = () => modalAprobar(d, again);
  if ($("#tz-env")) $("#tz-env").onclick = () => modalEnviarTasacion(d, again);
  if ($("#tz-ver")) $("#tz-ver").onclick = () => modal("Nueva versión", `<p style="margin:0">La versión ${d.version_n} queda guardada tal cual${["aprobada", "enviada"].includes(d.estado) ? " (y pasa a «reemplazada»)" : ""}. La nueva copia la ficha, los avisos y la parte interna para que la corrijas y la recalcules.</p>
      <div class="field"><label for="nv-m">Motivo *</label><input class="input" id="nv-m" placeholder="Ej: inspección detectó repintado en puerta trasera"></div>`, async () => {
      const r = await rpc("app_nom_tasacion_version", { p_id: id, p_motivo: $("#nv-m").value.trim() }); toast("Nueva versión creada"); location.hash = "#/tasacion/" + r.id; }, "Crear versión");
  if ($("#tz-anu")) $("#tz-anu").onclick = () => modal("Anular tasación", `<div class="field"><label for="an-m">Motivo *</label><input class="input" id="an-m"></div>`, async () => {
      await rpc("app_nom_tasacion_anular", { p_id: id, p_motivo: $("#an-m").value.trim() }); toast("Tasación anulada"); again(); }, "Anular");
  const B = $("#tz-body");
  if (tab === "informe") {
    B.innerHTML = `<div class="row no-print" style="margin-bottom:10px;gap:8px">${["aprobada", "enviada"].includes(d.estado) ? `<a class="btn" href="#/t/${esc(d.token)}" target="_blank" rel="noopener">${ico("dl", 15)} Abrir informe para descargar PDF</a>` : `<span class="pill warn">Vista previa · se habilita para el cliente cuando apruebes</span>`}
      <span class="faint" style="font-size:12.5px">Esto es exactamente lo que verá el cliente: la base arma el contenido desde una lista blanca, sin datos internos.</span></div>
      <div style="overflow:auto;background:var(--surface-2);padding:16px;border-radius:12px">${informeHTML(d.informe, !["aprobada", "enviada"].includes(d.estado))}</div>`;
  } else if (tab === "interno") {
    const i = d.interna || {};
    B.innerHTML = `<div class="card card-b" style="display:grid;gap:12px;max-width:760px"><p class="faint" style="margin:0;font-size:12.5px">Solo NOM. Nada de esto entra al informe, al link público ni a la API sin permiso «nom_interno». Comisiones y condiciones son propuestas hasta que estén en un contrato aprobado.</p>
      <div class="grid2"><div class="field"><label for="ti-pp">Precio pretendido por el cliente</label>${montoIn("ti-pp", i.precio_pretendido_cliente)}</div><div class="field"><label for="ti-urg">Urgencia de venta</label><input class="input" id="ti-urg" value="${esc(i.urgencia || "")}"></div></div>
      <div class="grid2"><div class="field"><label for="ti-toma">Precio de toma (compra directa)</label>${montoIn("ti-toma", i.precio_toma)}</div><div class="field"><label for="ti-mod">Modalidad recomendada</label><select class="input" id="ti-mod">${opt(TAS_MODALIDAD, i.modalidad_recomendada)}</select></div></div>
      <div class="grid2"><div class="field"><label for="ti-aco">Acondicionamiento</label>${montoIn("ti-aco", i.costo_acondicionamiento)}</div><div class="field"><label for="ti-cc">Costos de comercialización</label>${montoIn("ti-cc", i.costos_comercializacion)}</div></div>
      <div class="grid2"><div class="field"><label for="ti-cp">Comisión propuesta %</label><input class="input" id="ti-cp" inputmode="decimal" value="${esc(i.comision_pct ?? "")}"></div><div class="field"><label for="ti-cm">Comisión propuesta $</label>${montoIn("ti-cm", i.comision_monto)}</div></div>
      <div class="grid2"><div class="field"><label for="ti-rot">Rotación estimada (días)</label><input class="input" id="ti-rot" inputmode="numeric" value="${esc(i.rotacion_dias_est ?? "")}"></div><div class="field"><label for="ti-rie">Riesgo</label><input class="input" id="ti-rie" value="${esc(i.riesgo || "")}"></div></div>
      <div class="field"><label for="ti-neg">Notas de negociación</label><textarea class="input" id="ti-neg">${esc(i.notas_negociacion || "")}</textarea></div>
      ${i.precio_pretendido_cliente && d.precio_publicacion ? `<div class="alert">${ico("alert", 16)}<div>El cliente espera ${clp(i.precio_pretendido_cliente)}: ${i.precio_pretendido_cliente > d.precio_publicacion ? `${Math.round((i.precio_pretendido_cliente / d.precio_publicacion - 1) * 100)}% sobre la publicación sugerida` : "dentro de la publicación sugerida"}.</div></div>` : ""}
      <div><button class="btn primary" id="ti-save">Guardar interno</button></div></div>`;
    $("#ti-save").onclick = async () => { try {
      await rpc("app_nom_tasacion_guardar", { p: { id, interna: { precio_pretendido_cliente: montoVal($("#ti-pp")), urgencia: $("#ti-urg").value, precio_toma: montoVal($("#ti-toma")), modalidad_recomendada: $("#ti-mod").value,
        costo_acondicionamiento: montoVal($("#ti-aco")), costos_comercializacion: montoVal($("#ti-cc")), comision_pct: $("#ti-cp").value.replace(",", "."), comision_monto: montoVal($("#ti-cm")),
        rotacion_dias_est: $("#ti-rot").value, riesgo: $("#ti-rie").value, notas_negociacion: $("#ti-neg").value } } });
      toast("Guardado"); again("interno"); } catch (e) { toast(e.message, true); } };
  } else if (tab === "historial") {
    const li = (arr, f) => arr?.length ? arr.map(f).join("") : `<div class="faint" style="font-size:13px">Sin registros.</div>`;
    B.innerHTML = `<div class="grid2"><div class="card card-b"><h4 style="margin-top:0">Búsquedas de mercado</h4>${li(d.busquedas, (b) => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><b>${esc(b.portal)}</b> · ${fechaHora(b.ejecutada_en)} · ${esc(b.ejecutor)}<div class="faint">${esc(b.consulta || "")}${b.url_busqueda ? ` · <a href="${esc(b.url_busqueda)}" target="_blank" rel="noopener">ver búsqueda</a>` : ""}${b.resultados_n != null ? ` · ${int(b.resultados_n)} resultados` : ""}</div></div>`)}</div>
      <div class="card card-b"><h4 style="margin-top:0">Aprobaciones y envíos</h4>${li([...(d.aprobaciones || []).map((a) => ({ ...a, k: "a" })), ...(d.envios || []).map((x) => ({ ...x, k: "e" }))].sort((a, b) => a.en < b.en ? -1 : 1), (x) => x.k === "a"
        ? `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><span class="pill ${x.decision === "aprobada" ? "ok" : "bad"}">${esc(x.decision)}</span> v${x.version_n} · ${esc(x.aprobador)} · ${fechaHora(x.en)}${x.excepcion_comparables ? ' · <span class="pill warn">con excepción</span>' : ""}${x.comentario ? `<div class="faint">${esc(x.comentario)}</div>` : ""}</div>`
        : `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><span class="pill info">enviada</span> v${x.version_n} · ${esc(x.canal)} → ${esc(x.destinatario || "—")} · ${esc(x.enviado_por)} · ${fechaHora(x.en)}</div>`)}</div>
      <div class="card card-b"><h4 style="margin-top:0">Ajustes manuales</h4>${li(d.ajustes, (a) => `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px"><b>${esc(a.campo.replace(/_/g, " "))}</b>: ${/^\d+$/.test(a.de || "") ? clp(a.de) : esc(a.de || "—")} → ${/^\d+$/.test(a.a || "") ? clp(a.a) : esc(a.a || "—")} · ${esc(a.autor)} · ${fechaHora(a.en)}<div class="faint">${esc(a.motivo)}</div></div>`)}</div>
      <div class="card card-b"><h4 style="margin-top:0">Versiones</h4>${li(d.versiones, (x) => `<div style="padding:6px 0;font-size:13px"><a href="#/tasacion/${x.id}">${esc(x.folio)}</a> ${pillE(x.estado)}${x.id === d.id ? ' <span class="faint">(esta)</span>' : ""}</div>`)}
        ${d.parametros ? `<h4>Parámetros usados</h4><div class="faint" style="font-size:12px">Año ${d.parametros.ajuste_anio_pct}%/año · km ${d.parametros.ajuste_10mil_km_pct}% c/10.000 · tope ${d.parametros.tope_ajuste_pct}% · publicación +${d.parametros.premio_publicacion_pct}% · cierre −${d.parametros.cierre_desc_min_pct}% a −${d.parametros.cierre_desc_max_pct}% · mínimo ${d.parametros.min_comparables} comparables · vigencia ${d.parametros.vigencia_dias} días</div>` : ""}</div></div>`;
  } else {
    const okV = av.filter((a) => a.valido), noV = av.filter((a) => a.valido === false), sinCalc = av.filter((a) => a.valido == null);
    const fila = (a) => `<tr class="${a.valido ? "" : "tz-off"}"><td style="min-width:230px"><a href="${esc(a.url)}" target="_blank" rel="noopener"><b>${esc(a.titulo || a.version_txt || "Aviso")}</b></a>
        <div class="sub">${esc(a.portal)} · ${esc([a.vendedor_nombre, a.comuna, a.region].filter(Boolean).join(" · "))}</div>
        ${a.valido === false ? `<div class="sub" style="color:var(--bad)">${esc(a.motivo_exclusion)}</div>` : a.valido ? `<div class="sub" style="color:var(--ok)">Comparable válido · peso ${a.peso}</div>` : `<div class="sub">Sin calcular</div>`}
        ${editable && a.valido ? `<input class="input sm" data-dif="${a.id}" value="${esc(a.diferencias || "")}" placeholder="Diferencia para el cliente" style="margin-top:6px;width:100%">` : a.diferencias ? `<div class="sub">${esc(a.diferencias)}</div>` : ""}</td>
      <td>${esc(a.version_txt || "—")}<br>${editable ? `<select class="input sm" data-f="version_match" data-id="${a.id}">${opt(TAS_VM, a.version_match)}</select>` : esc(TAS_VM.find((x) => x[0] === a.version_match)?.[1])}</td>
      <td class="num">${a.anio ?? "—"}</td><td class="num">${a.km != null ? int(a.km) : "—"}</td>
      <td class="num"><b>${clp(a.precio)}</b>${a.precio_ajustado ? `<div class="sub">${a.ajuste_pct > 0 ? "+" : ""}${a.ajuste_pct}% → ${clp(a.precio_ajustado)}</div>` : ""}</td>
      <td>${editable ? `<select class="input sm" data-f="verificacion" data-id="${a.id}">${opt(TAS_VERIF, a.verificacion)}</select><select class="input sm" data-f="condicion" data-id="${a.id}" style="margin-top:4px">${opt(TAS_COND, a.condicion)}</select>` : `${esc(TAS_VERIF.find((x) => x[0] === a.verificacion)?.[1])}<div class="sub">${esc(TAS_COND.find((x) => x[0] === a.condicion)?.[1])}</div>`}
        ${a.verificado_en ? `<div class="sub">${fechaHora(a.verificado_en)}</div>` : ""}</td>
      <td style="text-align:center"><input type="checkbox" data-inc="${a.id}" ${a.incluido ? "checked" : ""} ${editable ? "" : "disabled"} aria-label="Incluir en el cálculo"></td>
      <td style="text-align:center"><input type="checkbox" data-pdf="${a.id}" ${a.seleccionado_informe ? "checked" : ""} ${editable && a.valido ? "" : "disabled"} aria-label="Mostrar en el informe"></td>
      <td>${a.evidencia ? `<details><summary class="faint" style="cursor:pointer;font-size:12px">Ver</summary><div style="font-size:12px;max-width:280px;white-space:pre-wrap">${esc(a.evidencia)}</div></details>` : '<span class="faint">—</span>'}</td></tr>`;
    B.innerHTML = `${editable ? `<div class="row" style="gap:8px;margin-bottom:10px"><button class="btn" id="tz-add">${ico("plus", 15)} Agregar aviso</button><button class="btn" id="tz-json">Pegar avisos del investigador (JSON)</button>
        <span class="faint" style="font-size:12.5px">Cada cambio vuelve la tasación a borrador: recalcula antes de aprobar.</span></div>` : ""}
      ${av.length ? `<div class="card"><div class="tbl-wrap"><table class="tbl tz-tbl"><thead><tr><th>Aviso</th><th>Versión</th><th class="num">Año</th><th class="num">Km</th><th class="num">Precio · ajustado</th><th>Verificación · condición</th><th>Cálculo</th><th>Informe</th><th>Evidencia</th></tr></thead>
        <tbody>${[...okV, ...sinCalc, ...noV].map(fila).join("")}</tbody></table></div></div>` : `<div class="card">${empty("search", "Sin avisos registrados", "Los avisos deben ser reales, con URL directa, y verificados en el momento de tasar.")}</div>`}`;
    const edit = async (aid, p) => { try { await rpc("app_nom_aviso_editar", { p_aviso: aid, p }); again(); } catch (e) { toast(e.message, true); again(); } };
    $$("[data-f]", B).forEach((s) => s.onchange = () => edit(s.dataset.id, { [s.dataset.f]: s.value }));
    $$("[data-inc]", B).forEach((c) => c.onchange = () => edit(c.dataset.inc, { incluido: c.checked, motivo_tasador: c.checked ? "" : prompt("¿Por qué lo excluyes?") || "criterio del tasador" }));
    $$("[data-pdf]", B).forEach((c) => c.onchange = () => edit(c.dataset.pdf, { seleccionado_informe: c.checked }));
    $$("[data-dif]", B).forEach((x) => x.onchange = () => rpc("app_nom_aviso_editar", { p_aviso: x.dataset.dif, p: { diferencias: x.value } }).then(() => toast("Guardado")).catch((e) => toast(e.message, true)));
    if ($("#tz-add")) $("#tz-add").onclick = () => modalAviso(d, again);
    if ($("#tz-json")) $("#tz-json").onclick = () => modal("Pegar avisos del investigador", `<p class="faint" style="margin:0;font-size:12.5px">Formato de la herramienta nom_registrar_mercado: <code>{"portal":"chileautos","consulta":"…","avisos":[{"url":"…","precio":…}]}</code> o solo la lista de avisos. Se guardan tal cual; nada se inventa ni se completa.</p>
        <textarea class="input" id="pj" style="min-height:220px;font-family:monospace;font-size:12px"></textarea>`, async () => {
        let j; try { j = JSON.parse($("#pj").value); } catch { throw new Error("El texto no es JSON válido."); }
        const p = Array.isArray(j) ? { portal: "otro", consulta: "carga manual", avisos: j } : j;
        if (!Array.isArray(p.avisos) || !p.avisos.length) throw new Error("No hay avisos en el JSON.");
        if (p.avisos.some((a) => !/^https?:\/\//.test(a.url || ""))) throw new Error("Cada aviso necesita su URL directa (https://…).");
        const r = await rpc("app_nom_tasacion_avisos", { p_id: id, p }); toast(`${r.avisos} avisos registrados`); again(); }, "Registrar", true);
  }
}

function modalAviso(d, after) {
  const sel = (id, list, v) => `<select class="input" id="${id}">${opt(list, v)}</select>`;
  modal("Agregar aviso comparable", `<p class="faint" style="margin:0;font-size:12.5px">Abre el aviso, revisa que siga publicado y copia los datos tal como aparecen. «Verificado activo» solo si lo acabas de ver.</p>
    <div class="field"><label for="av-url">URL directa del aviso *</label><input class="input" id="av-url" placeholder="https://www.chileautos.cl/vehiculos/detalles/…"></div>
    <div class="grid2"><div class="field"><label for="av-por">Portal</label>${sel("av-por", [["chileautos", "Chileautos"], ["mercadolibre", "Mercado Libre"], ["yapo", "Yapo"], ["automotora", "Sitio de automotora"], ["otro", "Otro"]], "chileautos")}</div><div class="field"><label for="av-tit">Título</label><input class="input" id="av-tit" placeholder="${esc(d.modelo)} ${esc(d.version || "")} ${d.anio}"></div></div>
    <div class="grid2"><div class="field"><label for="av-ver">Versión según el aviso</label><input class="input" id="av-ver"></div><div class="field"><label for="av-vm">¿Es la misma versión?</label>${sel("av-vm", TAS_VM, "misma")}</div></div>
    <div class="grid2"><div class="field"><label for="av-anio">Año</label><input class="input" id="av-anio" inputmode="numeric"></div><div class="field"><label for="av-km">Km</label><input class="input" id="av-km" inputmode="numeric"></div></div>
    <div class="grid2"><div class="field"><label for="av-pre">Precio publicado *</label>${montoIn("av-pre", null)}</div><div class="field"><label for="av-tr">Transmisión</label><input class="input" id="av-tr" value="${esc(d.transmision || "")}"></div></div>
    <div class="grid2"><div class="field"><label for="av-com">Comuna</label><input class="input" id="av-com"></div><div class="field"><label for="av-reg">Región</label><input class="input" id="av-reg" value="Metropolitana de Santiago"></div></div>
    <div class="grid2"><div class="field"><label for="av-vend">Vendedor</label><input class="input" id="av-vend" placeholder="Nombre automotora o «Particular»"></div><div class="field"><label for="av-vt">Tipo</label>${sel("av-vt", [["automotora", "Automotora"], ["particular", "Particular"], ["rent_a_car", "Rent a car"], ["concesionario", "Concesionario"], ["otro", "Otro"]], "automotora")}</div></div>
    <div class="grid2"><div class="field"><label for="av-ve">Verificación</label>${sel("av-ve", TAS_VERIF, "verificado_activo")}</div><div class="field"><label for="av-co">Condición del precio</label>${sel("av-co", TAS_COND, "contado")}</div></div>
    <div class="field"><label for="av-dif">Diferencia principal (va al informe)</label><input class="input" id="av-dif" placeholder="Un año más nuevo y 20.000 km menos"></div>
    <div class="field"><label for="av-ev">Evidencia (extracto del aviso)</label><textarea class="input" id="av-ev" placeholder="Título, precio, km y versión tal como aparecen"></textarea></div>`,
  async () => {
    const url = $("#av-url").value.trim(), precio = montoVal($("#av-pre"));
    if (!/^https?:\/\//.test(url)) throw new Error("Falta la URL directa del aviso.");
    if (!precio) throw new Error("Falta el precio publicado.");
    const a = { url, portal: $("#av-por").value, titulo: $("#av-tit").value.trim(), version_txt: $("#av-ver").value.trim(), version_match: $("#av-vm").value, anio: $("#av-anio").value.replace(/\D/g, ""),
      km: $("#av-km").value.replace(/\D/g, ""), precio, transmision: $("#av-tr").value.trim(), comuna: $("#av-com").value.trim(), region: $("#av-reg").value.trim(), vendedor_nombre: $("#av-vend").value.trim(),
      vendedor_tipo: $("#av-vt").value, verificacion: $("#av-ve").value, condicion: $("#av-co").value, diferencias: $("#av-dif").value.trim(), evidencia: $("#av-ev").value.trim() };
    await rpc("app_nom_tasacion_avisos", { p_id: d.id, p: { portal: a.portal, consulta: "carga manual", avisos: [a] } });
    toast("Aviso agregado"); after();
  }, "Agregar", true);
}

function modalAjuste(d, after) {
  modal("Ajustar una cifra", `<p class="faint" style="margin:0;font-size:12.5px">Queda registrado quién la cambió, de cuánto a cuánto y por qué. Deja el valor vacío para volver al cálculo.</p>
    <div class="field"><label for="aj-c">Cifra</label><select class="input" id="aj-c">${opt(TAS_CAMPOS_AJ, "precio_publicacion")}</select></div>
    <div class="field"><label for="aj-v">Nuevo valor</label>${montoIn("aj-v", d.precio_publicacion)}</div>
    <div class="field"><label for="aj-m">Motivo *</label><textarea class="input" id="aj-m" placeholder="Ej: dejar la publicación bajo $12 MM por posicionamiento en buscadores"></textarea></div>`,
  async () => { await rpc("app_nom_tasacion_ajustar", { p_id: d.id, p_campo: $("#aj-c").value, p_valor: montoVal($("#aj-v")), p_motivo: $("#aj-m").value.trim() }); toast("Ajuste aplicado"); after(); }, "Aplicar");
  $("#aj-c").onchange = () => { const v = d[$("#aj-c").value]; $("#aj-v").value = v != null ? Number(v).toLocaleString("es-CL") : ""; };
}

function modalAprobar(d, after) {
  const pre = d.tipo === "pre_estimacion", n = (d.informe?.comparables || []).length;
  return modal(`Revisar ${d.folio}`, `<dl class="kv"><dt>Publicación sugerida</dt><dd><b>${clp(d.precio_publicacion)}</b></dd><dt>Venta esperada</dt><dd>${clp(d.cierre_min)} – ${clp(d.cierre_max)}</dd>
      <dt>Comparables válidos</dt><dd>${int(d.estadisticas?.validos ?? 0)} (${n} en el informe)</dd><dt>Confianza</dt><dd>${esc(TAS_CONF[d.confianza]?.[0] || "—")}</dd></dl>
    ${pre ? `<div class="alert">${ico("alert", 16)}<div><b>Es una pre-estimación.</b> Para aprobarla igual, marca la excepción y explica por qué. El informe saldrá rotulado «pre-estimación sujeta a estudio».</div></div>
      <label class="row" style="gap:8px"><input type="checkbox" id="ap-x"> Apruebo con excepción</label>` : ""}
    <div class="field"><label for="ap-c">Comentario${pre ? " *" : ""}</label><textarea class="input" id="ap-c"></textarea></div>
    <p class="faint" style="margin:0;font-size:12.5px">Al aprobar, la tasación queda congelada (cualquier cambio exige nueva versión) y se habilita el link del informe. Nada se envía solo.</p>`,
  async () => { await rpc("app_nom_tasacion_aprobar", { p_id: d.id, p_decision: "aprobada", p_comentario: $("#ap-c").value.trim(), p_excepcion: !!$("#ap-x")?.checked }); toast("Tasación aprobada"); after("informe"); },
  "Aprobar", false, { text: "Rechazar (volver a borrador)", fn: async () => { await rpc("app_nom_tasacion_aprobar", { p_id: d.id, p_decision: "rechazada", p_comentario: $("#ap-c").value.trim() || "Rechazada en revisión" }); toast("Devuelta a borrador"); after(); } });
}

function modalEnviarTasacion(d, after) {
  const url = linkInforme(d.token), nombre = (d.propietario?.nombre || "").split(" ")[0];
  const veh = [d.marca, d.modelo, d.anio].filter(Boolean).join(" ");
  const txt = `Hola${nombre ? " " + nombre : ""}, ya tenemos la evaluación de tu ${veh}. Te comparto el informe NOM con el precio sugerido de publicación y enlaces de autos similares: ${url}\nEs una valorización inicial; la confirmamos cuando revisemos el vehículo.`;
  modal("Enviar informe al cliente", `<p style="margin:0">Versión ${d.version_n} aprobada. El envío queda registrado con aprobador, versión y destinatario.</p>
    <div class="field"><label for="en-url">Link del informe</label><input class="input" id="en-url" value="${esc(url)}" readonly></div>
    <div class="field"><label for="en-tel">WhatsApp del cliente</label><input class="input" id="en-tel" value="${esc(d.propietario?.telefono || "")}" placeholder="+56 9 …"></div>
    <div class="field"><label for="en-txt">Mensaje</label><textarea class="input" id="en-txt" style="min-height:110px">${esc(txt)}</textarea></div>
    <p class="faint" style="margin:0;font-size:12.5px">El envío automático por la API de WhatsApp llega en la Fase 2. Por ahora se abre tu WhatsApp con el mensaje listo.</p>
    <div class="row" style="gap:8px"><button type="button" class="btn" id="en-copy">${ico("link", 15)} Copiar link</button><button type="button" class="btn primary" id="en-wa">${ico("chat", 15)} Abrir WhatsApp y registrar envío</button></div>`, null);
  $("#en-copy").onclick = () => copiar(url, "Link copiado");
  $("#en-wa").onclick = async () => {
    const tel = $("#en-tel").value.trim();
    try { await rpc("app_nom_tasacion_envio", { p_id: d.id, p_canal: "whatsapp_manual", p_destinatario: tel || "sin teléfono", p_detalle: $("#en-txt").value });
      window.open(waLink(tel, $("#en-txt").value) || `https://wa.me/?text=${encodeURIComponent($("#en-txt").value)}`, "_blank", "noopener");
      $("#modal-root").innerHTML = ""; toast("Envío registrado"); after("historial");
    } catch (e) { toast(e.message, true); }
  };
}

async function viewInformePublico(token) {
  document.documentElement.dataset.theme = "light";
  $("#app").innerHTML = `<div class="pub">${loading(6)}</div>`;
  try {
    const { data, error } = await sb.rpc("tasacion_publica", { p_token: token });
    if (error || !data) throw new Error("Este informe no existe o ya no está disponible.");
    document.title = `Informe de tasación ${data.folio} · NOM Nor-Oriente Motors`;
    const veh = [data.vehiculo?.marca, data.vehiculo?.modelo, data.vehiculo?.anio].filter(Boolean).join(" ");
    $("#app").innerHTML = `<div class="pub" style="max-width:none;background:#e9eae8"><div class="pub-bar no-print"><span>Informe ${esc(data.folio)}</span><button class="btn primary sm" id="pp">${ico("dl", 14)} Descargar PDF</button></div>
      ${informeHTML(data, false)}
      <div class="pub-cta no-print" style="max-width:794px;margin:0 auto 30px"><p>¿Te hace sentido avanzar? Coordinemos una visita en Chicureo para revisar el auto, tomar fotografías y definir la estrategia de venta.</p>
        <a class="btn primary" href="${waLink(WA_UNIDAD.nom, `Hola, revisé el informe ${data.folio} de mi ${veh} y quiero avanzar.`)}" target="_blank" rel="noopener">${ico("chat", 15)} Responder por WhatsApp</a></div></div>`;
    $("#pp").onclick = () => window.print();
  } catch (e) { $("#app").innerHTML = `<div class="pub"><div class="card">${empty("doc", "Informe no disponible", esc(e.message))}</div></div>`; }
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
      <div class="actions row" style="gap:8px">${wa ? `<a class="btn primary" href="${wa}" target="_blank" rel="noopener">${ico("chat", 16)} WhatsApp</a>` : ""}<button class="btn" id="f-edit">${ico("note", 16)} Editar</button><button class="btn" id="f-tarea">${ico("tasks", 16)} Nueva tarea</button><button class="btn" id="f-lead">${ico("plus", 16)} Nueva oportunidad</button></div></div>
    <div class="grid-main">
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Oportunidades</h3><span class="badge">${d.oportunidades.length}</span></div>
          <div class="card-b" style="display:grid;gap:12px">${d.oportunidades.length ? d.oportunidades.map(oppCard).join("") : `<div class="muted">Sin oportunidades. Usa «Nueva oportunidad».</div>`}</div></section>
        <section class="card"><div class="card-h"><h3>Bitácora</h3></div>
          <div class="card-b composer">${abiertas.length ? `
            <div class="seg" id="bt-tipo">${[["nota", "note", "Nota"], ["llamada", "call", "Llamada"], ["whatsapp", "chat", "WhatsApp"], ["correo", "mail", "Correo"], ["reunion", "meet", "Reunión"]].map(([k, i, t], n) => `<button type="button" class="${n === 0 ? "on" : ""}" data-v="${k}">${t}</button>`).join("")}</div>
            <textarea class="input" id="bt-nota" placeholder="Qué pasó, con quién hablaste, qué pidió"></textarea>
            <div class="row">${abiertas.length > 1 ? `<div class="field"><label for="bt-op">Oportunidad</label><select class="input" id="bt-op">${abiertas.map((o) => `<option value="${o.id}">${esc(uName(o.unidad))} · ${esc(etapaTxt(o.etapa))}</option>`).join("")}</select></div>` : `<input type="hidden" id="bt-op" value="${abiertas[0].id}">`}
              <div class="field"><label for="bt-res">Resultado</label><select class="input" id="bt-res">${resultadosDe(abiertas[0]?.unidad).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div></div>
            <div class="row"><div class="field"><label for="bt-acc">Próxima acción</label><input class="input" id="bt-acc" placeholder="Ej: enviar cotización, volver a llamar"></div><div class="field" style="flex:0 1 170px"><label for="bt-f">Fecha</label><input class="input" id="bt-f" type="date" value="${diaHabil(2)}"></div></div>
            <div class="row" style="justify-content:space-between;align-items:center"><button type="button" class="btn sm ghost" disabled title="Se activa al habilitar el almacenamiento de archivos">${ico("clip", 15)} Adjuntar</button><button class="btn primary" id="bt-save">Guardar en bitácora</button></div><div class="err" id="bt-err"></div>`
            : `<div class="muted" style="font-size:13px">Para registrar gestiones abre una oportunidad con «Nueva oportunidad».</div>`}
          </div>
          <div class="card-b timeline" style="border-top:1px solid var(--border)">${d.actividades.length ? d.actividades.map((a) => `<div class="tl ${a.tipo === "sistema" ? "sys" : ""}"><span class="ic">${ico(tipoIco[a.tipo] || "dot", 15)}</span><div><div class="t">${a.tipo === "sistema" ? `<span class="muted">${esc(prettySistema(a.nota))}</span>` : `<b style="text-transform:capitalize">${esc(a.tipo === "reunion" ? "reunión" : a.tipo)}</b>${a.resultado ? ` · ${esc(([...RESULTADOS, ...RESULTADOS_B2C].find((r) => r[0] === a.resultado) || [0, a.resultado.replace(/_/g, " ")])[1])}` : ""}${a.nota ? `<div class="muted">${esc(a.nota)}</div>` : ""}`}</div><div class="d">${fechaHora(a.fecha)} · ${esc(a.autor || "")}</div></div></div>`).join("") : '<div class="muted">Sin gestiones todavía.</div>'}</div></section>
      </div>
      <div class="stack">
        <section class="card"><div class="card-h"><h3>Contacto</h3></div><div class="card-b">${d.contactos.length ? d.contactos.map((c) => `<dl class="kv" style="margin-bottom:12px"><dt>Nombre</dt><dd><b>${esc(c.nombre)}</b>${c.decisor ? ' <span class="pill gold">decide</span>' : ""}</dd>${c.cargo ? `<dt>Cargo</dt><dd>${esc(c.cargo)}</dd>` : ""}${c.telefono ? `<dt>Teléfono</dt><dd><a href="tel:${esc(c.telefono)}">${esc(c.telefono)}</a></dd>` : ""}${c.email ? `<dt>Correo</dt><dd>${esc(c.email)}</dd>` : ""}</dl>`).join("") : `<dl class="kv">${tel ? `<dt>Teléfono</dt><dd><a href="tel:${esc(tel)}">${esc(tel)}</a></dd>` : ""}${e.email ? `<dt>Correo</dt><dd>${esc(e.email)}</dd>` : ""}${!tel && !e.email ? '<dd class="muted">Sin datos de contacto.</dd>' : ""}</dl>`}</div></section>
        ${d.vehiculos?.length ? `<section class="card"><div class="card-h"><h3>Vehículos</h3><span class="badge">${d.vehiculos.length}</span></div><div class="card-b" style="display:grid;gap:10px">${d.vehiculos.map((v) => `<div><b>${esc([v.marca, v.modelo].filter(Boolean).join(" ") || "Vehículo")}</b> ${v.anio ? `<span class="muted">${v.anio}</span>` : ""}<div class="muted" style="font-size:12.5px">${[v.patente, v.km ? int(v.km) + " km" : "", v.modalidad, v.estado].filter(Boolean).map(esc).join(" · ")}</div></div>`).join("")}</div></section>` : ""}
        ${d.tareas?.length ? `<section class="card"><div class="card-h"><h3>Tareas pendientes</h3><span class="badge">${d.tareas.length}</span></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${d.tareas.map((t) => `<div class="row" style="justify-content:space-between"><span>${esc(t.titulo)}</span><span class="pill ${t.vence && t.vence < hoyISO() ? "bad" : ""}">${fecha(t.vence)}</span></div>`).join("")}</div></section>` : ""}
        ${d.cotizaciones?.length ? `<section class="card"><div class="card-h"><h3>Cotizaciones</h3></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${d.cotizaciones.map((q) => `<a class="row" href="#/cot/${q.id}" style="justify-content:space-between"><span>${esc(q.numero || "s/n")} · ${fecha(q.fecha)}</span><span>${clp(q.neto)} neto <span class="pill ${COT_EST[q.estado] || ""}">${esc(q.estado)}</span></span></a>`).join("")}</div></section>` : ""}
        ${d.contratos.length ? `<section class="card"><div class="card-h"><h3>Contrato BlackGPS</h3></div><div class="card-b">${d.contratos.map((g) => `<dl class="kv"><dt>Estado</dt><dd><span class="pill ${g.estado === "activo" ? "ok" : "warn"}">${esc(g.estado)}</span></dd><dt>Equipos</dt><dd>${int(g.equipos)}</dd>${g.valor_mensual ? `<dt>Mensual</dt><dd>${clp(g.valor_mensual)}</dd>` : ""}${g.plan ? `<dt>Plan</dt><dd>${esc(g.plan)}</dd>` : ""}${g.inicio ? `<dt>Desde</dt><dd>${fecha(g.inicio)}</dd>` : ""}</dl>`).join("")}</div></section>` : ""}
        ${d.ventas ? `<section class="card"><div class="card-h"><h3>Ventas</h3><span class="badge">${d.ventas.length}</span></div>${d.ventas.length ? `<div class="card-b" style="display:grid;gap:8px;font-size:13px">${d.ventas.map((v) => `<div class="venta-row"><div class="row" style="justify-content:space-between"><span>${fecha(v.fecha)} · ${esc(v.descripcion || uName(v.unidad))}</span><span class="num"><b>${clp(v.monto)}</b> <span class="pill ${v.cobro === "cobrado" ? "ok" : "warn"}">${v.cobro === "cobrado" ? "cobrada" : esc(v.cobro)}</span></span></div>
          ${v.id ? `<div class="row faint" style="justify-content:space-between;font-size:12px;align-items:center"><span>${v.n_costos ? `Costos ${clp(v.costos)} · margen <b style="color:var(--fg)">${clp(v.monto - v.costos)}</b> (${v.monto ? Math.round(((v.monto - v.costos) / v.monto) * 100) : 0}%)` : "Sin costos ligados: el margen aparece al 100%"}</span><button class="btn ghost sm" data-costo="${v.id}">${ico("plus", 13)} Costo</button></div>` : ""}</div>`).join("")}</div>` : '<div class="card-b muted">Sin ventas registradas.</div>'}</section>` : ""}
        ${d.analisis.length ? `<section class="card"><div class="card-h"><h3>Análisis</h3></div><div class="card-b" style="display:grid;gap:12px">${d.analisis.map((a) => `<div style="display:grid;gap:6px"><div class="row" style="gap:6px">${unidadPill(a.unidad)}${a.pilar ? `<span class="pill gold">${esc(a.pilar)}</span>` : ""}${a.score != null ? `<span class="pill">calce ${a.score}</span>` : ""}<span class="faint" style="font-size:12px">${fecha(a.fecha)}</span></div>${a.resumen ? `<div style="font-size:13px">${esc(a.resumen)}</div>` : ""}</div>`).join("")}</div></section>` : ""}
      </div>
    </div>`;
    const again = () => viewCliente(id);
    $("#f-edit").onclick = () => modalFicha(e, d.contactos[0], again);
    $$("[data-editop]").forEach((b) => b.onclick = () => modalOportunidad(d.oportunidades.find((o) => o.id === b.dataset.editop), again));
    $("#f-tarea").onclick = () => modalTarea(again, { empresa_id: e.id, unidad: abiertas[0]?.unidad });
    $("#f-lead").onclick = () => modalLead({ nombre: c0?.nombre || (persona ? e.nombre : ""), empresa: persona ? "" : e.nombre, rut: e.rut, telefono: tel, email: c0?.email || e.email });
    $$("[data-ganar]").forEach((b) => b.onclick = () => { const o = d.oportunidades.find((x) => x.id === b.dataset.ganar) || {}; modalCerrar(b.dataset.ganar, e.nombre, "ganada", again, { unidad: o.unidad, monto: o.monto, titulo: o.titulo }); });
    $$("[data-costo]").forEach((b) => b.onclick = () => { const v = d.ventas.find((x) => x.id === b.dataset.costo); modalFin("costos", null, again, { venta_id: v.id, unidad: v.unidad, tipo: "directo", venta_txt: `${fecha(v.fecha)} · ${v.descripcion || uName(v.unidad)} · ${clp(v.monto)}` }); });
    $$("[data-perder]").forEach((b) => b.onclick = () => modalCerrar(b.dataset.perder, e.nombre, "perdida", again));
    $$("[data-asisma]").forEach((b) => b.onclick = () => modalAsisma(b.dataset.asisma));
    $$("[data-cotizar]").forEach((b) => b.onclick = () => modalCotizador({ oportunidad_id: b.dataset.cotizar, unidad: b.dataset.u, cliente: e.nombre, after: again }));
    $$("[data-traspaso]").forEach((b) => b.onclick = () => modalTraspaso(b.dataset.traspaso, again));
    $$("select[data-etapa]").forEach((s) => s.onchange = async () => {
      try { await rpc("app_mover_etapa", { p: { oportunidad_id: s.dataset.etapa, etapa: s.value, proxima_fecha: s.dataset.fecha || diaHabil(2) } }); toast("Etapa actualizada"); again(); }
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
    <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">${abierta && COT_UNIDADES.includes(o.unidad) ? `<button class="btn sm primary" data-cotizar="${o.id}" data-u="${o.unidad}">${ico("doc", 14)} Cotizar</button>` : ""}${abierta && o.unidad === "nom" && o.flujo === "consignante" && ["calificando", "revision_agendada", "revisado"].includes(o.etapa) ? `<a class="btn sm" href="${TOOLS.ipc}" target="_blank" rel="noopener">${ico("link", 14)} Inspección IPC</a>` : ""}${abierta && o.unidad === "nom" && o.flujo === "consignante" ? `<a class="btn sm primary" href="#/tasaciones?op=${o.id}">${ico("car", 14)} Tasar</a>` : ""}${abierta && o.unidad === "blackgps" && ["reunion_por_agendar", "en_prospeccion"].includes(o.etapa) ? `<button class="btn sm" data-traspaso="${o.id}">Pasar a Asisma</button>` : ""}<button class="btn sm ghost" data-editop="${o.id}">Editar</button>${abierta ? `<button class="btn sm" data-ganar="${o.id}">${ico("trophy", 14)} Ganada</button><button class="btn sm ghost danger" data-perder="${o.id}">Perdida</button>` : ""}${abierta && ["blackgps", "somosb2b"].includes(o.unidad) ? `<button class="btn sm" data-asisma="${o.id}">Ficha Asisma</button>` : ""}</span></div>
    ${idx >= 0 ? `<div class="steps" style="--c:${UNIDADES[o.unidad]?.c}" title="${esc(et.map(etapaTxt).join(" → "))}">${et.map((_, i) => `<i class="${i <= idx && abierta ? "done" : o.estado === "ganada" ? "done" : ""}"></i>`).join("")}</div>` : ""}
    <div class="muted" style="font-size:13px">${abierta ? `${o.proxima_fecha ? `<b style="color:${o.proxima_fecha < hoyISO() ? "var(--bad)" : "var(--fg)"}">${fecha(o.proxima_fecha)}</b> · ` : ""}${esc(o.proxima_accion || "Sin próxima acción definida")}` : esc([mot, o.motivo].filter(Boolean).join(" · "))}${o.monto ? ` · ${clp(o.monto)}` : ""}</div></div>`;
}

/* ---------- herramientas externas (Netlify) ---------- */
const TOOLS = { cotizador: "https://cotizador-carclass.netlify.app", ipc: "https://nom-inspeccion.netlify.app" };
const WA_UNIDAD = { carwash: "+56946196226", carclass: "+56986704745", nom: "+56986704745", blackgps: "+56986704745" };
async function viewHerramientas() {
  setActive("herramientas");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Herramientas</h1><p>Las herramientas que ya usas, enlazadas a Core. Se abren en una pestaña nueva.</p></div></div>
    <div class="grid2">
      <section class="card tool" style="--c:var(--u-carclass)"><div class="card-b" style="display:grid;gap:10px"><div class="row" style="align-items:center;gap:10px">${unidadPill("carclass")}<h3>Cotizador Carclass</h3></div>
        <p class="muted" style="margin:0;font-size:13px">Documentos formales del servicio: cotización, ingreso a taller y acta de entrega en PDF. Para cotizar y medir si el cliente abrió la cotización, usa <a href="#/cotizaciones">Cotizaciones</a> de Core, que guarda todo en la ficha.</p>
        <a class="btn primary" href="${TOOLS.cotizador}" target="_blank" rel="noopener" style="justify-self:start">${ico("link", 15)} Abrir cotizador</a></div></section>
      <section class="card tool" style="--c:var(--u-nom)"><div class="card-b" style="display:grid;gap:10px"><div class="row" style="align-items:center;gap:10px">${unidadPill("nom")}<h3>Inspección IPC</h3></div>
        <p class="muted" style="margin:0;font-size:13px">Revisión de 4 capas con puntaje y precio máximo sugerido. Cada inspección se guarda en la base del grupo y aparece sola en Vehículos y abajo.</p>
        <a class="btn primary" href="${TOOLS.ipc}" target="_blank" rel="noopener" style="justify-self:start">${ico("link", 15)} Nueva inspección</a></div></section>
    </div>
    <section class="card"><div class="card-h"><h3>Inspecciones IPC por mes</h3></div><div id="ins-mes">${loading(2)}</div></section>
    <section class="card"><div class="card-h"><h3>Histórico de inspecciones</h3><span class="badge" id="ins-n"></span><div class="row" style="margin-left:auto;gap:8px"><input class="input" id="ins-q" type="search" placeholder="Folio, patente, marca, cliente…" style="width:240px"><select class="input" id="ins-v" style="width:auto"><option value="">Todos los veredictos</option></select></div></div><div id="ins">${loading(4)}</div></section>`;
  let D;
  const pintar = () => {
    const q = $("#ins-q").value.trim().toLowerCase(), v = $("#ins-v").value;
    const l = D.filas.filter((i) => (!v || (i.veredicto || "sin veredicto") === v) && (!q || [i.folio, i.patente, i.auto, i.cliente, i.tecnico].join(" ").toLowerCase().includes(q)));
    $("#ins-n").textContent = l.length || "";
    $("#ins").innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl click"><thead><tr><th>Fecha</th><th>Folio</th><th>Vehículo</th><th>Cliente</th><th class="num">Puntaje</th><th>Veredicto</th><th class="num">Precio máx. sugerido</th>${ME.ve_finanzas ? '<th class="num">Servicio</th>' : ""}</tr></thead><tbody>
      ${l.map((i) => `<tr data-ins="${esc(i.id)}" tabindex="0"><td>${fecha(i.fecha)}</td><td class="sub">${esc(i.folio || "")}</td><td><div class="name">${esc(i.auto || "—")}</div><div class="sub">${esc(i.patente || "")}${i.en_stock ? " · en stock" : ""}${i.n_fotos ? ` · ${int(i.n_fotos)} fotos` : ""}</div></td><td>${esc(i.cliente || "—")}${i.telefono ? `<div class="sub">${esc(i.telefono)}</div>` : ""}</td>
        <td class="num">${i.score != null ? int(i.score) + "%" : "—"}<div class="sub">${i.completitud != null ? int(i.completitud) + "% completa" : ""}</div></td><td><span class="pill ${insTono(i.veredicto)}">${esc(i.veredicto || "sin veredicto")}</span>${i.criticos ? `<div class="sub">${int(i.criticos)} críticos</div>` : ""}</td>
        <td class="num">${clp(i.precio_max_sugerido)}</td>${ME.ve_finanzas ? `<td class="num">${clp(i.valor_servicio)}<div class="sub">${esc(i.estado_pago || "")}</div></td>` : ""}</tr>`).join("")}</tbody></table></div>` : `<div class="card-b">${empty("car", D.filas.length ? "Ninguna inspección coincide con el filtro" : "Sin inspecciones todavía")}</div>`;
    $$("[data-ins]").forEach((r) => { r.onclick = () => modalInspeccion(r.dataset.ins); r.onkeydown = (e) => e.key === "Enter" && modalInspeccion(r.dataset.ins); });
  };
  try {
    D = await rpc("app_inspecciones", { p_limite: 500 });
    const fin = ME.ve_finanzas;
    $("#ins-mes").innerHTML = D.mensual.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mes</th><th class="num">Inspecciones</th><th class="num">Apto</th><th class="num">Condicionado</th><th class="num">Rechazado</th><th class="num">Índice prom.</th><th class="num">Ahorro prom. detectado</th>${fin ? '<th class="num">Pagadas</th><th class="num">Cobrado</th><th class="num">Por cobrar</th>' : ""}</tr></thead><tbody>
      ${D.mensual.map((m) => `<tr><td>${esc(mesTxt(m.mes))}</td><td class="num">${int(m.inspecciones)}</td><td class="num">${int(m.apto)}</td><td class="num">${int(m.condicionado)}</td><td class="num">${int(m.rechazado)}</td><td class="num">${m.indice_promedio != null ? int(m.indice_promedio) + "%" : "—"}</td><td class="num">${clp(m.ahorro_promedio)}</td>${fin ? `<td class="num">${int(m.pagadas)}</td><td class="num">${clp(m.ingreso_cobrado)}</td><td class="num">${clp(m.ingreso_pendiente)}</td>` : ""}</tr>`).join("")}</tbody></table></div>
      ${fin ? `<p class="muted card-b" style="margin:0;font-size:12px">Las inspecciones marcadas como pagadas en la herramienta entran solas a Ventas NOM (modalidad «Inspecciones IPC»), una vez por hora.</p>` : ""}` : `<div class="card-b">${empty("chart", "Sin datos mensuales")}</div>`;
    const vs = [...new Set(D.filas.map((i) => i.veredicto || "sin veredicto"))];
    $("#ins-v").insertAdjacentHTML("beforeend", vs.map((v) => `<option>${esc(v)}</option>`).join(""));
    $("#ins-q").oninput = pintar; $("#ins-v").onchange = pintar;
    pintar();
  } catch (e) { $("#ins").innerHTML = `<div class="card-b err">${esc(e.message)}</div>`; $("#ins-mes").innerHTML = ""; }
}
const insTono = (v) => !v ? "" : /^APTO/i.test(v) ? "ok" : /RECHAZ|NO APTO/i.test(v) ? "bad" : "warn";
const mesTxt = (m) => { const [y, mm] = String(m).split("-"); return ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][+mm - 1] + " " + y; };
const INS_E = { ok: ["Bien", "ok"], obs: ["Observado", "warn"], na: ["No aplica", ""], "": ["Sin revisar", ""] };
async function modalInspeccion(id) {
  const root = modal("Inspección IPC", loading(4), null, "", true);
  let d;
  try { d = await rpc("app_inspeccion", { p_id: id }); } catch (e) { $(".modal-b", root).innerHTML = `<div class="err">${esc(e.message)}</div>`; return; }
  if (!d) { $(".modal-b", root).innerHTML = `<div class="err">No se encontró la inspección.</div>`; return; }
  $(".modal-h h3", root).textContent = `Inspección ${d.folio || ""}`;
  const m = d.meta || {}, it = d.items || {}, fpi = d.fotos_por_item || {};
  const grupos = {};
  Object.entries(it).forEach(([k, v]) => { const [c, n] = k.replace(/^c/, "").split("_").map(Number); (grupos[c] ||= []).push({ k, i: n, e: v.e || "" }); });
  const cuenta = (e) => Object.values(it).filter((v) => (v.e || "") === e).length;
  const kv = (t, v) => v == null || v === "" ? "" : `<div><div class="sub">${esc(t)}</div><div>${v}</div></div>`;
  const det = Object.keys(grupos).sort((a, b) => a - b).map((c) => {
    const l = grupos[c].sort((a, b) => a.i - b.i), obs = l.filter((x) => x.e === "obs");
    return `<details class="ins-capa" ${obs.length ? "open" : ""}><summary><b>Sección ${c}</b> <span class="sub">${l.length} puntos · ${obs.length} observado${obs.length === 1 ? "" : "s"}${l.some((x) => fpi[x.k]) ? " · con fotos" : ""}</span></summary>
      <table class="tbl"><tbody>${l.map((x) => `<tr class="${x.e === "obs" ? "" : "ins-ok"}"><td class="sub" style="width:56px">${c}.${x.i + 1}</td><td style="width:120px"><span class="pill ${INS_E[x.e || ""]?.[1] || ""}">${INS_E[x.e || ""]?.[0] || esc(x.e)}</span></td><td>${esc(it[x.k].n || "")}${it[x.k].val ? ` <span class="sub">· ${esc(it[x.k].val)}</span>` : ""}${fpi[x.k] ? ` <span class="sub">· ${int(fpi[x.k])} foto${fpi[x.k] > 1 ? "s" : ""}</span>` : ""}</td><td class="num" style="width:110px">${it[x.k].cost ? clp(it[x.k].cost) : ""}</td></tr>`).join("")}</tbody></table></details>`;
  }).join("");
  const nf = Object.values(fpi).reduce((a, b) => a + b, 0);
  $(".modal-b", root).innerHTML = `<div class="ins-det">
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><h3 style="margin:0">${esc(d.auto || "Vehículo")}</h3>${d.patente ? `<span class="badge">${esc(d.patente)}</span>` : ""}<span class="pill ${insTono(d.veredicto)}">${esc(d.veredicto || "sin veredicto")}</span></div>
    <div class="kpis" style="margin:12px 0">
      <div class="kpi"><div class="l">Puntaje</div><div class="v" style="font-size:22px">${d.score != null ? int(d.score) + "%" : "—"}</div></div>
      <div class="kpi"><div class="l">Completitud</div><div class="v" style="font-size:22px">${d.completitud != null ? int(d.completitud) + "%" : "—"}</div></div>
      <div class="kpi"><div class="l">Observados / críticos</div><div class="v" style="font-size:22px">${int(cuenta("obs"))} / ${int(d.criticos || 0)}</div></div>
      <div class="kpi"><div class="l">Costo de regularizar</div><div class="v" style="font-size:22px">${clp(d.costo_regularizacion)}</div></div>
    </div>
    <div class="ins-grid">
      ${kv("Fecha", fecha(d.fecha))}${kv("Técnico", esc(d.tecnico))}${kv("Lugar", esc(m.lugar))}${kv("Origen", esc(d.origen))}
      ${kv("Cliente", esc(d.cliente))}${kv("Teléfono", esc(d.telefono))}${kv("Vendedor", esc([m.vendedor, m.vendedorTel].filter(Boolean).join(" · ")))}${kv("Versión", esc(m.version))}
      ${kv("Kilometraje", d.km != null ? int(d.km) + " km" : esc(m.km))}${kv("Color", esc(m.color))}${kv("Combustible", esc(m.combustible))}${kv("Transmisión", esc(m.transmision))}${kv("VIN", esc(d.vin || m.vin))}
      ${kv("Precio pedido", d.precio_pedido != null ? clp(d.precio_pedido) : "")}${kv("Precio de mercado", d.precio_mercado != null ? clp(d.precio_mercado) : "")}${kv("Precio máx. sugerido", d.precio_max_sugerido != null ? `<b>${clp(d.precio_max_sugerido)}</b>` : "")}${kv("Liquidez", esc(d.mk?.liquidez))}
      ${ME.ve_finanzas ? kv("Servicio", d.valor_servicio != null ? `${clp(d.valor_servicio)} · ${esc(d.estado_pago || "")}` : "") : ""}
    </div>
    ${typeof d.rec === "string" && d.rec.trim() ? `<div class="card-b" style="background:var(--surface-2);border-radius:10px;margin-top:12px"><div class="sub">Recomendación</div>${esc(d.rec)}</div>` : ""}
    ${d.mk?.obsNeg ? `<div class="card-b" style="background:var(--surface-2);border-radius:10px;margin-top:8px"><div class="sub">Observaciones de negociación</div>${esc(d.mk.obsNeg)}</div>` : ""}
    <div class="row" style="justify-content:space-between;align-items:center;margin:16px 0 6px"><h4 style="margin:0">Puntos revisados</h4><label class="sub"><input type="checkbox" id="ins-todo"> Mostrar también los que están bien</label></div>
    <div id="ins-capas" class="solo-obs">${det || `<p class="muted">La inspección no tiene puntos registrados (quedó incompleta).</p>`}</div>
    ${nf ? `<div style="margin-top:14px"><button type="button" class="btn" id="ins-fotos">Ver ${int(nf)} foto${nf > 1 ? "s" : ""}</button><div id="ins-gal" class="ins-gal"></div></div>` : ""}
  </div>`;
  $("#ins-todo", root).onchange = (e) => $("#ins-capas", root).classList.toggle("solo-obs", !e.target.checked);
  const bf = $("#ins-fotos", root);
  if (bf) bf.onclick = async () => {
    bf.disabled = true; bf.textContent = "Cargando fotos…";
    try {
      const f = await rpc("app_inspeccion_fotos", { p_id: id });
      const lista = Object.entries(f || {}).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).filter((u) => typeof u === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(u)).map((u) => [k, u]));
      $("#ins-gal", root).innerHTML = lista.map(([k, u]) => { const [c, n] = k.replace(/^c/, "").split("_").map(Number); return `<figure><a href="${u}" target="_blank" rel="noopener"><img src="${u}" alt="Foto punto ${c}.${n + 1}" loading="lazy"></a><figcaption>${c}.${n + 1} ${esc(it[k]?.n || "")}</figcaption></figure>`; }).join("");
      bf.remove();
    } catch (e) { bf.disabled = false; bf.textContent = "Reintentar fotos"; toast(e.message, true); }
  };
}

/* ---------- vehículos ---------- */
async function viewVehiculos(params) {
  setActive("vehiculos");
  const f = params.get("f") || (UNI === "carclass" ? "clientes" : "stock");
  const P = $("#page");
  P.innerHTML = `<div class="page-head"><div><h1>Vehículos</h1><p>Stock de NOM con su rotación e inspección, y autos de clientes de Carclass.</p></div><div class="actions"><a class="btn" href="#/herramientas">Ver inspecciones</a><a class="btn primary" href="${TOOLS.ipc}" target="_blank" rel="noopener">${ico("link", 15)} Nueva inspección IPC</a></div></div>
    <div class="tabs">${[["stock", "Stock NOM"], ["clientes", "Autos de clientes"], ["todos", "Todos"]].map(([k, t]) => `<a href="#/vehiculos?f=${k}" class="${f === k ? "on" : ""}">${t}</a>`).join("")}</div><div id="vl">${loading(5)}</div>`;
  try {
    let v = await rpc("app_vehiculos");
    if (f === "stock") v = v.filter((x) => ["consignacion", "compra_directa"].includes(x.modalidad) && !["retirado", "vendido"].includes(x.estado));
    if (f === "clientes") v = v.filter((x) => x.modalidad === "cliente");
    const est = { disponible: "ok", publicado: "ok", evaluacion: "info", reservado: "gold", vendido: "", retirado: "" };
    const stockMode = f !== "clientes";
    $("#vl").innerHTML = `<section class="card">${v.length ? `<div class="tbl-wrap"><table class="tbl tbl-cards"><thead><tr><th>Vehículo</th><th>Patente</th><th class="num">Km</th><th>Modalidad</th><th>Dueño</th>${stockMode ? `<th class="num">Publicado</th>${ME.rol === "dueno" ? '<th class="num">Piso (interno)</th>' : ""}<th class="num">Días</th><th>Inspección</th>` : ""}<th>Estado</th></tr></thead><tbody>
      ${v.map((x) => { const vivo = !["vendido", "retirado"].includes(x.estado); return `<tr class="${x.dueno_id ? "click" : ""}" data-emp="${x.dueno_id || ""}"><td class="name" data-l="Vehículo">${esc([x.marca, x.modelo].filter(Boolean).join(" ") || "—")}${x.anio ? ` <span class="faint">${x.anio}</span>` : ""}${x.version ? `<div class="sub faint ell" title="${esc(x.version)}">${esc(x.version)}</div>` : ""}</td><td data-l="Patente">${esc(x.patente || "—")}</td><td class="num" data-l="Km">${x.km ? int(x.km) : "—"}</td><td data-l="Modalidad">${x.modalidad === "compra_directa" ? "Propio" : x.modalidad === "consignacion" ? `Consignado${x.comision_pct ? " " + String(x.comision_pct).replace(".", ",") + "%" : ""}` : "Cliente"}</td><td data-l="Dueño">${esc(x.dueno || "—")}</td>
        ${stockMode ? `<td class="num" data-l="Publicado">${x.precio_publicado ? clp(x.precio_publicado) : '<span class="faint">—</span>'}</td>${ME.rol === "dueno" ? `<td class="num faint" data-l="Piso">${x.precio_minimo ? clp(x.precio_minimo) : "—"}</td>` : ""}<td class="num" data-l="Días">${x.dias != null ? `<span class="pill ${vivo && x.dias > 45 ? "bad" : vivo && x.dias > 30 ? "warn" : ""}">${int(x.dias)}</span>` : "—"}</td><td data-l="Inspección">${x.inspeccion ? `<span class="pill ${x.inspeccion.veredicto === "APTO" ? "ok" : "warn"}" title="${esc(x.inspeccion.folio || "")}">${esc(x.inspeccion.veredicto || "")} · ${int(x.inspeccion.score)}%</span>` : x.modalidad !== "cliente" ? `<a class="pill warn" href="${TOOLS.ipc}" target="_blank" rel="noopener" onclick="event.stopPropagation()">inspeccionar</a>` : ""}</td>` : ""}
        <td data-l="Estado"><span class="pill ${est[x.estado] ?? ""}">${esc(x.estado || "—")}</span></td></tr>`; }).join("")}
      </tbody></table></div>` : empty("car", "Sin vehículos en esta vista")}</section>
      ${stockMode ? '<p class="faint" style="font-size:12px;margin:0">Rotación: tope de 45 días. El precio piso es interno y nunca se comparte con compradores. La inspección se lee de la herramienta IPC de NOM.</p>' : ""}`;
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
    let ts = (await rpc("app_tareas", { p_estado: f === "hechas" ? "hecha" : "pendiente,en_curso" })).filter((t) => enLinea(t.unidad));
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

/* ---------- finanzas · control financiero del grupo (solo dueño o rol finanzas) ---------- */
const FIN_TABS = [["finanzas", "Resultados"], ["flujo", "Flujo de caja"], ["registro", "Registro"], ["importar", "Importar"]];
const FIN_U = ["carclass", "nom", "carwash", "blackgps", "somosb2b", "grupo"];
const MODALIDADES = [["servicio", "Servicio"], ["licencia", "Mensualidad"], ["instalacion", "Instalación"], ["hardware", "Equipos"], ["consignacion", "Comisión"], ["compraventa", "Compraventa"], ["broker", "Servicio broker"], ["otro", "Otro"]];
// Tipos y categorías iguales a los de la base (fin.costos.tipo: directo, fijo, variable)
const TIPO_COSTO = [["fijo", "Gasto fijo"], ["variable", "Gasto variable"], ["directo", "Costo directo de venta"]];
const CAT_COSTO = { directo: ["partner", "insumos", "personal", "compra_equipos", "hardware_franquicia", "licencia_franquicia", "compra_vehiculo", "transferencia", "stock", "retiro_domicilio", "reparacion", "otro"],
  fijo: ["arriendo", "software", "telefono", "internet", "web_hosting", "aceleradora", "capacitacion", "sueldos_honorarios", "contabilidad", "comisiones_bancarias", "seguros", "servicios_basicos", "patente", "otro"],
  variable: ["publicidad", "transporte", "comisiones_venta", "combustible", "otro"] };
const CAT_MOV = { ingreso: ["aporte_capital", "prestamo", "devolucion", "otro"], egreso: ["retiro_dueno", "impuestos", "compra_stock", "pago_prestamo", "inversion", "otro"] };
const tipoCostoTxt = (t) => (TIPO_COSTO.find((x) => x[0] === t) || [0, t === "operacional" ? "Gasto fijo" : t || "—"])[1];
const catTxt = (c) => (c || "otro").replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase());
const FIN_PRESETS = [["anio", "Este año"], ["12m", "Últimos 12 meses"], ["sem", "Semestre actual"], ["mes", "Mes actual"], ["anio_ant", "Año anterior"]];
function finRango(k) {
  const h = new Date(), y = h.getFullYear(), m = h.getMonth();
  return { anio: [`${y}-01-01`, `${y}-12-31`], "12m": [iso(new Date(y, m - 11, 1)), iso(new Date(y, m + 1, 0))], sem: m < 6 ? [`${y}-01-01`, `${y}-06-30`] : [`${y}-07-01`, `${y}-12-31`],
    mes: [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))], anio_ant: [`${y - 1}-01-01`, `${y - 1}-12-31`] }[k] || [`${y}-01-01`, `${y}-12-31`];
}
function finCtx(params, ruta) {
  const pre = params.get("r") || (params.get("desde") ? "" : "anio");
  const [d0, d1] = pre ? finRango(pre) : [params.get("desde"), params.get("hasta")];
  const per = params.get("per") || (pre === "mes" ? "mes" : "mes"), u = params.get("u") || "", neto = params.get("iva") !== "1";
  const link = (o) => { const p = new URLSearchParams({ r: pre, desde: pre ? "" : d0, hasta: pre ? "" : d1, per, u, iva: neto ? "" : "1", ...o }); [...p.keys()].forEach((k) => !p.get(k) && p.delete(k)); return `#/${ruta}?` + p; };
  return { pre, d0, d1, per, u, neto, link };
}
function finHead(ruta, titulo, sub, ctx, opts = {}) {
  return `<div class="page-head no-print"><div><h1>${titulo}</h1><p>${sub}</p></div><div class="actions">${opts.actions || ""}</div></div>
    <div class="tabs no-print">${FIN_TABS.map(([r, t]) => `<a href="#/${r}" class="${r === ruta ? "on" : ""}">${t}</a>`).join("")}</div>
    ${ctx ? `<div class="filters no-print"><div class="chips">${FIN_PRESETS.map(([k, t]) => `<a class="chip ${ctx.pre === k ? "on" : ""}" href="${ctx.link({ r: k, desde: "", hasta: "" })}">${t}</a>`).join("")}</div>
      <form class="daterange">${ico("cal", 15)}<input type="date" id="fr-d" value="${ctx.d0}" aria-label="Desde"><span class="faint">→</span><input type="date" id="fr-h" value="${ctx.d1}" aria-label="Hasta"></form>
      ${opts.per !== false ? `<select class="input" id="fr-per" style="width:auto;height:38px" aria-label="Agrupar por">${[["mes", "Por mes"], ["trimestre", "Por trimestre"], ["semestre", "Por semestre"], ["anio", "Por año"]].map(([k, t]) => `<option value="${k}" ${ctx.per === k ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}
      ${opts.unidad !== false ? `<select class="input" id="fr-u" style="width:auto;height:38px" aria-label="Unidad"><option value="">Todo el grupo</option>${FIN_U.map((x) => `<option value="${x}" ${ctx.u === x ? "selected" : ""}>${uName(x)}</option>`).join("")}</select>` : ""}
      ${opts.iva !== false ? `<div class="seg" id="fr-iva"><button type="button" class="${ctx.neto ? "on" : ""}" data-v="">Neto</button><button type="button" class="${ctx.neto ? "" : "on"}" data-v="1">Con IVA</button></div>` : ""}</div>` : ""}`;
}
function bindFin(ctx) {
  if (!ctx) return;
  const go = (o) => (location.hash = ctx.link(o));
  if ($("#fr-d")) { $("#fr-d").onchange = () => go({ r: "", desde: $("#fr-d").value, hasta: $("#fr-h").value }); $("#fr-h").onchange = $("#fr-d").onchange; }
  if ($("#fr-per")) $("#fr-per").onchange = () => go({ per: $("#fr-per").value });
  if ($("#fr-u")) $("#fr-u").onchange = () => go({ u: $("#fr-u").value });
  $$("#fr-iva button").forEach((b) => b.onclick = () => go({ iva: b.dataset.v }));
}
const perTxt = (p) => /^\d{4}-\d{2}$/.test(p) ? new Date(p + "-15").toLocaleDateString("es-CL", { month: "short", year: "2-digit" }).replace(".", "") : p.replace("-S", " · S").replace("-T", " · T");
const sinAcceso = () => `<div class="card">${empty("chart", "Sin acceso", "Finanzas es solo para el dueño y el rol de finanzas.")}</div>`;
const pct = (a, b) => b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("es-CL")}%` : "—";

async function viewFinanzas(params) {
  setActive("finanzas");
  const P = $("#page");
  if (!ME.ve_finanzas) { P.innerHTML = sinAcceso(); return; }
  const ctx = finCtx(params, "finanzas");
  P.innerHTML = finHead("finanzas", "Estado de resultados", `Ingresos, costos directos, gastos y resultado del grupo y de cada unidad. ${ctx.neto ? "Montos netos, sin IVA." : "Montos con IVA."}`, ctx,
    { actions: `<button class="btn" id="fx-csv">${ico("dl", 16)} Exportar CSV</button><button class="btn primary" id="fx-pdf">${ico("doc", 16)} PDF</button>` }) + `<div id="fin">${loading(8)}</div>`;
  bindFin(ctx);
  try {
    const d = await rpc("app_eerr", { p_desde: ctx.d0, p_hasta: ctx.d1, p_periodo: ctx.per, p_unidad: ctx.u || null, p_neto: ctx.neto });
    const pers = d.periodos, F = d.filas;
    const sum = (f) => { const o = {}; pers.forEach((p) => (o[p] = 0)); F.filter(f).forEach((r) => (o[r.periodo] = (o[r.periodo] || 0) + Number(r.monto || 0))); o._t = pers.reduce((a, p) => a + o[p], 0); return o; };
    const resta = (a, b) => { const o = {}; [...pers, "_t"].forEach((p) => (o[p] = (a[p] || 0) - (b[p] || 0))); return o; };
    const ing = sum((r) => r.seccion === "ingresos"), cos = sum((r) => r.seccion === "costos"), gas = sum((r) => r.seccion === "gastos");
    const mb = resta(ing, cos), res = resta(mb, gas);
    const rows = [];
    const sec = (titulo) => rows.push({ t: titulo, k: "sec" });
    const grupo = (seccion) => {
      const us = [...new Set(F.filter((r) => r.seccion === seccion).map((r) => r.unidad))].sort((a, b) => FIN_U.indexOf(a) - FIN_U.indexOf(b));
      us.forEach((u) => {
        rows.push({ t: uName(u), v: sum((r) => r.seccion === seccion && r.unidad === u), k: "sub", u });
        [...new Set(F.filter((r) => r.seccion === seccion && r.unidad === u).map((r) => r.concepto))].sort().forEach((c) => rows.push({ t: c, v: sum((r) => r.seccion === seccion && r.unidad === u && r.concepto === c), k: "det" }));
      });
    };
    sec("Ingresos"); grupo("ingresos"); rows.push({ t: "Total ingresos", v: ing, k: "tot" });
    sec("Costos directos"); grupo("costos"); rows.push({ t: "Total costos directos", v: cos, k: "tot" });
    rows.push({ t: "Margen bruto", v: mb, k: "big" }); rows.push({ t: "Margen bruto %", v: mb, base: ing, k: "pct" });
    sec("Gastos operacionales"); grupo("gastos"); rows.push({ t: "Total gastos operacionales", v: gas, k: "tot" });
    rows.push({ t: "Resultado operacional", v: res, k: "big" }); rows.push({ t: "Margen operacional %", v: res, base: ing, k: "pct" });
    const cell = (r, p) => r.k === "pct" ? pct(r.v[p], r.base[p]) : r.v[p] ? clp(r.v[p]) : '<span class="faint">—</span>';
    const sinCostos = pers.filter((p) => ing[p] > 0 && !cos[p]);
    $("#fin").innerHTML = `
      <div class="kpis">
        <div class="kpi"><span class="l">Ingresos</span><span class="v">${clpM(ing._t)}</span><span class="s">${ctx.neto ? "netos" : "con IVA"} · ${esc(fecha(ctx.d0))} a ${esc(fecha(ctx.d1))}</span></div>
        <div class="kpi"><span class="l">Margen bruto</span><span class="v">${clpM(mb._t)}</span><span class="s">${pct(mb._t, ing._t)} sobre ingresos</span></div>
        <div class="kpi"><span class="l">Gastos operacionales</span><span class="v ${gas._t ? "" : "warn"}">${clpM(gas._t)}</span><span class="s">${gas._t ? pct(gas._t, ing._t) + " de los ingresos" : "aún sin gastos registrados"}</span></div>
        <div class="kpi"><span class="l">Resultado operacional</span><span class="v ${res._t < 0 ? "bad" : ""}">${clpM(res._t)}</span><span class="s">${pct(res._t, ing._t)} margen operacional</span></div>
      </div>
      ${sinCostos.length || !gas._t ? `<div class="alert no-print">${ico("alert", 18)}<div>${sinCostos.length ? `<b>${sinCostos.map(perTxt).join(", ")}</b> tienen ventas sin costos registrados: el margen aparece inflado. ` : ""}${!gas._t ? "Faltan los gastos operacionales del grupo (arriendo, sueldos, marketing, software, contador): regístralos en <a href=\"#/registro?t=costos\">Registro</a> para ver el resultado real." : ""}</div></div>` : ""}
      <section class="card eerr-card"><div class="card-h"><h3>Estado de resultados ${ctx.u ? "· " + esc(uName(ctx.u)) : "· Carclass Group"}</h3><span class="r faint" style="font-size:12px">${ctx.neto ? "CLP netos" : "CLP con IVA"}</span></div>
        <div class="tbl-wrap"><table class="tbl eerr"><thead><tr><th>Concepto</th>${pers.map((p) => `<th class="num">${esc(perTxt(p))}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
        ${rows.map((r) => r.k === "sec" ? `<tr class="e-sec"><td colspan="${pers.length + 2}">${esc(r.t)}</td></tr>` : `<tr class="e-${r.k}">${`<td>${r.k === "sub" ? `<span class="ldot" style="--c:${UNIDADES[r.u]?.c || "var(--muted)"}"></span> ` : ""}${esc(r.t)}</td>`}${pers.map((p) => `<td class="num ${r.k !== "pct" && r.v[p] < 0 ? "neg" : ""}">${cell(r, p)}</td>`).join("")}<td class="num ${r.k !== "pct" && r.v._t < 0 ? "neg" : ""}"><b>${cell(r, "_t")}</b></td></tr>`).join("")}
        </tbody></table></div></section>
      <p class="faint" style="font-size:12px;margin:0">Base devengada: la venta cuenta en su fecha de emisión y el costo en su fecha de registro. Para caja real usa <a href="#/flujo">Flujo de caja</a>.</p>`;
    const csvRows = rows.filter((r) => r.k !== "sec").map((r) => Object.fromEntries([["Concepto", (r.k === "det" ? "   " : "") + r.t], ...pers.map((p) => [perTxt(p), r.k === "pct" ? pct(r.v[p], r.base[p]) : Math.round(r.v[p] || 0)]), ["Total", r.k === "pct" ? pct(r.v._t, r.base._t) : Math.round(r.v._t || 0)]]));
    $("#fx-csv").onclick = () => downloadCSV(`EERR_${ctx.u || "grupo"}_${ctx.d0}_${ctx.d1}.csv`, csvRows);
    $("#fx-pdf").onclick = () => window.print();
  } catch (e) { $("#fin").innerHTML = fail(e); }
}

async function viewFlujo(params) {
  setActive("flujo");
  const P = $("#page");
  if (!ME.ve_finanzas) { P.innerHTML = sinAcceso(); return; }
  const ctx = finCtx(params, "flujo");
  P.innerHTML = finHead("flujo", "Flujo de caja", "Lo que efectivamente entró y salió: cobros, pagos y otros movimientos, con saldo inicial y final. Montos con IVA.", ctx,
    { iva: false, unidad: false, actions: `<button class="btn" id="fl-csv">${ico("dl", 16)} Exportar CSV</button><button class="btn primary" id="fl-pdf">${ico("doc", 16)} PDF</button>` }) + `<div id="fin">${loading(8)}</div>`;
  bindFin(ctx);
  try {
    const d = await rpc("app_flujo", { p_desde: ctx.d0, p_hasta: ctx.d1, p_periodo: ctx.per });
    const pers = d.periodos, F = d.filas;
    const sum = (f) => { const o = {}; pers.forEach((p) => (o[p] = 0)); F.filter(f).forEach((r) => (o[r.periodo] = (o[r.periodo] || 0) + Number(r.monto || 0))); o._t = pers.reduce((a, p) => a + o[p], 0); return o; };
    const rows = []; const secs = [["cobros", "Cobros de clientes", 1], ["otros_ingresos", "Otros ingresos", 1], ["pagos_costos", "Pagos de costos directos", -1], ["pagos_gastos", "Pagos de gastos", -1], ["otros_egresos", "Otros egresos", -1]];
    const neto = {}; pers.forEach((p) => (neto[p] = 0)); neto._t = 0;
    let saldo = Number(d.saldo_inicial || 0); const ini = {}, fin = {};
    secs.forEach(([s, t, sg]) => {
      const tot = sum((r) => r.seccion === s); if (!tot._t) return;
      rows.push({ t, v: tot, k: "sub", sg });
      [...new Set(F.filter((r) => r.seccion === s).map((r) => r.concepto))].forEach((c) => rows.push({ t: s === "cobros" ? uName(c) : c, v: sum((r) => r.seccion === s && r.concepto === c), k: "det", sg }));
      [...pers, "_t"].forEach((p) => (neto[p] += sg * tot[p]));
    });
    pers.forEach((p) => { ini[p] = saldo; saldo += neto[p]; fin[p] = saldo; }); ini._t = Number(d.saldo_inicial || 0); fin._t = saldo;
    const c = (v, sg = 1) => v ? clp(sg * v) : '<span class="faint">—</span>';
    const pc = d.por_cobrar || [], pp = d.por_pagar || [];
    const tramo = (x) => x.dias <= 30 ? 0 : x.dias <= 60 ? 1 : 2; const tr = [0, 0, 0]; pc.forEach((x) => (tr[tramo(x)] += Number(x.monto)));
    $("#fin").innerHTML = `
      ${!d.cuentas?.length ? `<div class="alert info no-print">${ico("info", 18)}<div><b>Agrega tus cuentas bancarias con su saldo y fecha</b> para que el flujo parta del saldo real. Mientras tanto se calcula desde $0.</div></div>` : ""}
      <div class="kpis">
        <div class="kpi"><span class="l">Saldo inicial</span><span class="v">${clpM(ini._t)}</span><span class="s">${d.cuentas?.length ? d.cuentas.length + " cuentas" : "sin cuentas registradas"}</span></div>
        <div class="kpi"><span class="l">Flujo neto del período</span><span class="v ${neto._t < 0 ? "bad" : ""}">${clpM(neto._t)}</span><span class="s">entradas menos salidas</span></div>
        <div class="kpi"><span class="l">Saldo final</span><span class="v ${fin._t < 0 ? "bad" : ""}">${clpM(fin._t)}</span><span class="s">al ${fecha(ctx.d1)}</span></div>
        <div class="kpi"><span class="l">Por cobrar</span><span class="v ${tr[2] ? "warn" : ""}">${clpM(pc.reduce((a, x) => a + Number(x.monto), 0))}</span><span class="s">${clpM(tr[2])} con más de 60 días</span></div>
      </div>
      <section class="card"><div class="card-h"><h3>Flujo de caja · Carclass Group</h3><span class="r faint" style="font-size:12px">CLP con IVA · base caja</span></div>
        <div class="tbl-wrap"><table class="tbl eerr"><thead><tr><th>Concepto</th>${pers.map((p) => `<th class="num">${esc(perTxt(p))}</th>`).join("")}<th class="num">Total</th></tr></thead><tbody>
          <tr class="e-tot"><td>Saldo inicial</td>${pers.map((p) => `<td class="num">${clp(ini[p])}</td>`).join("")}<td class="num"><b>${clp(ini._t)}</b></td></tr>
          ${rows.map((r) => `<tr class="e-${r.k}"><td>${esc(r.t)}</td>${pers.map((p) => `<td class="num ${r.sg < 0 && r.v[p] ? "neg" : ""}">${c(r.v[p], r.sg)}</td>`).join("")}<td class="num ${r.sg < 0 ? "neg" : ""}"><b>${c(r.v._t, r.sg)}</b></td></tr>`).join("") || `<tr><td colspan="${pers.length + 2}" class="muted">Sin cobros ni pagos en el período.</td></tr>`}
          <tr class="e-big"><td>Flujo neto</td>${pers.map((p) => `<td class="num ${neto[p] < 0 ? "neg" : ""}">${c(neto[p])}</td>`).join("")}<td class="num ${neto._t < 0 ? "neg" : ""}"><b>${c(neto._t)}</b></td></tr>
          <tr class="e-big"><td>Saldo final</td>${pers.map((p) => `<td class="num ${fin[p] < 0 ? "neg" : ""}">${clp(fin[p])}</td>`).join("")}<td class="num"><b>${clp(fin._t)}</b></td></tr>
        </tbody></table></div></section>
      <div class="grid2">
        <section class="card"><div class="card-h"><h3>Por cobrar</h3><span class="badge ${pc.length ? "warn" : ""}">${pc.length}</span><span class="r faint" style="font-size:12px">0–30 d ${clpM(tr[0])} · 31–60 d ${clpM(tr[1])} · +60 d ${clpM(tr[2])}</span></div>
          ${pc.length ? `<div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>Cliente</th><th>Unidad</th><th class="num">Monto</th><th class="num">Días</th><th></th></tr></thead><tbody>${pc.map((x) => `<tr><td><div class="name">${esc(x.cliente || "—")}</div><div class="sub">${esc([x.documento, fecha(x.fecha)].filter(Boolean).join(" · "))}</div></td><td>${unidadPill(x.unidad)}</td><td class="num">${clp(x.monto)}</td><td class="num"><span class="pill ${x.dias > 60 ? "bad" : x.dias > 30 ? "warn" : ""}">${x.dias}</span></td><td class="no-print"><button class="btn sm" data-cobrar="${x.id}">Cobrada</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="card-b muted">Nada pendiente de cobro.</div>`}</section>
        <div class="stack">
          <section class="card"><div class="card-h"><h3>Por pagar</h3><span class="badge">${pp.length}</span></div>${pp.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${pp.map((x) => `<tr><td><div class="name">${esc(x.proveedor || x.descripcion || "—")}</div><div class="sub">${esc([x.documento, fecha(x.fecha)].filter(Boolean).join(" · "))}</div></td><td class="num">${clp(x.monto)}</td><td class="no-print"><button class="btn sm" data-pagar="${x.id}">Pagada</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="card-b muted">Nada pendiente de pago.</div>`}</section>
          <section class="card"><div class="card-h"><h3>Cuentas</h3><button class="r btn sm no-print" id="fl-cta">${ico("plus", 14)} Agregar cuenta</button></div><div class="card-b" style="display:grid;gap:8px;font-size:13px">${(d.cuentas || []).map((k) => `<a class="row" href="#" data-cta='${esc(JSON.stringify(k))}' style="justify-content:space-between"><span><b>${esc(k.nombre)}</b> <span class="faint">${esc(k.banco || "")}</span></span><span>${clp(k.saldo_inicial)} <span class="faint">al ${fecha(k.fecha_saldo)}</span></span></a>`).join("") || '<span class="muted">Sin cuentas. Agrega cada cuenta con su saldo a una fecha.</span>'}</div></section>
        </div>
      </div>`;
    const recargar = () => viewFlujo(params);
    $$("[data-cobrar]").forEach((b) => b.onclick = async () => { b.disabled = true; try { await rpc("app_fin_guardar", { p: { tabla: "ventas", id: b.dataset.cobrar, datos: { estado_cobro: "cobrado", fecha_cobro: hoyISO() } } }); toast("Marcada como cobrada hoy"); recargar(); } catch (e) { toast(e.message, true); b.disabled = false; } });
    $$("[data-pagar]").forEach((b) => b.onclick = async () => { b.disabled = true; try { await rpc("app_fin_guardar", { p: { tabla: "costos", id: b.dataset.pagar, datos: { estado_pago: "pagado", fecha_pago: hoyISO() } } }); toast("Marcado como pagado hoy"); recargar(); } catch (e) { toast(e.message, true); b.disabled = false; } });
    $("#fl-cta").onclick = () => modalCuenta(null, recargar);
    $$("[data-cta]").forEach((a) => a.onclick = (e) => { e.preventDefault(); modalCuenta(JSON.parse(a.dataset.cta), recargar); });
    $("#fl-csv").onclick = () => downloadCSV(`Flujo_${ctx.d0}_${ctx.d1}.csv`, [{ t: "Saldo inicial", v: ini, sg: 1 }, ...rows, { t: "Flujo neto", v: neto, sg: 1 }, { t: "Saldo final", v: fin, sg: 1 }].map((r) => Object.fromEntries([["Concepto", (r.k === "det" ? "   " : "") + r.t], ...pers.map((p) => [perTxt(p), Math.round((r.sg || 1) * (r.v[p] || 0))]), ["Total", Math.round((r.sg || 1) * (r.v._t || 0))]])));
    $("#fl-pdf").onclick = () => window.print();
  } catch (e) { $("#fin").innerHTML = fail(e); }
}
function modalCuenta(k, after) {
  const root = modal(k ? "Editar cuenta" : "Agregar cuenta", `<div class="row"><div class="field"><label for="ct-n">Nombre</label><input class="input" id="ct-n" value="${esc(k?.nombre || "")}" placeholder="Cuenta corriente Carclass"></div><div class="field"><label for="ct-b">Banco</label><input class="input" id="ct-b" value="${esc(k?.banco || "")}"></div></div>
    <div class="row"><div class="field"><label for="ct-s">Saldo (CLP)</label><input class="input" id="ct-s" type="number" value="${k?.saldo_inicial ?? ""}"></div><div class="field"><label for="ct-f">A la fecha</label><input class="input" id="ct-f" type="date" value="${k?.fecha_saldo || hoyISO()}"></div></div>
    <p class="faint" style="margin:0;font-size:12px">El flujo suma y resta desde esta fecha. Si cambias el saldo, usa la fecha de la cartola.</p>`, async () => {
    if (!$("#ct-n").value.trim()) throw new Error("Escribe el nombre de la cuenta.");
    await rpc("app_fin_guardar", { p: { tabla: "cuentas", id: k?.id || null, datos: { nombre: $("#ct-n").value.trim(), banco: $("#ct-b").value.trim(), saldo_inicial: $("#ct-s").value || 0, fecha_saldo: $("#ct-f").value } } });
    toast("Cuenta guardada"); after && after();
  }, "Guardar", false, k ? { text: "Desactivar", fn: async () => { await rpc("app_fin_guardar", { p: { tabla: "cuentas", id: k.id, eliminar: true } }); toast("Cuenta desactivada"); after && after(); } } : null);
}

async function viewRegistro(params) {
  setActive("registro");
  const P = $("#page");
  if (!ME.ve_finanzas) { P.innerHTML = sinAcceso(); return; }
  const t = params.get("t") || "ventas";
  const ctx = finCtx(params, "registro");
  const link0 = ctx.link; ctx.link = (o) => link0({ t, ...o });
  const tits = { ventas: "Nueva venta", costos: "Nuevo costo o gasto", movimientos: "Nuevo movimiento" };
  P.innerHTML = finHead("registro", "Registro financiero", "Ventas, costos, gastos y movimientos de caja de todas las unidades. Montos con IVA; el neto se calcula solo.", ctx,
    { per: false, iva: false, actions: `<button class="btn" id="rg-csv">${ico("dl", 16)} Exportar CSV</button><button class="btn primary" id="rg-new">${ico("plus", 16)} ${tits[t]}</button>` })
    + `<div class="seg no-print">${[["ventas", "Ventas"], ["costos", "Costos y gastos"], ["movimientos", "Movimientos"]].map(([k, x]) => `<button class="${k === t ? "on" : ""}" data-t="${k}">${x}</button>`).join("")}</div><div id="fin">${loading(8)}</div>`;
  bindFin(ctx);
  $$("[data-t]").forEach((b) => b.onclick = () => (location.hash = link0({ t: b.dataset.t })));
  const recargar = () => viewRegistro(params);
  $("#rg-new").onclick = () => modalFin(t, null, recargar);
  try {
    const rows = await rpc("app_fin_registros", { p_tabla: t, p_desde: ctx.d0, p_hasta: ctx.d1, p_unidad: ctx.u || null });
    if (!$("#fin")) return; // el usuario ya cambió de módulo
    const tot = rows.reduce((a, r) => a + Number(r.monto || 0), 0);
    const cols = t === "ventas" ? ["Fecha", "Unidad", "Cliente", "Detalle", "Tipo", "Monto", "Cobro"] : t === "costos" ? ["Fecha", "Unidad", "Tipo", "Categoría", "Proveedor y detalle", "Monto", "Pago"] : ["Fecha", "Tipo", "Categoría", "Detalle", "Cuenta", "Monto"];
    $("#fin").innerHTML = `<section class="card"><div class="card-h"><h3>${rows.length} registros</h3><span class="r"><b>${clp(tot)}</b></span></div>${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${cols.map((c) => `<th class="${c === "Monto" ? "num" : ""}">${c}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r, i) => t === "ventas" ? `<tr class="click" data-i="${i}"><td>${fecha(r.fecha)}</td><td>${unidadPill(r.unidad)}</td><td class="name">${esc(r.cliente || "—")}</td><td><div>${esc((r.descripcion || "").slice(0, 80))}</div>${r.documento ? `<div class="sub">${esc(r.documento)}</div>` : ""}</td><td>${esc((MODALIDADES.find((m) => m[0] === r.modalidad) || [0, r.modalidad || "—"])[1])}</td><td class="num">${clp(r.monto)}${Number(r.costos) ? `<div class="sub">margen ${clp(r.monto - r.costos)}</div>` : ""}</td><td><span class="pill ${r.estado_cobro === "cobrado" ? "ok" : "warn"}">${esc(r.estado_cobro)}</span>${r.fecha_cobro ? `<div class="sub">${fecha(r.fecha_cobro)}</div>` : ""}</td></tr>`
        : t === "costos" ? `<tr class="click" data-i="${i}"><td>${fecha(r.fecha)}</td><td>${unidadPill(r.unidad)}</td><td>${esc(tipoCostoTxt(r.tipo))}</td><td>${esc(catTxt(r.categoria))}</td><td><div>${esc(r.proveedor || "")}</div><div class="sub">${esc((r.descripcion || "").slice(0, 80))}${r.venta_id ? " · ligado a una venta" : ""}</div></td><td class="num">${clp(r.monto)}</td><td><span class="pill ${r.estado_pago === "pagado" ? "ok" : "warn"}">${esc(r.estado_pago)}</span></td></tr>`
        : `<tr class="click" data-i="${i}"><td>${fecha(r.fecha)}</td><td><span class="pill ${r.tipo === "ingreso" ? "ok" : "bad"}">${esc(r.tipo)}</span></td><td>${esc(catTxt(r.categoria))}</td><td>${esc(r.descripcion || "")}</td><td>${esc(r.cuenta || "—")}</td><td class="num">${clp(r.monto)}</td></tr>`).join("")}
      </tbody></table></div>` : empty("doc", "Sin registros en el rango", "Cambia el rango o crea uno nuevo.")}</section>`;
    $$("#fin tr[data-i]").forEach((tr) => tr.onclick = () => modalFin(t, rows[tr.dataset.i], recargar));
    $("#rg-csv").onclick = () => downloadCSV(`${t}_${ctx.d0}_${ctx.d1}.csv`, rows);
  } catch (e) { if ($("#fin")) $("#fin").innerHTML = fail(e); }
}
function modalFin(t, r, after, preset = {}) {
  const uSel = (v, incluirGrupo = true) => `<select class="input" id="fn-u">${FIN_U.filter((x) => incluirGrupo || x !== "grupo").map((x) => `<option value="${x}" ${x === (v || UNI || "carclass") ? "selected" : ""}>${uName(x)}</option>`).join("")}</select>`;
  const opt = (arr, v, txt = (x) => x) => arr.map((x) => { const [k, l] = Array.isArray(x) ? x : [x, txt(x)]; return `<option value="${k}" ${k === v ? "selected" : ""}>${esc(l)}</option>`; }).join("");
  let body = "";
  if (t === "ventas") body = `<div class="row"><div class="field"><label for="fn-f">Fecha de emisión</label><input class="input" id="fn-f" type="date" value="${r?.fecha || hoyISO()}"></div><div class="field"><label for="fn-u">Unidad</label>${uSel(r?.unidad, false)}</div><div class="field"><label for="fn-m">Tipo</label><select class="input" id="fn-m">${opt(MODALIDADES, r?.modalidad || "servicio")}</select></div></div>
    <div class="row"><div class="field"><label for="fn-c">Cliente</label><input class="input" id="fn-c" value="${esc(r?.cliente || "")}"></div><div class="field" style="flex:0 1 180px"><label for="fn-doc">N° factura o boleta</label><input class="input" id="fn-doc" value="${esc(r?.documento || "")}"></div></div>
    <div class="field"><label for="fn-d">Detalle</label><input class="input" id="fn-d" value="${esc(r?.descripcion || "")}" placeholder="Servicio, vehículo, período"></div>
    <div class="row"><div class="field"><label for="fn-mo">Monto con IVA</label>${montoIn("fn-mo", r?.monto)}</div><div class="field"><label for="fn-iva">IVA</label><select class="input" id="fn-iva">${opt([["true", "Afecto"], ["false", "Exento"]], String(r?.afecto_iva ?? true))}</select></div>
      <div class="field"><label for="fn-e">Cobro</label><select class="input" id="fn-e">${opt([["pendiente", "Pendiente"], ["cobrado", "Cobrado"]], r?.estado_cobro || "pendiente")}</select></div><div class="field"><label for="fn-fe">Fecha de cobro</label><input class="input" id="fn-fe" type="date" value="${r?.fecha_cobro || ""}"></div></div>`;
  if (t === "costos") body = `<div class="row"><div class="field"><label for="fn-f">Fecha</label><input class="input" id="fn-f" type="date" value="${r?.fecha || hoyISO()}"></div><div class="field"><label for="fn-u">Unidad</label>${uSel(r?.unidad || preset.unidad)}</div><div class="field"><label for="fn-tp">Tipo</label><select class="input" id="fn-tp">${opt(TIPO_COSTO, TIPO_COSTO.some((x) => x[0] === r?.tipo) ? r.tipo : preset.tipo || "fijo")}</select></div></div>
    <div class="row"><div class="field"><label for="fn-cat">Categoría</label><select class="input" id="fn-cat"></select></div><div class="field"><label for="fn-p">Proveedor</label><input class="input" id="fn-p" value="${esc(r?.proveedor || "")}"></div><div class="field" style="flex:0 1 160px"><label for="fn-doc">N° documento</label><input class="input" id="fn-doc" value="${esc(r?.documento || "")}"></div></div>
    <div class="field"><label for="fn-d">Detalle</label><input class="input" id="fn-d" value="${esc(r?.descripcion || "")}"></div>
    <div class="row"><div class="field"><label for="fn-mo">Monto con IVA</label>${montoIn("fn-mo", r?.monto)}</div><div class="field"><label for="fn-iva">IVA</label><select class="input" id="fn-iva">${opt([["true", "Con IVA (factura)"], ["false", "Sin IVA (boleta de honorarios, exento)"]], String(r?.afecto_iva ?? true))}</select></div>
      <div class="field"><label for="fn-e">Pago</label><select class="input" id="fn-e">${opt([["pagado", "Pagado"], ["pendiente", "Pendiente"]], r?.estado_pago || "pagado")}</select></div><div class="field"><label for="fn-fe">Fecha de pago</label><input class="input" id="fn-fe" type="date" value="${r?.fecha_pago || ""}"></div></div>
    <div class="field" id="fn-vbox"><label for="fn-v">Venta asociada (para calcular su margen)</label><select class="input" id="fn-v"><option value="">Sin venta asociada (gasto general)</option>${(preset.venta_id || r?.venta_id) ? `<option value="${esc(preset.venta_id || r.venta_id)}" selected>${esc(preset.venta_txt || "Venta asociada")}</option>` : ""}</select></div>`;
  if (t === "movimientos") body = `<div class="row"><div class="field"><label for="fn-f">Fecha</label><input class="input" id="fn-f" type="date" value="${r?.fecha || hoyISO()}"></div><div class="field"><label for="fn-tp">Tipo</label><select class="input" id="fn-tp">${opt([["ingreso", "Ingreso"], ["egreso", "Egreso"]], r?.tipo || "egreso")}</select></div><div class="field"><label for="fn-cat">Categoría</label><select class="input" id="fn-cat"></select></div></div>
    <div class="row"><div class="field"><label for="fn-u">Unidad</label>${uSel(r?.unidad || "grupo")}</div><div class="field"><label for="fn-mo">Monto</label>${montoIn("fn-mo", r?.monto)}</div><div class="field" style="flex:0 1 160px"><label for="fn-doc">N° documento</label><input class="input" id="fn-doc" value="${esc(r?.documento || "")}"></div></div>
    <div class="field"><label for="fn-d">Detalle</label><input class="input" id="fn-d" value="${esc(r?.descripcion || "")}" placeholder="Ej: aporte de socio, pago cuota préstamo, IVA de octubre"></div>`;
  const nombres = { ventas: "venta", costos: "costo o gasto", movimientos: "movimiento" };
  const g = (id) => $("#" + id)?.value ?? null;
  const root = modal(r ? `Editar ${nombres[t]}` : `Nuevo ${nombres[t]}`, body + `<p class="faint" style="margin:0;font-size:12px">Queda en la auditoría con tu usuario.</p>`, async () => {
    const monto = montoVal($("#fn-mo", root));
    if (!monto || (t !== "ventas" && monto <= 0)) throw new Error("Escribe el monto.");
    const datos = t === "ventas" ? { fecha: g("fn-f"), unidad: g("fn-u"), modalidad: g("fn-m"), cliente: g("fn-c"), documento: g("fn-doc"), descripcion: g("fn-d"), monto, afecto_iva: g("fn-iva") === "true", estado_cobro: g("fn-e"), fecha_cobro: g("fn-fe") }
      : t === "costos" ? { fecha: g("fn-f"), unidad: g("fn-u"), tipo: g("fn-tp"), categoria: g("fn-cat"), proveedor: g("fn-p"), documento: g("fn-doc"), descripcion: g("fn-d"), monto, afecto_iva: g("fn-iva") === "true", estado_pago: g("fn-e"), fecha_pago: g("fn-fe"), venta_id: g("fn-v") || "" }
      : { fecha: g("fn-f"), tipo: g("fn-tp"), categoria: g("fn-cat"), unidad: g("fn-u"), monto, documento: g("fn-doc"), descripcion: g("fn-d") };
    await rpc("app_fin_guardar", { p: { tabla: t, id: r?.id || null, datos } });
    toast("Guardado"); after && after();
  }, "Guardar", false, r ? { text: "Eliminar", fn: async () => { if (!confirm("¿Eliminar este registro? Queda en la auditoría.")) throw new Error("Cancelado"); await rpc("app_fin_guardar", { p: { tabla: t, id: r.id, eliminar: true } }); toast("Eliminado"); after && after(); } } : null);
  // conserva la categoría del registro aunque no esté en la lista, para no cambiarla al editar
  const syncCat = () => { const sel = $("#fn-cat", root); if (!sel) return; const tp = $("#fn-tp", root).value; let lista = (t === "costos" ? CAT_COSTO[tp] : CAT_MOV[tp]) || ["otro"];
    const actual = r && r.tipo === tp ? r.categoria : null; if (actual && !lista.includes(actual)) lista = [actual, ...lista]; sel.innerHTML = opt(lista, actual || lista[0], catTxt); };
  if ($("#fn-tp", root)) { $("#fn-tp", root).onchange = () => { syncCat(); syncVentas(); }; syncCat(); }
  // costos: elegir la venta a la que pertenece (ventas del último año de la misma unidad)
  async function syncVentas() {
    const sel = $("#fn-v", root); if (!sel || t !== "costos") return;
    $("#fn-vbox", root).style.display = $("#fn-tp", root).value === "directo" || sel.value ? "" : "none";
    const u = $("#fn-u", root).value, actual = sel.value;
    try {
      const vs = await rpc("app_fin_registros", { p_tabla: "ventas", p_desde: masDias(-365), p_hasta: masDias(30), p_unidad: u });
      const ops = vs.slice(0, 150).map((v) => [v.id, `${fecha(v.fecha)} · ${(v.cliente || "").slice(0, 30)} · ${(v.descripcion || v.documento || "").slice(0, 30)} · ${clp(v.monto)}`]);
      if (actual && !ops.some(([k]) => k === actual)) ops.unshift([actual, sel.selectedOptions[0]?.textContent || "Venta asociada"]);
      sel.innerHTML = `<option value="">Sin venta asociada (gasto general)</option>` + ops.map(([k, l]) => `<option value="${esc(k)}" ${k === actual ? "selected" : ""}>${esc(l)}</option>`).join("");
    } catch {}
  }
  if (t === "costos") { $("#fn-u", root).addEventListener("change", syncVentas); syncVentas(); }
}

/* importar: CSV de Asisma, facturas o planillas, y mensualidades BlackGPS */
function parseCSV(txt) {
  const sep = (txt.split("\n")[0].match(/;/g) || []).length >= (txt.split("\n")[0].match(/,/g) || []).length ? ";" : ",";
  const out = []; let row = [], cur = "", q = false;
  for (let i = 0; i < txt.length; i++) { const ch = txt[i];
    if (q) { if (ch === '"' && txt[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ""; } else if (ch === "\n" || ch === "\r") { if (ch === "\r" && txt[i + 1] === "\n") i++; row.push(cur); if (row.some((c) => c.trim())) out.push(row); row = []; cur = ""; } else cur += ch; }
  row.push(cur); if (row.some((c) => c.trim())) out.push(row);
  return out;
}
const numCL = (s) => { if (s == null) return null; let x = String(s).replace(/[^\d,.-]/g, ""); if (/,\d{1,2}$/.test(x)) x = x.replace(/\./g, "").replace(",", "."); else x = x.replace(/[.,]/g, ""); const n = Number(x); return isNaN(n) ? null : Math.round(n); };
const fechaCL = (s) => { if (!s) return null; s = String(s).trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`; m = s.match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})/); if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; } return null; };
async function viewImportar() {
  setActive("importar");
  const P = $("#page");
  if (!ME.ve_finanzas) { P.innerHTML = sinAcceso(); return; }
  P.innerHTML = finHead("importar", "Importar y cargar", "Carga masiva desde Asisma, facturas o planillas, y mensualidades de BlackGPS. Nada se duplica: se omite lo que ya tenga el mismo N° de documento en la misma unidad.", null) + `
    <div class="grid2">
      <section class="card"><div class="card-h"><h3>Mensualidades BlackGPS</h3></div><div class="card-b" style="display:grid;gap:12px">
        <p class="muted" style="margin:0;font-size:13px">Crea una venta pendiente de cobro por cada contrato activo, con su valor mensual. Se omiten los clientes que ya tengan su mensualidad de ese mes (por ejemplo, la facturación de noviembre que ya cargó el asistente de finanzas).</p>
        <div class="row" style="align-items:flex-end"><div class="field" style="flex:0 1 180px"><label for="mm-mes">Mes</label><input class="input" id="mm-mes" type="month" value="${hoyISO().slice(0, 7)}"></div><button class="btn" id="mm-ver">Vista previa</button></div>
        <div id="mm-res"></div></div></section>
      <section class="card"><div class="card-h"><h3>Importar CSV</h3><a class="r btn sm ghost" href="#" id="im-plant">${ico("dl", 14)} Plantillas</a></div><div class="card-b" style="display:grid;gap:12px">
        <div class="row"><div class="field"><label for="im-t">Qué importas</label><select class="input" id="im-t"><option value="ventas">Ventas</option><option value="costos">Costos y gastos</option></select></div><div class="field"><label for="im-u">Unidad (si el archivo no la trae)</label><select class="input" id="im-u">${FIN_U.map((x) => `<option value="${x}">${uName(x)}</option>`).join("")}</select></div></div>
        <div class="field"><label for="im-f">Archivo CSV</label><input class="input" id="im-f" type="file" accept=".csv,text/csv,text/plain" style="padding-top:8px"></div>
        <div class="field"><label for="im-txt">o pega aquí las filas (con encabezado)</label><textarea class="input" id="im-txt" style="min-height:80px" placeholder="fecha;documento;cliente;detalle;monto"></textarea></div>
        <button class="btn primary" id="im-leer" style="justify-self:start">Leer archivo</button></div></section>
    </div><div id="im-map"></div>`;
  $("#mm-ver").onclick = async () => {
    const mes = $("#mm-mes").value + "-01";
    try {
      const r = await rpc("app_fin_mensualidades", { p_mes: mes, p_crear: false });
      const nuevas = r.filas.filter((f) => !f.ya_registrada);
      $("#mm-res").innerHTML = `<div class="tbl-wrap" style="max-height:300px"><table class="tbl"><tbody>${r.filas.map((f) => `<tr><td>${esc(f.empresa)} <span class="faint">· ${int(f.equipos)} eq.</span></td><td class="num">${clp(f.monto)}</td><td>${f.ya_registrada ? '<span class="pill ok">ya cargada</span>' : '<span class="pill">nueva</span>'}</td></tr>`).join("")}</tbody></table></div>
        <div class="row" style="justify-content:space-between;align-items:center"><span><b>${nuevas.length}</b> por crear · <b>${clp(r.total)}</b></span>${nuevas.length ? `<button class="btn primary" id="mm-ok">Crear ${nuevas.length} mensualidades</button>` : ""}</div>`;
      if ($("#mm-ok")) $("#mm-ok").onclick = async () => { if (!confirm(`¿Crear ${nuevas.length} ventas de mensualidad de ${r.mes} por ${clp(r.total)}?`)) return; const x = await rpc("app_fin_mensualidades", { p_mes: mes, p_crear: true }); toast(`${x.creadas} mensualidades creadas`); $("#mm-ver").click(); };
    } catch (e) { $("#mm-res").innerHTML = `<div class="err">${esc(e.message)}</div>`; }
  };
  $("#im-plant").onclick = (e) => { e.preventDefault();
    downloadCSV("plantilla_ventas.csv", [{ fecha: "2026-11-05", unidad: "carclass", documento: "F-1234", cliente: "Nombre cliente", detalle: "Sellado cerámico · Audi A3", tipo: "servicio", monto: 280000, estado: "cobrado", fecha_cobro: "2026-11-05" }]);
    setTimeout(() => downloadCSV("plantilla_costos_gastos.csv", [{ fecha: "2026-11-05", unidad: "grupo", tipo: "fijo", categoria: "arriendo", proveedor: "Proveedor", documento: "F-998", detalle: "Arriendo oficina noviembre", monto: 350000, estado: "pagado" }]), 400);
  };
  $("#im-f").onchange = async () => { const f = $("#im-f").files[0]; if (f) $("#im-txt").value = await f.text(); };
  $("#im-leer").onclick = () => {
    const filas = parseCSV($("#im-txt").value || ""); if (filas.length < 2) { toast("No encontré filas: revisa que tenga encabezado y al menos una fila", true); return; }
    const head = filas[0].map((h) => h.trim()), datos = filas.slice(1), t = $("#im-t").value;
    const CAMPOS = t === "ventas" ? [["fecha", "Fecha *"], ["monto", "Monto con IVA *"], ["documento", "N° documento"], ["cliente", "Cliente"], ["descripcion", "Detalle"], ["modalidad", "Tipo"], ["estado_cobro", "Estado de cobro"], ["fecha_cobro", "Fecha de cobro"], ["unidad", "Unidad"]]
      : [["fecha", "Fecha *"], ["monto", "Monto con IVA *"], ["documento", "N° documento"], ["proveedor", "Proveedor"], ["descripcion", "Detalle"], ["tipo", "Tipo (directo, fijo o variable)"], ["categoria", "Categoría"], ["estado_pago", "Estado de pago"], ["unidad", "Unidad"]];
    const adivina = (c) => { const k = c[0]; const rx = { fecha: /^fecha( de)? ?(emisi|doc|$)|^fecha$|fecha ing/i, monto: /monto|total|valor bruto|importe/i, documento: /folio|n[°º]|factura|documento|pedido|boleta/i, cliente: /cliente|raz[oó]n|empresa/i, proveedor: /proveedor|raz[oó]n/i, descripcion: /detalle|descrip|glosa|servicio|concepto/i, modalidad: /^tipo|modalidad/i, tipo: /^tipo/i, categoria: /categor/i, estado_cobro: /estado|pagad|cobr/i, estado_pago: /estado|pagad/i, fecha_cobro: /fecha (de )?(cobro|pago)/i, unidad: /unidad|negocio/i }[k];
      const i = head.findIndex((h) => rx && rx.test(h)); return i; };
    $("#im-map").innerHTML = `<section class="card"><div class="card-h"><h3>Columnas · ${datos.length} filas</h3></div><div class="card-b" style="display:grid;gap:12px">
      <div class="row">${CAMPOS.map(([k, l]) => `<div class="field" style="flex:1 1 170px"><label>${l}</label><select class="input" data-map="${k}"><option value="-1">—</option>${head.map((h, i) => `<option value="${i}" ${adivina([k]) === i ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></div>`).join("")}</div>
      <div id="im-prev"></div><div class="row"><button class="btn primary" id="im-go">Importar</button></div><div id="im-out"></div></div></section>`;
    const normal = () => {
      const mp = Object.fromEntries($$("[data-map]").map((s) => [s.dataset.map, Number(s.value)]));
      return datos.map((r) => { const o = {}; for (const [k, i] of Object.entries(mp)) if (i >= 0) o[k] = (r[i] || "").trim();
        o.fecha = fechaCL(o.fecha); o.monto = numCL(o.monto); if (o.fecha_cobro) o.fecha_cobro = fechaCL(o.fecha_cobro);
        if (o.estado_cobro != null) o.estado_cobro = /cobr|pagad|ok|si|sí/i.test(o.estado_cobro) ? "cobrado" : "pendiente";
        if (o.estado_pago != null) o.estado_pago = /pend|no/i.test(o.estado_pago) ? "pendiente" : "pagado";
        if (o.tipo != null) o.tipo = /direct|venta|partner/i.test(o.tipo) ? "directo" : /variab/i.test(o.tipo) ? "variable" : "fijo";
        if (o.unidad) { const u = Object.keys(UNIDADES).find((k) => k === o.unidad.toLowerCase() || UNIDADES[k].n.toLowerCase() === o.unidad.toLowerCase()); o.unidad = u || null; }
        return o; }).filter((o) => o.fecha && o.monto);
    };
    const prev = () => { const n = normal(); $("#im-prev").innerHTML = `<div class="faint" style="font-size:12.5px">${n.length} filas válidas de ${datos.length} (sin fecha o monto se omiten). Primeras 8:</div><div class="tbl-wrap"><table class="tbl"><tbody>${n.slice(0, 8).map((o) => `<tr><td>${fecha(o.fecha)}</td><td>${esc(o.documento || "")}</td><td>${esc(o.cliente || o.proveedor || "")}</td><td>${esc((o.descripcion || "").slice(0, 60))}</td><td class="num">${clp(o.monto)}</td></tr>`).join("")}</tbody></table></div>`; };
    $$("[data-map]").forEach((s) => (s.onchange = prev)); prev();
    $("#im-go").onclick = async () => {
      const n = normal(); if (!n.length) { toast("No hay filas válidas", true); return; }
      if (!confirm(`¿Importar ${n.length} ${t === "ventas" ? "ventas" : "costos o gastos"}?`)) return;
      const b = $("#im-go"); b.disabled = true;
      try { const r = await rpc("app_fin_importar", { p: { tabla: t, unidad: $("#im-u").value, filas: n } });
        $("#im-out").innerHTML = `<div class="alert ${r.errores ? "" : "brand"}">${ico(r.errores ? "alert" : "check", 18)}<div><b>${r.importadas}</b> importadas · ${r.duplicadas} omitidas por duplicadas · ${r.errores} con error${r.detalle_errores?.length ? `<div class="faint" style="font-size:12px;margin-top:4px">${r.detalle_errores.slice(0, 5).map((e) => esc(e.error)).join("<br>")}</div>` : ""}</div></div>`;
      } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
    };
  };
}

/* ---------- equipo ---------- */
const MODULOS = ["Dashboard", "Bandeja", "Conversaciones", "Embudo", "Agenda", "Cotizaciones", "Clientes", "Vehículos", "Tareas y postventa", "Finanzas", "Equipo"];
const ROLES = [["Dueño", MODULOS.map(() => "total")], ["Administrador de finanzas", ["ver", "—", "—", "—", "—", "ver", "ver", "ver", "—", "total", "—"]], ["Comercial Carclass y Carwash.hf", ["ver", "total", "total", "total", "total", "total", "total", "total", "total", "—", "—"]], ["Ejecutivo NOM", ["ver", "total", "total", "total", "total", "—", "total", "total", "total", "—", "—"]]];
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
      ${pr.filter((p) => p.unidad === u && p.tipo !== "playbook").map((p) => `<section class="card"><div class="card-h"><h3>${esc(p.titulo)}</h3></div><div class="card-b" style="font-size:13.5px;line-height:1.6">${md(p.contenido || "")}</div></section>`).join("") || `<div class="card">${empty("help", "Sin procesos")}</div>`}
      ${(() => { const pb = pr.filter((p) => p.unidad === u && p.tipo === "playbook"); return pb.length ? `<section class="card"><div class="card-h"><h3>Playbook comercial</h3><span class="badge">${pb.length}</span></div>
        <div class="card-b" style="display:grid;gap:8px"><p class="faint" style="margin:0;font-size:12.5px">Traído del panel anterior (app.carclass.cl): perfiles, guiones, objeciones, cierre y postventa. Es referencia: algunos datos son de antes (Kommo, ManyChat, plazos o precios). Lo que manda es el proceso de arriba.</p>
        ${pb.map((p) => `<details class="pb"><summary>${esc(p.titulo.replace(/^Playbook · /, ""))}</summary><div style="font-size:13.5px;line-height:1.6;padding:6px 2px 4px">${md(p.contenido || "")}</div></details>`).join("")}</div></section>` : ""; })()}
      <section class="card"><div class="card-h"><h3>Atajos</h3></div><div class="card-b" style="font-size:13px;display:grid;gap:6px"><div>Versión ${VERSION} · <a href="#" id="re-onb">Ver de nuevo la bienvenida</a></div></div></section>`;
    $("#re-onb").onclick = (e) => { e.preventDefault(); onboarding(true); };
  } catch (e) { $("#pr").innerHTML = fail(e); }
}

/* ---------- modales ---------- */
function modal(title, body, onOk, okText = "Guardar", wide = false, alt = null) {
  const root = $("#modal-root");
  root.innerHTML = `<div class="modal-bg"><div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button type="button" class="btn ghost sm icon" data-x aria-label="Cerrar">${ico("x", 16)}</button></div>
    <form id="m-form" novalidate><div class="modal-b">${body}<div class="err" id="m-err"></div></div>
    <div class="modal-f"><button type="button" class="btn ghost" data-x>${onOk ? "Cancelar" : "Cerrar"}</button>${alt ? `<button type="button" class="btn" id="m-alt">${esc(alt.text)}</button>` : ""}${onOk ? `<button class="btn primary" id="m-ok">${esc(okText)}</button>` : ""}</div></form></div></div>`;
  const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", k); };
  function k(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", k);
  $$("[data-x]", root).forEach((b) => b.onclick = close);
  if (alt) $("#m-alt", root).onclick = async () => { const b = $("#m-alt", root); b.disabled = true; $("#m-err").textContent = ""; try { await alt.fn(); close(); } catch (err) { $("#m-err").textContent = err.message; b.disabled = false; } };
  // ojo: un manejador on* que devuelve false cancela el clic (y el foco) en todo el modal; por eso va con llaves
  $(".modal-bg", root).onmousedown = (e) => { if (e.target.classList.contains("modal-bg")) close(); };
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

const COMUNAS = ["Chicureo", "Lo Barnechea", "Las Condes", "Vitacura", "Colina", "Providencia", "Huechuraba", "Tiltil", "Lampa", "Ñuñoa"];
const SERV_CARCLASS = ["Protección PPF (frontal o total)", "PPF interior", "Sellado cerámico (1, 4 u 8 años)", "Láminas de seguridad", "Paquete Protect+", "Paquete Shield", "Protection Pack", "Detailing interior (solo si lo pide)", "Pintura o desabolladura", "No sabe aún"];
function modalLead(pre = {}) {
  const unis = unidadesMias();
  const u0 = pre.unidad && unis.includes(pre.unidad) ? pre.unidad : UNI && unis.includes(UNI) ? UNI : unis.includes("carclass") ? "carclass" : unis[0];
  const f = (id, label, attrs = "", style = "") => `<div class="field" ${style ? `style="${style}"` : ""}><label for="${id}">${label}</label><input class="input" id="${id}" ${attrs}></div>`;
  const sel = (id, label, opts, style = "") => `<div class="field" ${style ? `style="${style}"` : ""}><label for="${id}">${label}</label><select class="input" id="${id}">${opts.map((o) => `<option>${esc(o)}</option>`).join("")}</select></div>`;
  const root = modal("Nuevo lead", `
    <div class="field"><span class="lbl">Línea de negocio</span>${seg("u", unis.map((x) => [x, uName(x)]), u0)}</div>
    <div class="field" id="ld-flujo"><span class="lbl">¿Qué busca?</span>${seg("flujo", [["consignante", "Consignar su auto"], ["comprador", "Comprar un auto"], ["compra_directa", "Vender ya (compra directa o parte de pago)"]], pre.flujo || "consignante")}</div>
    <div class="row">${f("ld-nom", "Nombre", `value="${esc(pre.nombre || "")}" autocomplete="off"`)}${f("ld-tel", "Teléfono o WhatsApp", `type="tel" placeholder="+56 9 1234 5678" value="${esc(pre.telefono || "")}"`)}</div>
    <div class="row">${f("ld-mail", "Correo", `type="email" value="${esc(pre.email || "")}"`)}${f("ld-com", "Comuna", 'list="dl-com" autocomplete="off"', "flex:0 1 190px")}<datalist id="dl-com">${COMUNAS.map((c) => `<option value="${c}">`).join("")}</datalist></div>
    <div id="ld-extra"></div>
    <div class="row"><div class="field"><label for="ld-canal">Canal</label><select class="input" id="ld-canal">${CANALES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>${f("ld-camp", "Campaña o anuncio", 'placeholder="Opcional"')}</div>
    <div class="field"><label for="ld-msg">Mensaje del cliente</label><textarea class="input" id="ld-msg" style="min-height:64px" placeholder="Lo que escribió o pidió"></textarea></div>
    <p class="faint" style="margin:0;font-size:12px">Si ya existe un cliente con ese teléfono o RUT, el lead se suma a su ficha y no se duplica.</p>`,
    async () => {
      const unidad = segVal(root, "u"), b2b = !UNIDADES[unidad]?.b2c, fl = unidad === "nom" ? segVal(root, "flujo") : null;
      const g = (id) => ($("#" + id, root)?.value || "").trim() || null;
      const p = { unidad, flujo: fl, nombre: g("ld-nom"), telefono: g("ld-tel"), email: g("ld-mail"), comuna: g("ld-com"), canal: $("#ld-canal", root).value, campana: g("ld-camp") };
      const det = []; let veh = null, interes = null;
      if (unidad === "carclass") { veh = { marca: g("x-marca"), modelo: g("x-modelo"), anio: g("x-anio"), patente: g("x-pat") }; interes = g("x-serv"); det.push(`Servicio de interés: ${interes}`); }
      if (unidad === "carwash") { interes = `${g("x-serv")} · ${(g("x-tipo") || "").split(" (")[0]}`; det.push(`Servicio: ${interes}`); if (g("x-marca")) det.push(`Vehículo: ${g("x-marca")}`); if (g("x-fecha")) det.push(`Fecha deseada: ${g("x-fecha")}`); }
      if (unidad === "nom" && ["consignante", "compra_directa"].includes(fl)) { veh = { marca: g("x-marca"), modelo: g("x-modelo"), anio: g("x-anio"), km: g("x-km"), precio_esperado: g("x-precio") }; interes = `${fl === "compra_directa" ? "Vender (compra directa)" : "Consignar"} ${[g("x-marca"), g("x-modelo"), g("x-anio")].filter(Boolean).join(" ")}`.trim(); det.push(`Documentos y prendas: ${g("x-docs")}`); if (g("x-precio")) det.push(`Precio esperado: ${clp(g("x-precio"))}`); }
      if (unidad === "nom" && fl === "comprador") { interes = g("x-interes") ? `Busca ${g("x-interes")}` : "Comprar un auto"; if (g("x-pres")) det.push(`Presupuesto: ${clp(g("x-pres"))}`); det.push(`Pago: ${g("x-pago")}`); }
      if (b2b) Object.assign(p, { empresa: g("ld-emp"), rut: g("ld-rut"), flota: g("ld-flota"), rubro: g("ld-rubro"), cargo: g("ld-cargo") });
      if (veh && (veh.marca || veh.modelo || veh.patente)) p.vehiculo = veh;
      p.interes = interes ? interes.slice(0, 120) : null;
      p.mensaje = [g("ld-msg"), det.filter(Boolean).join(" · ")].filter(Boolean).join("\n") || null;
      if (!p.telefono && !p.email) throw new Error("Escribe al menos un teléfono o un correo.");
      if (!p.nombre && !p.empresa) throw new Error("Escribe el nombre del cliente.");
      const r = await rpc("app_registrar_lead", { p });
      toast(r.nueva ? "Lead creado" : "Ya tenía una oportunidad abierta: se sumó a su ficha");
      cargarAvisos(); location.hash = "#/cliente/" + r.cliente_id;
    }, "Crear lead");
  const extra = (u, fl) => {
    if (u === "carclass") return `<div class="xbox"><div class="lbl">Auto y servicio</div><div class="row">${f("x-marca", "Marca")}${f("x-modelo", "Modelo")}${f("x-anio", "Año", 'type="number" min="1980" max="2030"', "flex:0 1 90px")}${f("x-pat", "Patente", "", "flex:0 1 110px")}</div>${sel("x-serv", "Servicio de interés", SERV_CARCLASS)}<div class="hint">Pide fotos del auto para la pre-evaluación remota. Pintura y desabolladura las cotiza una persona con el especialista.</div></div>`;
    if (u === "carwash") return `<div class="xbox"><div class="lbl">Vehículo y servicio</div><div class="row">${f("x-marca", "Marca y modelo", 'placeholder="Ej: Toyota Hilux"')}${sel("x-tipo", "Tamaño", ["Auto o SUV compacto (citycar, sedán, SUV compacto)", "SUV o pickup mediana (Hilux, L200, Ranger)", "Pickup XL o SUV 7 asientos (F-150, Ram, Tahoe)", "Van, furgón o flota (lo cotiza Felipe)"])}</div>
      <div class="row">${sel("x-serv", "Servicio", ["Lavado Boutique", "Lavado Básico (solo exterior)", "Lavado Técnico", "Interior + tapiz", "Pulido Básico", "Sellado Cerámico Lite", "Empresa o flota (lo cotiza Felipe)", "No sabe aún"])}${f("x-fecha", "Fecha deseada", 'type="date"', "flex:0 1 160px")}</div>
      <div class="hint">WhatsApp Carwash.hf +56 9 4619 6226 · ${esc(cwNeg().direccion || "Huertos Familiares")} · ${esc(cwHorario())} · máximo ${cwNeg().capacidad_diaria || 4} autos por día · sin domicilio. Lavados según tamaño (web carclass.cl/carwash-hf); Pulido Básico y Sellado Cerámico Lite con valor aproximado; empresas y vans los cotiza Felipe.</div></div>`;
    if (u === "nom" && ["consignante", "compra_directa"].includes(fl)) return `<div class="xbox"><div class="lbl">${fl === "compra_directa" ? "Auto a vender (compra directa o parte de pago)" : "Auto a consignar"}</div><div class="row">${f("x-marca", "Marca")}${f("x-modelo", "Modelo")}${f("x-anio", "Año", 'type="number" min="1990" max="2030"', "flex:0 1 90px")}${f("x-km", "Km", 'type="number" min="0"', "flex:0 1 110px")}</div><div class="row">${f("x-precio", "Precio esperado", 'type="number" min="0" step="100000"')}${sel("x-docs", "Documentos y prendas", ["Por confirmar", "Al día y sin prendas", "Tiene prenda", "Documentos pendientes"])}</div><div class="hint">${fl === "compra_directa" ? "Nunca se ofrece precio en el primer contacto: se tasa en Core y la oferta va por escrito, aprobada por Felipe. Margen mínimo $1.000.000 a $1.500.000; compras de hasta $8 a $10 MM. Si es parte de pago, se cierra junto con la venta del auto NOM." : `Califica si es ${P("nom.automatizacion").anio_minimo || 2015} o más, sin prendas y con precio dentro de ±10% del mercado. ${esc(comisionNomTxt())} Exclusividad 45 días.`}</div></div>`;
    if (u === "nom") return `<div class="xbox"><div class="lbl">Lo que busca</div><div class="row">${f("x-interes", "Auto de interés", 'placeholder="Ej: Corolla Cross o SUV hasta $17 MM"')}${f("x-pres", "Presupuesto", 'type="number" min="0" step="500000"', "flex:0 1 150px")}${sel("x-pago", "Pago", ["Por confirmar", "Contado", "Financiamiento", "Con auto en parte de pago"], "flex:0 1 200px")}</div><div class="hint">Visita y test drive solo con calificados (plazo menor a 30 días). Reserva mínima $200.000.</div></div>`;
    return `<div class="xbox"><div class="lbl">Empresa</div><div class="row">${f("ld-emp", "Empresa", `value="${esc(pre.empresa || "")}"`)}${f("ld-rut", "RUT", `placeholder="76.123.456-7" value="${esc(pre.rut ? fmtRut(pre.rut) : "")}"`, "flex:0 1 150px")}${f("ld-flota", "Flota", 'type="number" min="0"', "flex:0 1 100px")}</div><div class="row">${f("ld-rubro", "Rubro")}${f("ld-cargo", "Cargo del contacto")}</div><div class="hint">Filtro BlackGPS: flotas de 10 o más vehículos. Desde la reunión en adelante manda Asisma.</div></div>`;
  };
  const sync = () => { const u = segVal(root, "u"); $("#ld-flujo", root).style.display = u === "nom" ? "" : "none"; $("#ld-extra", root).innerHTML = extra(u, segVal(root, "flujo")); };
  bindSeg(root, sync); sync();
}

function modalFicha(e, c0, after) {
  const persona = e.tipo === "persona";
  const f = (id, label, v, attrs = "", style = "") => `<div class="field" ${style ? `style="${style}"` : ""}><label for="${id}">${label}</label><input class="input" id="${id}" value="${esc(v ?? "")}" ${attrs}></div>`;
  modal(`Editar · ${e.nombre}`, `
    <div class="row">${f("fe-nom", persona ? "Nombre" : "Razón social o nombre", e.nombre)}${f("fe-rut", "RUT", e.rut ? fmtRut(e.rut) : "", 'placeholder="12.345.678-9"', "flex:0 1 160px")}</div>
    <div class="row">${f("fe-tel", "Teléfono o WhatsApp", e.telefono, 'type="tel"')}${f("fe-mail", "Correo", e.email, 'type="email"')}</div>
    <div class="row">${f("fe-com", "Comuna", e.comuna, 'list="dl-com2"')}<datalist id="dl-com2">${COMUNAS.map((x) => `<option value="${x}">`).join("")}</datalist>${f("fe-reg", "Región", e.region)}</div>
    ${f("fe-dir", "Dirección", e.direccion)}
    ${persona ? "" : `<div class="row">${f("fe-rub", "Rubro", e.rubro)}${f("fe-flota", "Flota", e.tamano_flota, 'type="number" min="0"', "flex:0 1 120px")}</div>
      <div class="xbox"><div class="lbl">Contacto principal</div><div class="row">${f("fe-cn", "Nombre", c0?.nombre)}${f("fe-cc", "Cargo", c0?.cargo)}</div><div class="row">${f("fe-ct", "Teléfono", c0?.telefono, 'type="tel"')}${f("fe-ce", "Correo", c0?.email, 'type="email"')}</div></div>`}
    <div class="field"><label for="fe-not">Notas</label><textarea class="input" id="fe-not" style="min-height:60px">${esc(e.notas || "")}</textarea></div>
    <p class="faint" style="margin:0;font-size:12px">Queda en la auditoría con tu usuario. Un RUT o teléfono que ya tiene otra ficha no se puede repetir.</p>`, async () => {
    const g = (id) => $("#" + id)?.value.trim() ?? "";
    await rpc("app_ficha_guardar", { p: { id: e.id, nombre: g("fe-nom"), rut: g("fe-rut"), telefono: g("fe-tel"), email: g("fe-mail"), comuna: g("fe-com"), region: g("fe-reg"), direccion: g("fe-dir"),
      rubro: persona ? e.rubro : g("fe-rub"), flota: persona ? e.tamano_flota : g("fe-flota"), notas: g("fe-not"),
      contacto: persona ? null : { id: c0?.id || null, nombre: g("fe-cn"), cargo: g("fe-cc"), telefono: g("fe-ct"), email: g("fe-ce") } } });
    toast("Ficha actualizada"); after && after();
  }, "Guardar");
}
function modalOportunidad(o, after) {
  if (!o) return;
  modal(`Editar oportunidad · ${uName(o.unidad)}`, `
    <div class="field"><label for="op-tit">Qué busca (título)</label><input class="input" id="op-tit" value="${esc(o.titulo || "")}" placeholder="Ej: Cerámico RAV4 2022"></div>
    <div class="row"><div class="field"><label for="op-acc">Próxima acción</label><input class="input" id="op-acc" value="${esc(o.proxima_accion || "")}"></div><div class="field" style="flex:0 1 170px"><label for="op-f">Fecha</label><input class="input" id="op-f" type="date" value="${o.proxima_fecha || diaHabil(1)}"></div></div>
    <div class="field" style="max-width:220px"><label for="op-m">Monto estimado con IVA</label>${montoIn("op-m", o.monto)}</div>
    <p class="faint" style="margin:0;font-size:12px">La etapa se cambia con el selector de la tarjeta o registrando una gestión.</p>`, async () => {
    await rpc("app_oportunidad_guardar", { p: { id: o.id, titulo: $("#op-tit").value, proxima_accion: $("#op-acc").value, proxima_fecha: $("#op-f").value, monto: montoVal($("#op-m")) } });
    toast("Oportunidad actualizada"); after && after();
  }, "Guardar");
}
function modalActividad(opId, nombre, after, unidad) {
  const root = modal(`Registrar gestión · ${nombre}`, `
    <div class="field"><span class="lbl">Tipo</span>${seg("tipo", [["whatsapp", "WhatsApp"], ["llamada", "Llamada"], ["correo", "Correo"], ["reunion", "Reunión"], ["nota", "Nota"]], "whatsapp")}</div>
    <div class="field"><label for="a-res">Resultado</label><select class="input" id="a-res">${resultadosDe(unidad).map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div>
    <div class="field"><label for="a-nota">Detalle</label><textarea class="input" id="a-nota" placeholder="Qué pasó, con quién hablaste, qué pidió"></textarea></div>
    <div class="row"><div class="field"><label for="a-acc">Próxima acción</label><input class="input" id="a-acc" placeholder="Ej: enviar cotización, volver a llamar"></div>
    <div class="field" style="flex:0 1 170px"><label for="a-fecha">Fecha</label><input class="input" id="a-fecha" type="date" value="${diaHabil(2)}"></div></div>`,
    async () => {
      const r = await rpc("app_registrar_actividad", { p: { oportunidad_id: opId, tipo: segVal(root, "tipo"), resultado: $("#a-res").value || null, nota: $("#a-nota").value.trim() || null, proxima_accion: $("#a-acc").value.trim() || null, proxima_fecha: $("#a-fecha").value || null } });
      toast(r.etapa !== r.etapa_anterior ? `Gestión guardada · avanzó a ${etapaTxt(r.etapa)}` : r.estado === "perdida" ? "Gestión guardada · oportunidad perdida" : "Gestión guardada");
      after && after();
    });
  bindSeg(root);
}
// ctx = { unidad, monto, titulo } cuando se conoce: permite registrar la venta en el mismo paso
function modalCerrar(opId, nombre, estado, after, ctx = {}) {
  const ganar = estado === "ganada";
  const conVenta = ganar && ME.ve_finanzas && !["blackgps", "somosb2b"].includes(ctx.unidad);
  const modDef = ctx.unidad === "nom" ? "consignacion" : "servicio";
  const root = modal(ganar ? `Marcar como ganada · ${nombre}` : `Marcar como perdida · ${nombre}`, ganar
    ? `<p style="margin:0">La oportunidad queda <b>ganada</b>. En Carclass, Carwash.hf y NOM se crean solos los seguimientos de postventa.</p>
      ${conVenta ? `<label class="check-row"><input type="checkbox" id="c-v" checked> Registrar la venta ahora</label>
      <div class="xbox" id="c-vbox"><div class="row"><div class="field"><label for="c-mo">Monto con IVA</label>${montoIn("c-mo", ctx.monto || "")}</div>
        <div class="field"><label for="c-mod">Tipo</label><select class="input" id="c-mod">${MODALIDADES.map(([k, t]) => `<option value="${k}" ${k === modDef ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
        <div class="field"><label for="c-d">Detalle</label><input class="input" id="c-d" value="${esc(ctx.titulo || "")}" placeholder="Servicio y vehículo"></div>
        <div class="row"><div class="field"><label for="c-e">Cobro</label><select class="input" id="c-e"><option value="pendiente">Pendiente</option><option value="cobrado">Cobrado</option></select></div>
        <div class="field"><label for="c-doc">N° boleta o factura</label><input class="input" id="c-doc" placeholder="Opcional"></div>
        <div class="field"><label for="c-iva">IVA</label><select class="input" id="c-iva"><option value="true">Afecto</option><option value="false">Exento</option></select></div></div>
        <div class="faint" style="font-size:12px">Queda ligada al cliente y a la oportunidad. Luego agrega sus costos (partner, insumos) desde la ficha para ver el margen.</div></div>`
      : `<p class="muted" style="margin:0;font-size:13px">${["blackgps", "somosb2b"].includes(ctx.unidad) ? "En BlackGPS la venta se registra desde la facturación (Control_Facturacion)." : "La venta y su monto se registran en Finanzas → Registro."}</p>`}
      <div class="field"><label for="c-n">Nota</label><input class="input" id="c-n" placeholder="Opcional"></div>`
    : `<div class="field"><label for="c-m">Motivo de pérdida</label><select class="input" id="c-m"><option value="">Elige un motivo…</option>${MOTIVOS.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></div><div class="field"><label for="c-n">Detalle</label><input class="input" id="c-n" placeholder="Opcional"></div>`,
    async () => {
      const m = ganar ? null : $("#c-m").value; if (!ganar && !m) throw new Error("Elige un motivo de la lista.");
      const nota = $("#c-n").value.trim() || null;
      if (ganar) {
        const venta = conVenta && $("#c-v").checked ? { monto: montoVal($("#c-mo")) || 0, modalidad: $("#c-mod").value, descripcion: $("#c-d").value.trim(), estado_cobro: $("#c-e").value, documento: $("#c-doc").value.trim(), afecto_iva: $("#c-iva").value === "true" } : null;
        if (venta && venta.monto <= 0) throw new Error("Escribe el monto de la venta o desmarca «Registrar la venta ahora».");
        const r = await rpc("app_ganar_con_venta", { p: { oportunidad_id: opId, nota, venta } });
        toast(r.venta_id ? `¡Ganada! Venta de ${clp(venta.monto)} registrada` : "¡Ganada!");
      } else {
        await rpc("app_cerrar", { p: { oportunidad_id: opId, estado, motivo_codigo: m, nota } });
        toast("Marcada como perdida");
      }
      cargarAvisos(); after && after();
    }, ganar ? "Marcar ganada" : "Marcar perdida");
  if ($("#c-v", root)) $("#c-v", root).onchange = (e) => ($("#c-vbox", root).style.display = e.target.checked ? "" : "none");
}
function modalTarea(after, preset = {}) {
  const unis = (ME.unidades || []).filter((k) => UNIDADES[k]);
  const root = modal("Nueva tarea", `
    <div class="field"><label for="t-tit">Qué hay que hacer</label><input class="input" id="t-tit"></div>
    <div class="field"><label for="t-desc">Detalle</label><textarea class="input" id="t-desc" style="min-height:70px"></textarea></div>
    <div class="row"><div class="field"><label for="t-u">Unidad</label><select class="input" id="t-u">${unis.map((k) => `<option value="${k}" ${k === (preset.unidad || "grupo") ? "selected" : ""}>${uName(k)}</option>`).join("")}</select></div>
    <div class="field"><label for="t-resp">Responsable</label><input class="input" id="t-resp" value="${esc((ME.nombre || "").split(" ")[0])}"></div></div>
    <div class="row"><div class="field"><label for="t-v">Vence</label><input class="input" id="t-v" type="date" value="${diaHabil(1)}"></div>
    <div class="field"><span class="lbl">Prioridad</span>${seg("prio", [["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]], "media")}</div></div>`,
    async () => {
      if (!$("#t-tit").value.trim()) throw new Error("Escribe qué hay que hacer.");
      await rpc("app_crear_tarea", { p: { titulo: $("#t-tit").value.trim(), descripcion: $("#t-desc").value.trim() || null, unidad: $("#t-u").value, responsable: $("#t-resp").value.trim() || null, vence: $("#t-v").value || null, prioridad: segVal(root, "prio"), empresa_id: preset.empresa_id || null } });
      toast("Tarea creada"); cargarAvisos(); after && after();
    }, "Crear tarea");
  bindSeg(root);
}
function modalTraspaso(opId, after) {
  modal("Pasar a Asisma", `<p style="margin:0">El lead está caliente y confirmado. Desde aquí, la cotización, la venta y el cierre siguen en <b>Asisma</b>; Core guarda el traspaso para medir al setter.</p>
    <div class="field"><label for="tr-id">N° o ID en Asisma</label><input class="input" id="tr-id" placeholder="Opcional, se puede agregar después"></div>
    <div class="field"><label for="tr-n">Resumen de la reunión</label><textarea class="input" id="tr-n" style="min-height:70px" placeholder="Qué necesita, cuántos vehículos, próximos pasos"></textarea></div>`, async () => {
    await rpc("app_registrar_actividad", { p: { oportunidad_id: opId, tipo: "reunion", resultado: "reunion_agendada", nota: ($("#tr-n").value.trim() || "Reunión realizada") + " · traspaso a Asisma" } });
    await rpc("app_mover_etapa", { p: { oportunidad_id: opId, etapa: "en_asisma", asisma_id: $("#tr-id").value.trim() || null, proxima_accion: "Seguimiento en Asisma", proxima_fecha: diaHabil(7) } });
    toast("Traspasado a Asisma"); after && after(); modalAsisma(opId);
  }, "Traspasar");
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
    ["spark", "Bienvenido a Carclass Core", "Todo el grupo en un solo lugar: Carclass, Carwash.hf, NOM, BlackGPS y somosB2B. El menú de la izquierda está ordenado como tu día: analizar, vender, operar y cobrar."],
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
  if (location.hash.startsWith("#/c/")) return viewPublica(location.hash.slice(4).split(/[?/]/)[0]);
  if (location.hash.startsWith("#/t/")) return viewInformePublico(location.hash.slice(4).split(/[?/]/)[0]);
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { ME = null; viewLogin(); return; }
  if (!ME) {
    try { [ME, PARAM] = await Promise.all([rpc("app_yo"), rpc("app_parametros").catch(() => ({}))]); PARAM = PARAM || {}; } catch { ME = null; }
    if (!ME) {
      $("#app").innerHTML = `<div class="login-form" style="min-height:100vh"><div class="card" style="max-width:420px">${empty("team", "Tu usuario no tiene acceso a Carclass Core", "Pídele a Felipe que te habilite.")}<div style="text-align:center;padding:0 0 20px"><button class="btn" id="lo">Salir</button></div></div></div>`;
      $("#lo").onclick = async () => { await sb.auth.signOut(); render(); }; return;
    }
    const lg = lsGet("cc_linea", ""); UNI = unidadesMias().includes(lg) ? lg : ""; shell(); setLinea(UNI); cargarAvisos(); clearInterval(render._t); render._t = setInterval(cargarAvisos, 60000);
    setTimeout(() => onboarding(), 400);
    setTimeout(() => revisarPush().catch(() => {}), 1500);
  }
  const [path, qs] = (location.hash.slice(2) || "dashboard").split("?");
  const [r, a1, a2] = path.split("/");
  const params = new URLSearchParams(qs || "");
  window.scrollTo(0, 0);
  const R = { directorio: () => viewDirectorio(params), dashboard: () => viewDashboard(params), notificaciones: viewNotificaciones, bandeja: () => viewBandeja(params), conversaciones: () => viewConversaciones(a1),
    embudo: () => viewEmbudo(a1 || UNI || undefined, a2), cot: () => viewCot(a1), tasaciones: () => viewTasaciones(params), tasacion: () => a1 ? viewTasacion(a1) : viewTasaciones(params), herramientas: viewHerramientas, agenda: () => viewAgenda(params), cotizaciones: viewCotizaciones, clientes: () => viewClientes(params),
    cliente: () => a1 ? viewCliente(a1) : viewClientes(params), vehiculos: () => viewVehiculos(params), tareas: () => viewTareas(params),
    finanzas: () => viewFinanzas(params), flujo: () => viewFlujo(params), registro: () => viewRegistro(params), importar: viewImportar, equipo: viewEquipo, ayuda: () => viewAyuda(params) };
  return (R[r] || R.dashboard)();
}
window.addEventListener("hashchange", () => (ME || /^#\/[ct]\//.test(location.hash)) && render());
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
