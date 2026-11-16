// core-push — envía avisos Web Push a los dispositivos suscritos (core.push_suscripciones).
// La llama la base (core.push, por pg_net) con la cabecera x-push-secret. Claves VAPID y secreto en Supabase Vault.
// Publicar: supabase functions deploy core-push --no-verify-jwt --project-ref tvjpwwwnpchecolcsnxp
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.4";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
let claves: Record<string, string> | null = null;

async function cargarClaves() {
  if (claves) return claves;
  const rows = await sql`select name, decrypted_secret from vault.decrypted_secrets where name in ('push_vapid_publica', 'push_vapid_privada', 'push_secreto')`;
  claves = Object.fromEntries(rows.map((r: any) => [r.name, r.decrypted_secret]));
  webpush.setVapidDetails("https://carclass-core.netlify.app", claves.push_vapid_publica, claves.push_vapid_privada);
  return claves;
}

function igual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Método no permitido", { status: 405 });
  try {
    const k = await cargarClaves();
    if (!igual(req.headers.get("x-push-secret") ?? "", k.push_secreto ?? "")) return new Response("No autorizado", { status: 401 });
    const aviso = await req.json();
    const carga = JSON.stringify({ title: String(aviso.title ?? "Carclass Core").slice(0, 120), body: String(aviso.body ?? "").slice(0, 300), href: aviso.href ?? "#/bandeja", tag: aviso.tag });
    const subs = await sql`select id, endpoint, p256dh, auth from core.push_suscripciones where activa`;
    let ok = 0, fallos = 0;
    await Promise.all(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 3600, urgency: "high" });
        ok++;
        await sql`update core.push_suscripciones set ultimo_envio = now(), fallos = 0 where id = ${s.id}`;
      } catch (e: any) {
        fallos++;
        const muerta = e?.statusCode === 404 || e?.statusCode === 410;
        await sql`update core.push_suscripciones set fallos = fallos + 1, activa = case when ${muerta} or fallos >= 9 then false else activa end where id = ${s.id}`;
      }
    }));
    return Response.json({ ok: true, enviados: ok, fallos });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error).message ?? e) }, { status: 500 });
  }
});
