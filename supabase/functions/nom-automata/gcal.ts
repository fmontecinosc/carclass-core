// Google Calendar de carclass.cl (fmontecinos@carclass.cl) a través de un Apps Script publicado por Felipe
// (integraciones/gcal-apps-script.gs). Secretos de la función: GCAL_SCRIPT_URL y GCAL_SCRIPT_SECRET.
// Sin esos secretos todo sigue funcionando: los cupos salen solo de Core y el evento queda como tarea para Felipe.

export type Ocupado = { inicio: string; fin: string; titulo?: string };

export function gcalConectado(): boolean {
  return !!(Deno.env.get("GCAL_SCRIPT_URL") && Deno.env.get("GCAL_SCRIPT_SECRET"));
}

async function llamar(accion: string, datos: Record<string, unknown>): Promise<any> {
  const url = Deno.env.get("GCAL_SCRIPT_URL")!;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // Apps Script no exige preflight con text/plain
    body: JSON.stringify({ secreto: Deno.env.get("GCAL_SCRIPT_SECRET"), accion, ...datos }),
    redirect: "follow",
  });
  const txt = await r.text();
  let j: any;
  try { j = JSON.parse(txt); } catch { throw new Error(`Calendario: respuesta no válida (${r.status}) ${txt.slice(0, 120)}`); }
  if (!j.ok) throw new Error(`Calendario: ${j.error ?? "error"}`);
  return j;
}

// Bloques ocupados (eventos con hora y feriados) entre dos instantes
export async function ocupados(desde: Date, hasta: Date): Promise<Ocupado[]> {
  const j = await llamar("ocupado", { desde: desde.toISOString(), hasta: hasta.toISOString() });
  return j.ocupados ?? [];
}

export async function crearEvento(e: { titulo: string; inicio: string; fin: string; descripcion: string; ubicacion: string; invitado?: string | null }): Promise<string> {
  const j = await llamar("crear", e);
  return String(j.id);
}

export async function cancelarEvento(id: string): Promise<void> {
  await llamar("cancelar", { id });
}

// Filtra cupos que chocan con el calendario
export function libres<T extends { inicio: string | Date; fin: string | Date }>(cupos: T[], oc: Ocupado[]): T[] {
  return cupos.filter((c) => {
    const a = new Date(c.inicio).getTime(), b = new Date(c.fin).getTime();
    return !oc.some((o) => new Date(o.inicio).getTime() < b && new Date(o.fin).getTime() > a);
  });
}
