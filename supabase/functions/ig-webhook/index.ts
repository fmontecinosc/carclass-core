// ig-webhook — receptor de mensajes directos de Instagram (Meta, Instagram API con inicio de sesión de Instagram).
// GET: verificación del webhook (hub.verify_token = wa.config.ig_verify_token, responde hub.challenge).
// POST: guarda el evento en wa.ig_eventos (firma X-Hub-Signature-256 con el secreto de la app, si está IG_APP_SECRET).
// Fase 1: solo recibe y guarda. Fase 2: crear conversación/lead y que responda el asesor (canal instagram).
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });

async function firmaValida(cuerpo: string, firma: string | null): Promise<boolean | null> {
  const secreto = Deno.env.get("IG_APP_SECRET");
  if (!secreto) return null; // aún sin secreto: se guarda igual, marcado como no verificado
  if (!firma?.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(cuerpo)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === firma.slice(7);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const esperado = (await sql`select valor from wa.config where clave = 'ig_verify_token'`)[0]?.valor;
      if (url.searchParams.get("hub.mode") === "subscribe" && esperado && url.searchParams.get("hub.verify_token") === esperado) {
        return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
      }
      return new Response("Token de verificación inválido", { status: 403 });
    }
    if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
    const cuerpo = await req.text();
    const ok = await firmaValida(cuerpo, req.headers.get("x-hub-signature-256"));
    if (ok === false) return new Response("Firma inválida", { status: 401 });
    let payload: unknown;
    try { payload = JSON.parse(cuerpo); } catch { return new Response("JSON inválido", { status: 400 }); }
    await sql`insert into wa.ig_eventos (firma_ok, payload) values (${ok}, ${sql.json(payload as any)})`;
    return new Response("EVENT_RECEIVED", { status: 200 });
  } catch (e) {
    return new Response("Error", { status: 500 });
  }
});
