// Herramientas NOM del asesor (Fase 2, 20-nov-2026): tasación, visita en Chicureo y fee.
// La lógica vive en la base (core.api_nom_wa_*); aquí solo se arman las llamadas y se cruza el Google Calendar.
import type Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type postgres from "npm:postgres@3.4.4";
import { gcalConectado, ocupados, libres } from "./gcal.ts";

type Sql = ReturnType<typeof postgres>;
type Resultado = { ok: boolean; data?: unknown; error?: string };
// sim_nom: solo en wa-simular. Estado NOM ficticio (tasación enviada, etc.) que reemplaza a la base desde un turno dado.
interface Conv { id: string; unidad: string | null; nombre: string | null; ficha: Record<string, unknown>; sim_nom?: { desde_turno: number; estado: any }; sim_turno?: number }

const AUTOR = "Agente IA";

export const HERRAMIENTAS_NOM: Anthropic.Tool[] = [
  {
    name: "nom_solicitar_tasacion",
    description: "NOM consignante: con los datos del auto, pide la tasación. Core busca comparables vigentes y Felipe la aprueba; el informe se envía solo por WhatsApp. Úsala una vez, cuando tengas marca, modelo, año y km.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string" }, modelo: { type: "string" },
        version: { type: "string", description: "Versión o equipamiento si el cliente lo sabe (ej.: 2.0 R 2WD)." },
        anio: { type: "integer" }, km: { type: "integer" },
        transmision: { type: "string", enum: ["manual", "automatica"] },
        combustible: { type: "string", enum: ["bencina", "diesel", "hibrido", "electrico"] },
        patente: { type: "string" },
        precio_esperado: { type: "integer", description: "Precio que espera el cliente, en pesos (solo uso interno)." },
        duenos: { type: "string", description: "Único dueño, segundo dueño, etc." },
        observaciones: { type: "string", description: "Prenda, papeles, choques, mantenciones, urgencia: lo que haya dicho." },
      },
      required: ["marca", "modelo", "anio", "km"],
      additionalProperties: false,
    },
  },
  {
    name: "nom_estado",
    description: "NOM consignante: en qué va la tasación (en investigación, en revisión, enviada) y la visita agendada, si hay.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "nom_proponer_visita",
    description: "NOM consignante con tasación ya enviada: devuelve 2 horarios libres para la visita de inspección y fotos en la oficina de Chicureo, la dirección, la duración, cómo se cobra el fee y qué debe traer el cliente.",
    input_schema: {
      type: "object",
      properties: { desde: { type: "string", description: "Opcional: fecha mínima YYYY-MM-DD que pidió el cliente." },
                    preferencia: { type: "string", enum: ["manana", "tarde", "cualquiera"] } },
      additionalProperties: false,
    },
  },
  {
    name: "nom_reservar_visita",
    description: "Reserva el horario elegido (uno de los de nom_proponer_visita). Si había otra visita, la reemplaza.",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Fecha y hora local de Chile, formato YYYY-MM-DDTHH:MM." },
        nombre: { type: "string" },
        email: { type: "string", description: "Para enviarle la invitación del calendario (opcional)." },
      },
      required: ["inicio"],
      additionalProperties: false,
    },
  },
  {
    name: "nom_registrar_comprobante",
    description: "NOM: llegó el comprobante de transferencia del fee. Queda pendiente de validación por Felipe.",
    input_schema: { type: "object", properties: { monto: { type: "integer" }, nota: { type: "string" } }, additionalProperties: false },
  },
  {
    name: "nom_cancelar_visita",
    description: "NOM: el cliente cancela la visita (para reagendar usa nom_reservar_visita con el nuevo horario).",
    input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"], additionalProperties: false },
  },
];

export const NOM_SOLO_LECTURA = ["nom_estado", "nom_proponer_visita"];

