// Prompt de sistema del asesor. Fuente: prompts/asesor-sistema.md → scripts/sync-prompt.ps1 genera
// supabase/prompt/agente_prompt.sql, que guarda el texto en wa.config (clave agente_prompt).
// Es fijo (sin datos variables) para que el prompt caching funcione; el contexto va en el último turno.
import type postgres from "npm:postgres@3.4.4";

type Sql = ReturnType<typeof postgres>;
let cache: { at: number; texto: string } | null = null;

export async function promptSistema(sql: Sql): Promise<string> {
  if (cache && Date.now() - cache.at < 60_000) return cache.texto;
  const r = await sql`select clave, valor from wa.config where clave in ('agente_prompt', 'agente_reglas_felipe')`;
  const base = r.find((x: any) => x.clave === "agente_prompt")?.valor as string | undefined;
  if (!base || base.length < 1000) throw new Error("Falta el prompt del agente en wa.config (agente_prompt)");
  // Reglas que Felipe da desde el chat de instrucciones (supervisor.ts): se suman al final y priman sobre lo anterior
  let reglas: { texto: string; desde: string }[] = [];
  try { reglas = JSON.parse((r.find((x: any) => x.clave === "agente_reglas_felipe")?.valor as string) ?? "[]"); } catch { reglas = []; }
  const texto = reglas.length
    ? `${base}\n\n## Instrucciones vigentes de Felipe (priman sobre lo anterior si hay conflicto)\n${reglas.map((x) => `- ${x.texto} (desde ${x.desde})`).join("\n")}`
    : base;
  cache = { at: Date.now(), texto };
  return texto;
}
