// COPIA de wa-agente (proyecto carclass-whatsapp) tomada el 18-11-2026 solo para simulaciones de wa-simular. No editar aquí: la fuente es el repo carclass-whatsapp.
// Prompt de sistema del asesor. Fuente: prompts/asesor-sistema.md → scripts/sync-prompt.ps1 genera
// supabase/prompt/agente_prompt.sql, que guarda el texto en wa.config (clave agente_prompt).
// Es fijo (sin datos variables) para que el prompt caching funcione; el contexto va en el último turno.
import type postgres from "npm:postgres@3.4.4";

type Sql = ReturnType<typeof postgres>;
let cache: { at: number; texto: string } | null = null;

export async function promptSistema(sql: Sql): Promise<string> {
  if (cache && Date.now() - cache.at < 300_000) return cache.texto;
  const r = await sql`select valor from wa.config where clave = 'agente_prompt'`;
  const texto = r[0]?.valor as string | undefined;
  if (!texto || texto.length < 1000) throw new Error("Falta el prompt del agente en wa.config (agente_prompt)");
  cache = { at: Date.now(), texto };
  return texto;
}