export function crearNom(sql: Sql, conv: Conv, escribir: boolean) {
  const exigirNom = () => { if (conv.unidad !== "nom") throw new Error("Primero asigna la unidad NOM con asignar_unidad"); };
  const estadoNom = async (): Promise<any> => {
    if (!escribir && conv.sim_nom) return (conv.sim_turno ?? 0) >= conv.sim_nom.desde_turno ? conv.sim_nom.estado : { tasacion: null, visita: null };
    return (await sql`select core.api_nom_wa_estado(${conv.id}::uuid) as r`)[0].r;
  };
  // Condiciones comerciales desde core.parametros: el asesor las informa solo si el cliente pregunta
  const condiciones = async () => {
    const c = (await sql`select valor from core.parametros where clave = 'nom.comision'`)[0]?.valor ?? {};
    const clp = (n: number) => "$" + Number(n).toLocaleString("es-CL");
    return {
      comision: c.pct_hasta_umbral ? `${c.pct_hasta_umbral}% sobre los primeros ${clp(c.umbral_clp)} del precio de venta y ${c.pct_sobre_umbral}% sobre lo que exceda, con un mínimo de ${clp(c.minimo_clp)}, IVA incluido. Solo se cobra si se vende.` : null,
      fee: c.fee_entrada_clp ? `${clp(c.fee_entrada_clp)} de entrada (inspección, fotos y publicación), no reembolsable, se descuenta de la comisión si se vende.` : null,
      exclusividad: "45 días, con renovación automática.",
      regla: "Informa la comisión solo si el cliente la pregunta. No la negocies: si pide condiciones distintas, traspasa.",
    };
  };

  return {
    async nom_solicitar_tasacion(i: any): Promise<Resultado> {
      exigirNom();
      if (!escribir) return { ok: true, data: { simulado: true, folio: "NOM-TAS-SIM", estado: "en_investigacion" } };
      const r = (await sql`select core.api_nom_wa_solicitar_tasacion(${conv.id}::uuid, ${sql.json(i)}, ${AUTOR}) as r`)[0].r;
      return { ok: true, data: { ...r, instruccion: "No des cifras. Di que revisas el mercado de hoy con avisos reales comparables y que le envías el informe por aquí, normalmente durante el día hábil." } };
    },

    async nom_estado(): Promise<Resultado> {
      return { ok: true, data: { ...(await estadoNom()), condiciones: await condiciones() } };
    },

    async nom_proponer_visita(i: any): Promise<Resultado> {
      exigirNom();
      const est = await estadoNom();
      if (!est?.tasacion || !["aprobada", "enviada"].includes(est.tasacion.estado)) {
        return { ok: false, error: "La visita se agenda después de enviar el informe de tasación. Si aún no está, dile que se lo envías apenas esté listo." };
      }
      const desde = i?.desde && /^\d{4}-\d{2}-\d{2}$/.test(i.desde) ? new Date(`${i.desde}T00:00:00-03:00`) : new Date();
      const base = desde > new Date() ? desde : new Date();
      let cupos = (await sql`select inicio, fin, texto, to_char(inicio at time zone 'America/Santiago', 'YYYY-MM-DD"T"HH24:MI') local
                             from nom.cupos(${base})`) as any[];
      let calendario = "sin conexión (solo cupos de Core)";
      if (gcalConectado() && cupos.length) {
        try {
          const oc = await ocupados(new Date(cupos[0].inicio), new Date(cupos[cupos.length - 1].fin));
          cupos = libres(cupos, oc);
          calendario = "cruzado con Google Calendar";
        } catch (e) { calendario = `no se pudo leer (${String((e as any)?.message ?? e).slice(0, 80)})`; }
      }
      if (i?.preferencia === "manana") cupos = cupos.filter((c) => Number(c.local.slice(11, 13)) < 13);
      if (i?.preferencia === "tarde") cupos = cupos.filter((c) => Number(c.local.slice(11, 13)) >= 13);
      // Dos opciones en días distintos cuando se puede
      const opciones: any[] = [];
      for (const c of cupos) {
        if (opciones.length >= 2) break;
        if (opciones.length === 1 && opciones[0].inicio_local.slice(0, 10) === c.local.slice(0, 10) && cupos.some((x) => x.local.slice(0, 10) !== c.local.slice(0, 10))) continue;
        opciones.push({ inicio_local: c.local, texto: c.texto });
      }
      const [of, auto, tr] = await Promise.all([
        sql`select valor from core.parametros where clave = 'nom.oficina'`,
        sql`select valor from core.parametros where clave = 'nom.automatizacion'`,
        sql`select valor - 'usos' as v from core.parametros where clave = 'nom.transferencia'`,
      ]);
      const o = of[0]?.valor ?? {}, a = auto[0]?.valor ?? {};
      const alAgendar = a.fee_momento === "al_agendar";
      return {
        ok: true,
        data: {
          opciones, sin_cupo_cercano: opciones.length === 0, calendario,
          lugar: `${o.direccion}, ${o.sector}, ${o.comuna}`, duracion: "unas 2 horas",
          que_hacemos: "inspección completa (estética, mecánica y documentos) y fotos profesionales para la publicación",
          fee: { monto: a.fee_monto ?? 50000, momento: alAgendar ? "al_agendar" : "en_visita",
                 como_decirlo: alAgendar
                   ? `Para reservar la hora se transfiere el fee de $${Number(a.fee_monto ?? 50000).toLocaleString("es-CL")}; no es reembolsable y se descuenta de la comisión si se vende.`
                   : `El fee de $${Number(a.fee_monto ?? 50000).toLocaleString("es-CL")} se paga el día de la visita, por transferencia; no es reembolsable y se descuenta de la comisión si se vende.` },
          datos_transferencia: alAgendar ? tr[0]?.v ?? null : null,
          preparacion: o.preparacion_cliente ?? [],
        },
      };
    },

    async nom_reservar_visita(i: any): Promise<Resultado> {
      exigirNom();
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(i.inicio ?? ""))) return { ok: false, error: "Formato de inicio inválido (YYYY-MM-DDTHH:MM)" };
      if (!escribir) return { ok: true, data: { simulado: true, cuando: i.inicio, estado: "reservada" } };
      const r = (await sql`select core.api_nom_wa_reservar_visita(${conv.id}::uuid, ${sql.json({ inicio: i.inicio, nombre: i.nombre ?? null, email: i.email ?? null } as any)}, ${AUTOR}) as r`)[0].r;
      if (i.nombre || i.email) {
        await sql`update wa.conversaciones set ficha = ficha || ${sql.json({ ...(i.nombre ? { nombre: i.nombre } : {}), ...(i.email ? { email: i.email } : {}) } as any)} where id = ${conv.id}::uuid`;
      }
      return { ok: true, data: r };
    },

    async nom_registrar_comprobante(i: any): Promise<Resultado> {
      exigirNom();
      if (!escribir) return { ok: true, data: { simulado: true, estado: "pendiente de validación" } };
      const m = await sql`select id from wa.mensajes where conversacion_id = ${conv.id}::uuid and direccion = 'entrante' and tipo in ('image','document') order by enviado_en desc limit 1`;
      const r = (await sql`select core.api_nom_wa_comprobante(${conv.id}::uuid, ${sql.json({ monto: i?.monto ?? null, nota: i?.nota ?? null, mensaje_id: m[0]?.id ?? null } as any)}, ${AUTOR}) as r`)[0].r;
      return { ok: true, data: r };
    },

    async nom_cancelar_visita(i: any): Promise<Resultado> {
      exigirNom();
      if (!escribir) return { ok: true, data: { simulado: true } };
      const r = (await sql`select core.api_nom_wa_cancelar_visita(${conv.id}::uuid, ${i.motivo ?? "cliente"}, ${AUTOR}) as r`)[0].r;
      return { ok: true, data: r };
    },
  };
}
