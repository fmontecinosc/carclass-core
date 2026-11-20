// Kapso (proxy de la Cloud API de Meta): enviar texto, descargar media.
// Docs: https://docs.kapso.ai — base https://api.kapso.ai/meta/whatsapp, Graph v24.0, cabecera X-API-Key.
const BASE = "https://api.kapso.ai/meta/whatsapp/v24.0";

function clave(): string {
  const k = Deno.env.get("KAPSO_API_KEY");
  if (!k) throw new Error("Falta el secreto KAPSO_API_KEY");
  return k.trim();
}

export async function enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<{ wamid: string | null }> {
  const r = await fetch(`${BASE}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "X-API-Key": clave(), "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para.replace(/^\+/, ""), type: "text", text: { body: texto, preview_url: false } }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Kapso ${r.status}: ${JSON.stringify(j?.error ?? j).slice(0, 300)}`);
  return { wamid: j?.messages?.[0]?.id ?? null };
}

export const pausa = (min = 2000, max = 4000) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
