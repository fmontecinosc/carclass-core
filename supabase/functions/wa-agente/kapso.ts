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

// Descarga un archivo recibido (id de media de Meta). Devuelve base64 y tipo, o null si no se pudo.
export async function descargarMedia(mediaId: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const meta = await fetch(`${BASE}/${mediaId}`, { headers: { "X-API-Key": clave() } });
    if (!meta.ok) return null;
    const info: any = await meta.json();
    if (!info?.url) return null;
    const bin = await fetch(info.url, { headers: { "X-API-Key": clave() } });
    if (!bin.ok) return null;
    const buf = new Uint8Array(await bin.arrayBuffer());
    if (buf.byteLength > 4_500_000) return null; // límite razonable para la API
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { base64: btoa(s), mime: String(info.mime_type ?? bin.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
  } catch {
    return null;
  }
}

export const pausa = (min = 2000, max = 4000) => new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
