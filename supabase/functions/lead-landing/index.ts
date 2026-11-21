// lead-landing — recibe el webhook del formulario Elementor de la landing BlackGPS (carclass.cl/black-gps)
// y lo pasa a core-api/lead-web ya normalizado (nombre, empresa, telefono, email, flota, mensaje…).
// Elementor manda los campos por etiqueta («Nombre», «Teléfono»…), por ID o, en modo avanzado, como fields[id][value].
// La clave (?k=…) es la de la landing: solo permite crear leads de BlackGPS. Publicar con verify_jwt = false.
const CORE = (Deno.env.get("SUPABASE_URL") ?? "https://tvjpwwwnpchecolcsnxp.supabase.co") + "/functions/v1/core-api/lead-web";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, x-api-key", "Access-Control-Allow-Methods": "POST, OPTIONS" };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// orden importa: «empresa» antes que «nombre» («nombre de la empresa»), «correo» antes que «telefono»
const REGLAS: [string, RegExp][] = [
  ["utm_campaign", /^utm campaign$/], ["utm_source", /^utm source$/], ["utm_medium", /^utm medium$/], ["utm_content", /^utm content$/],
  ["website", /^(website|empresa web)$/],
  ["empresa", /empresa|compan|razon social|negocio/],
  ["email", /correo|e ?mail/],
  ["telefono", /telefono|whats|celular|fono|phone|movil/],
  ["rut", /^rut\b/],
  ["cargo", /cargo|puesto/],
  ["flota", /flota|vehicul|cantidad|unidades|camiones/],
  ["comuna", /comuna|ciudad|region/],
  ["mensaje", /mensaje|coment|necesit|consulta|message|detalle/],
  ["nombre", /nombre|name|contacto/],
];
const campo = (k: string) => { const n = norm(k); for (const [c, re] of REGLAS) if (re.test(n)) return c; return null; };

async function leer(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  const raw: Record<string, string> = {};
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    const plano = (o: any, p = "") => { for (const [k, v] of Object.entries(o ?? {})) { const kk = p ? `${p}[${k}]` : k; if (v && typeof v === "object") plano(v, kk); else raw[kk] = String(v ?? ""); } };
    plano(j);
  } else {
    const fd = await req.formData().catch(() => null);
    fd?.forEach((v, k) => (raw[k] = String(v)));
  }
  const out: Record<string, string> = {};
  // modo avanzado de Elementor: fields[id][value] con fields[id][title] como etiqueta
  const ids = new Set(Object.keys(raw).map((k) => k.match(/^fields\[([^\]]+)\]\[value\]$/)?.[1]).filter(Boolean) as string[]);
  for (const id of ids) {
    const v = raw[`fields[${id}][value]`] ?? "", t = raw[`fields[${id}][title]`] ?? id;
    const c = campo(t) ?? campo(id); if (c && v && !out[c]) out[c] = v;
  }
  // modo simple (etiquetas o IDs como clave) y formularios propios
  for (const [k, v] of Object.entries(raw)) {
    if (k.startsWith("fields[") || k.startsWith("form[") || k.startsWith("meta[")) continue;
    const c = campo(k.replace(/^form_fields\[|\]$/g, "")); if (c && v && !out[c]) out[c] = v;
  }
  out._pagina = raw["Page URL"] || raw["meta[page_url][value]"] || req.headers.get("referer") || "";
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405, headers: cors });
  const k = new URL(req.url).searchParams.get("k") || req.headers.get("x-api-key") || "";
  const f = await leer(req);
  if (f.website) return Response.json({ ok: true }, { headers: cors }); // trampa anti-spam
  if (!f.telefono && !f.email) return Response.json({ ok: false, error: "Falta teléfono o correo" }, { status: 400, headers: cors });
  const pagina = f._pagina; delete f._pagina;
  const body = { ...f, unidad: "blackgps", origen: "Landing BlackGPS · formulario", mensaje: [f.mensaje, pagina ? `Página: ${pagina}` : ""].filter(Boolean).join(" · ") };
  const r = await fetch(CORE, { method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": k }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return Response.json(j, { status: r.status, headers: cors });
});
