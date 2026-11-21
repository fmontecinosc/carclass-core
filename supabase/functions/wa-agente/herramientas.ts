// Herramientas del asesor: definiciones (para Claude) e implementación contra Carclass Core.
// En modo simulación (eval) las de solo lectura consultan la base real y las de escritura no tocan nada.
import type Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type postgres from "npm:postgres@3.4.4";
import { HERRAMIENTAS_NOM, NOM_SOLO_LECTURA, crearNom } from "./nom.ts";
import { pdfPpf, pdfCotizacion, subirDocumento, nombreArchivo } from "./documentos.ts";

type Sql = ReturnType<typeof postgres>;
export type Resultado = { ok: boolean; data?: unknown; error?: string };
export type Accion = { herramienta: string; input: unknown; resultado: Resultado };

export interface Conversacion {
  id: string;
  estado: string;
  unidad: string | null;
  flujo: string | null;
  oportunidad_id: string | null;
  empresa_id: string | null;
  nombre: string | null;
  telefono_norm: string | null;
  ficha: Record<string, unknown>;
}

export interface OpcionesEjecutor {
  sql: Sql;
  conv: Conversacion;
  modo: string;            // observar | borrador | activo
  simular?: boolean;       // eval: no escribe nada
  ahora?: Date;
}

const AUTOR = "Agente IA";
const TZ = "America/Santiago";

// ---------------------------------------------------------------------------------------------
// Definiciones (orden fijo: forma parte del prefijo cacheado)
// ---------------------------------------------------------------------------------------------
export const HERRAMIENTAS: Anthropic.Tool[] = [
  {
    name: "asignar_unidad",
    description: "Asigna la unidad de negocio a la conversación y crea el lead en Carclass Core. Úsala apenas sepas la unidad si aún no está asignada.",
    input_schema: {
      type: "object",
      properties: {
        unidad: { type: "string", enum: ["carclass", "nom", "blackgps", "carwash"] },
        flujo: { type: "string", enum: ["consignante", "comprador"], description: "Solo para NOM." },
      },
      required: ["unidad"],
      additionalProperties: false,
    },
  },
  {
    name: "actualizar_ficha",
    description: "Guarda datos que dio el cliente (nombre, correo, marca, modelo, anio, patente, servicio_interes, comuna, uso, urgencia, notas). Llámala cada vez que aparezca un dato nuevo.",
    input_schema: {
      type: "object",
      properties: {
        campos: {
          type: "object",
          description: "Pares campo → valor. Campos sugeridos: nombre, email, marca, modelo, anio, patente, servicio_interes, comuna, uso, urgencia, notas.",
          additionalProperties: { type: ["string", "number", "boolean"] },
        },
      },
      required: ["campos"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_catalogo",
    description: "Catálogo vigente con precios con IVA. Devuelve si el precio es aproximado y si requiere validación humana. Úsala antes de mencionar cualquier precio que no sea PPF por modelo.",
    input_schema: {
      type: "object",
      properties: {
        unidad: { type: "string", enum: ["carclass", "nom", "carwash"] },
        codigo: { type: "string", description: "Opcional: código exacto (ej. protect_plus, ceramico_4, laminas_8)." },
      },
      required: ["unidad"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_ppf_modelo",
    description: "Precio público XPEL por modelo de auto (planillas del taller): kits de PPF en Gloss y Ultimate/Stealth, y los paquetes Shield y Protection Pack ya calculados. Úsala antes de dar cualquier precio de PPF o de esos paquetes.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string" },
        modelo: { type: "string" },
        anio: { type: "integer" },
      },
      required: ["marca", "modelo"],
      additionalProperties: false,
    },
  },
  {
    name: "enviar_cotizacion_ppf",
    description: "Arma y envía al cliente el PDF de cotización de PPF de su modelo: kit frontal completo y completo exterior en XPEL Gloss y XPEL Ultimate (Ultimate Plus 8) (precios públicos de la planilla del taller), más Shield y Protection Pack. Solo si consultar_ppf_modelo encontró planilla. El documento se envía solo después de tu mensaje.",
    input_schema: {
      type: "object",
      properties: {
        marca: { type: "string" },
        modelo: { type: "string" },
        anio: { type: "integer" },
        incluir_reducido: { type: "boolean", description: "Solo si el cliente pidió el kit frontal reducido." },
      },
      required: ["marca", "modelo"],
      additionalProperties: false,
    },
  },
  {
    name: "consultar_stock_nom",
    description: "Autos disponibles en NOM (marca, modelo, año, km, precio publicado). Nunca menciones autos que no salgan de aquí.",
    input_schema: {
      type: "object",
      properties: {
        busqueda: { type: "string", description: "Texto libre: marca, modelo o tipo." },
        precio_max: { type: "integer" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "crear_cotizacion",
    description: "Crea (o actualiza, si ya hay una abierta en esta conversación) la cotización de Carclass en Core con los ítems y precios que ya obtuviste de las herramientas. Genera el PDF de la cotización, que se envía al cliente por WhatsApp después de tu mensaje. Devuelve número y vigencia.",
    input_schema: {
      type: "object",
      properties: {
        vehiculo: { type: "string", description: "Marca, modelo y año." },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              codigo: { type: "string" },
              descripcion: { type: "string" },
              precio: { type: "integer", description: "CLP con IVA." },
              cantidad: { type: "integer" },
            },
            required: ["descripcion", "precio"],
            additionalProperties: false,
          },
        },
        notas: { type: "string" },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
  {
    name: "proponer_horarios",
    description: "Devuelve 2 horarios con cupo para recibir el auto, los lugares de recepción, plazos aproximados, política de retiro, condiciones de pago y datos de transferencia. Úsala antes de ofrecer fechas o explicar el pago.",
    input_schema: {
      type: "object",
      properties: {
        servicio: { type: "string", enum: ["ceramico", "ppf_frontal", "laminas", "ppf_total", "otro"] },
        lugar: { type: "string", enum: ["taller", "chicureo"], description: "Por defecto taller." },
        desde: { type: "string", description: "Opcional: fecha mínima YYYY-MM-DD que pidió el cliente." },
      },
      required: ["servicio"],
      additionalProperties: false,
    },
  },
  {
    name: "reservar_cita",
    description: "Reserva el horario elegido (uno de los que entregó proponer_horarios) después de recibir el comprobante de la reserva.",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Fecha y hora local de Chile, formato YYYY-MM-DDTHH:MM." },
        servicio: { type: "string", enum: ["ceramico", "ppf_frontal", "laminas", "ppf_total", "otro"] },
        lugar: { type: "string", enum: ["taller", "chicureo", "retiro"] },
        email_cliente: { type: "string" },
      },
      required: ["inicio", "servicio", "lugar"],
      additionalProperties: false,
    },
  },
  {
    name: "registrar_comprobante",
    description: "Registra que llegó un comprobante de transferencia (queda pendiente de validación por Felipe).",
    input_schema: {
      type: "object",
      properties: { monto: { type: "integer" }, nota: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "programar_seguimiento",
    description: "Programa los seguimientos según el plan de la unidad (Carclass: 23 h, día 3, día 7, día 10 se marca perdida; BlackGPS: día 1, 4, 10 y 21). Úsala al enviar una cotización, cuando el cliente pide tiempo o, en BlackGPS, cuando la conversación queda en pausa.",
    input_schema: {
      type: "object",
      properties: { idea: { type: "string", description: "Qué aporte nuevo conviene en el seguimiento." } },
      required: ["idea"],
      additionalProperties: false,
    },
  },
  {
    name: "traspasar_humano",
    description: "Pasa el caso a Felipe: crea una tarea con la nota y pausa al agente 12 h en esta conversación.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        nota: { type: "string", description: "[Lead caliente] Nombre · auto · qué quiere · qué ofrecí · qué falta para cerrar" },
        prioridad: { type: "string", enum: ["alta", "media", "baja"] },
      },
      required: ["motivo", "nota"],
      additionalProperties: false,
    },
  },
  {
    name: "marcar_personal",
    description: "El chat es personal (no de negocio): se marca como personal, se borra el contenido guardado y no se responde.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "descartar",
    description: "Cierra el lead como perdido con un motivo de la lista fija.",
    input_schema: {
      type: "object",
      properties: {
        motivo_codigo: { type: "string", enum: ["precio", "competencia", "sin_respuesta", "fuera_zona", "no_califica", "desistio", "datos_erroneos", "duplicado", "otro"] },
        nota: { type: "string" },
      },
      required: ["motivo_codigo"],
      additionalProperties: false,
    },
  },
  // NOM consignante (Fase 2): tasación, visita en Chicureo y fee
  ...HERRAMIENTAS_NOM,
];

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------
const norm = (t: string) =>
  t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

// Normaliza nombres de modelo como en crm.ppf_modelos.modelo_norm (marcas abreviadas como en las planillas)
const ALIAS: Record<string, string> = { mercedes: "mb", benz: "", volkswagen: "vw", chevrolet: "chevy" };
export function normModelo(t: string) {
  return norm(t.replace(/mercedes[- ]benz/gi, "mercedes"))
    .split(" ").map((w) => (w in ALIAS ? ALIAS[w] : w)).filter(Boolean).join(" ");
}

async function parametro(sql: Sql, clave: string): Promise<any> {
  const r = await sql`select valor from core.parametros where clave = ${clave}`;
  return r[0]?.valor ?? null;
}

const redondearMil = (n: number) => Math.round(n / 1000) * 1000;

// Fecha local de Chile (YYYY-MM-DD, día de semana 0=domingo) para un instante
function partesChile(d: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { fecha: `${p.year}-${p.month}-${p.day}`, dow: dias[p.weekday as string], hora: Number(p.hour) };
}

// Instante UTC para una hora local de Chile (maneja horario de verano consultando el offset real)
function instanteChile(fecha: string, hhmm: string): Date {
  const guess = new Date(`${fecha}T${hhmm}:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "shortOffset" })
    .formatToParts(guess).find((x) => x.type === "timeZoneName")?.value ?? "GMT-3";
  const m = off.match(/GMT([+-]\d+)(?::(\d+))?/);
  const horas = m ? Number(m[1]) : -3;
  const mins = m && m[2] ? Number(m[2]) * Math.sign(horas) : 0;
  return new Date(guess.getTime() - (horas * 60 + mins) * 60_000);
}

function sumarDias(fecha: string, n: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function textoFecha(d: Date) {
  return new Intl.DateTimeFormat("es-CL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);
}

// ---------------------------------------------------------------------------------------------
// Ejecutor
// ---------------------------------------------------------------------------------------------
export function crearEjecutor(o: OpcionesEjecutor) {
  const { sql, conv } = o;
  const simular = !!o.simular;
  const ahora = o.ahora ?? new Date();
  const escribir = !simular;

  async function moverEtapa(etapa: string, extra: Record<string, unknown> = {}) {
    if (!escribir || !conv.oportunidad_id) return;
    const prox = sumarDias(partesChile(ahora).fecha, 1);
    await sql`select core.api_mover_etapa(${sql.json({ oportunidad_id: conv.oportunidad_id, etapa, proxima_fecha: prox, ...extra } as any)}, ${AUTOR})`;
  }

  const impl: Record<string, (i: any) => Promise<Resultado>> = {
    async asignar_unidad(i) {
      if (conv.unidad && conv.oportunidad_id) return { ok: true, data: { ya_asignada: conv.unidad } };
      if (!escribir) { conv.unidad = i.unidad; return { ok: true, data: { simulado: true, unidad: i.unidad } }; }
      const r = await sql`select wa.asignar_unidad(${conv.id}::uuid, ${i.unidad}, ${i.flujo ?? null}, ${AUTOR}) as r`;
      const res = r[0].r;
      conv.unidad = i.unidad; conv.flujo = i.flujo ?? null;
      conv.oportunidad_id = res?.oportunidad_id ?? conv.oportunidad_id;
      conv.empresa_id = res?.cliente_id ?? conv.empresa_id;
      return { ok: true, data: { unidad: i.unidad, lead_creado: true } };
    },

    async actualizar_ficha(i) {
      const campos = (i.campos ?? {}) as Record<string, unknown>;
      conv.ficha = { ...conv.ficha, ...campos };
      if (!escribir) return { ok: true, data: { simulado: true } };
      await sql`update wa.conversaciones set ficha = ficha || ${sql.json(campos as any)},
                  nombre = coalesce(nombre, ${(campos.nombre as string) ?? null}), actualizado_en = now()
                where id = ${conv.id}::uuid`;
      if (conv.empresa_id && typeof campos.email === "string") {
        await sql`update crm.empresas set email = coalesce(email, ${campos.email}) where id = ${conv.empresa_id}::uuid`;
      }
      if (conv.empresa_id && typeof campos.comuna === "string") {
        await sql`update crm.empresas set comuna = coalesce(comuna, ${campos.comuna}) where id = ${conv.empresa_id}::uuid`;
      }
      if (conv.oportunidad_id) {
        const op = await sql`select etapa from crm.oportunidades where id = ${conv.oportunidad_id}::uuid`;
        if (op[0]?.etapa === "nuevo") await moverEtapa("calificando", { proxima_accion: "Calificar y recomendar" });
      }
      return { ok: true };
    },

    async consultar_catalogo(i) {
      const filas = await sql`
        select codigo, nombre, tipo, descripcion, precio, aproximado, requiere_humano
        from crm.catalogo
        where activo and unidad = ${i.unidad} and (${i.codigo ?? null}::text is null or codigo = ${i.codigo ?? null})
        order by orden`;
      // Página web del servicio (carclass.enlaces): para compartirla una vez si el cliente no llegó desde ahí
      const enlaces = await parametro(sql, "carclass.enlaces");
      const items = filas.map((f: any) => ({ ...f, enlace: enlaces?.por_codigo?.[f.codigo] ?? null }));
      return { ok: true, data: { moneda: "CLP con IVA", items } };
    },

    async consultar_ppf_modelo(i) {
      // "CX-5" → "cx5", "Mazda 3" → "mazda3": se une letra+número y se compara contra el nombre sin espacios
      const crudas = normModelo(`${i.marca} ${i.modelo}`).split(" ").filter((w) => w.length > 0);
      const palabras: string[] = [];
      for (const w of crudas) {
        const prev = palabras[palabras.length - 1];
        if (prev && /^\d{1,3}[a-z]?$/.test(w) && /[a-z]$/.test(prev)) palabras[palabras.length - 1] = prev + w;
        else palabras.push(w);
      }
      const buscar = (ws: string[]) => sql`
        select modelo, modelo_norm, fecha_planilla, material, kit, precio_publico, drive_file_id
        from crm.ppf_modelos
        where not es_pieza
          and not exists (select 1 from unnest(${ws}::text[]) w where position(w in replace(modelo_norm, ' ', '')) = 0)
        order by fecha_planilla desc nulls last`;
      // Calce por palabra completa: «x3» no debe calzar con «ix3» ni «cx3» con «cx30». Se aceptan palabras sueltas
      // o pares unidos del nombre de la planilla («cx 5» = «cx5»); si ninguna planilla calza así, se usa el calce amplio.
      const exactas = (fs: any[], ws: string[]) => fs.filter((f) => {
        const t = String(f.modelo_norm).split(" ");
        const set = new Set([...t, ...t.slice(1).map((x, k) => t[k] + x)]);
        return ws.every((w) => set.has(w));
      });
      const afinar = (fs: any[], ws: string[]) => { const e = exactas(fs, ws); return e.length ? e : fs; };
      let filas = afinar(await buscar(palabras), palabras);
      // Sin calce: se prueba sin la marca (las planillas a veces la abrevian)
      if (filas.length === 0 && palabras.length > 1) filas = afinar(await buscar(palabras.slice(1)), palabras.slice(1));
      const cat = await sql`select codigo, precio from crm.catalogo where activo and unidad = 'carclass' and codigo in ('ceramico_4','laminas','laminas_8','ppf_frontal','ppf_frontal_reducido','shield','protection_pack')`;
      const precio = (c: string) => Number(cat.find((x: any) => x.codigo === c)?.precio ?? 0);
      if (filas.length === 0) {
        // Estimado: mediana del kit frontal Gloss de la misma marca en planillas recientes; si no hay, el referencial del catálogo
        const marca = normModelo(String(i.marca ?? "")).split(" ")[0] ?? "";
        const med = marca ? await sql`
          select percentile_cont(0.5) within group (order by precio_publico)::int kit5, count(*)::int n
          from crm.ppf_modelos where not es_pieza and material = 'gloss' and kit = 'kit_frontal_5' and precio_publico > 0
            and split_part(modelo_norm, ' ', 1) = ${marca} and fecha_planilla >= current_date - interval '3 years'` : [];
        const kit5 = med[0]?.n >= 2 ? redondearMil(Number(med[0].kit5)) : precio("ppf_frontal");
        const cer4 = precio("ceramico_4"), lam4 = precio("laminas");
        const vehiculo = [i.marca, i.modelo, i.anio].filter(Boolean).join(" ");
        if (escribir) {
          const titulo = `[PPF] Pedir planilla a Hiendcar · ${vehiculo}`;
          const ya = await sql`select 1 from ops.tareas where titulo = ${titulo} and estado in ('pendiente','en_curso') limit 1`.catch(() => []);
          if (ya.length === 0) {
            await sql`select core.api_crear_tarea(${sql.json({
              titulo, descripcion: `El cliente ${conv.nombre ?? conv.telefono_norm ?? ""} pidió PPF para un ${vehiculo} y no hay planilla de ese modelo. El asesor le dio un valor estimado; pide la planilla a Hiendcar y confirma el valor al cliente.`,
              unidad: "carclass", responsable: "Felipe", vence: partesChile(ahora).fecha, prioridad: "alta",
              oportunidad_id: conv.oportunidad_id, empresa_id: conv.empresa_id,
            } as any)}, ${AUTOR})`;
          }
        }
        return {
          ok: true,
          data: {
            encontrado: false,
            instruccion: "No tenemos la planilla de este modelo. Da el kit frontal como valor estimado («aproximadamente» o «desde»), di que confirmas el valor exacto con el taller y le escribes apenas lo tengas, y sigue la conversación (no traspases ni envíes PDF). Ya quedó la tarea para pedir la planilla.",
            estimado: {
              base: med[0]?.n >= 2 ? `mediana de ${med[0].n} planillas de la misma marca` : "valor referencial del catálogo",
              ppf_kit_frontal_gloss: kit5,
              carclass_shield: redondearMil((kit5 + cer4) * 0.95),
              carclass_protection_pack_laminas_4_micras: redondearMil((kit5 + cer4 + lam4) * 0.95),
            },
          },
        };
      }
      // Planillas distintas que calzan: se elige la que mejor calza con el año pedido
      const porArchivo = new Map<string, any[]>();
      for (const f of filas) { const k = f.drive_file_id as string; if (!porArchivo.has(k)) porArchivo.set(k, []); porArchivo.get(k)!.push(f); }
      const candidatos = [...porArchivo.values()];
      let elegido = candidatos[0];
      if (i.anio) {
        const conAnio = candidatos.find((c) => String(c[0].modelo).includes(String(i.anio)));
        if (conAnio) elegido = conAnio;
      }
      const kit = (mat: string, k: string) => Number(elegido.find((f: any) => f.material === mat && f.kit === k)?.precio_publico ?? 0) || null;
      const kit5g = kit("gloss", "kit_frontal_5");
      const desc = 0.95;
      const cer4 = precio("ceramico_4"), lam4 = precio("laminas");
      return {
        ok: true,
        data: {
          encontrado: true,
          modelo_planilla: elegido[0].modelo,
          otros_modelos_parecidos: candidatos.length > 1 ? candidatos.filter((c) => c !== elegido).map((c) => c[0].modelo).slice(0, 4) : [],
          moneda: "CLP con IVA, instalación incluida",
          xpel_gloss: { kit_frontal_reducido: kit("gloss", "kit_frontal_reducido"), kit_frontal_5_piezas: kit5g, completo_exterior_wpf: kit("gloss", "completo_wpf") },
          xpel_ultimate_o_stealth_solo_si_lo_pide: { kit_frontal_reducido: kit("ultimate_stealth", "kit_frontal_reducido"), kit_frontal_5_piezas: kit("ultimate_stealth", "kit_frontal_5"), completo_exterior_wpf: kit("ultimate_stealth", "completo_wpf") },
          paquetes: kit5g ? {
            carclass_shield: redondearMil((kit5g + cer4) * desc),
            carclass_protection_pack_laminas_4_micras: redondearMil((kit5g + cer4 + lam4) * desc),
            nota: "Paquetes con su descuento ya incluido. Sin descuentos adicionales.",
          } : null,
          ppf_total: "El PPF total es el completo exterior de esta planilla (va en el PDF): da ese valor si lo piden, sujeto a revisión del auto en la recepción. No traspases por eso.",
        },
      };
    },

    async enviar_cotizacion_ppf(i) {
      const r: any = await impl.consultar_ppf_modelo(i);
      const d = r?.data;
      if (!d?.encontrado) return { ok: false, error: "No hay planilla de este modelo: da el valor estimado de consultar_ppf_modelo en el texto, sin PDF." };
      const g = d.xpel_gloss, u = d.xpel_ultimate_o_stealth_solo_si_lo_pide;
      const filas = [
        ...(i.incluir_reducido ? [{ nombre: "Kit frontal reducido", detalle: "Parachoques delantero y focos, con capó y guardabarros parciales.", gloss: g.kit_frontal_reducido, ultimate: u.kit_frontal_reducido }] : []),
        { nombre: "Kit frontal completo", detalle: "Capó, guardabarros, espejos, parachoques y focos delanteros.", gloss: g.kit_frontal_5_piezas, ultimate: u.kit_frontal_5_piezas },
        { nombre: "Completo exterior", detalle: "Todas las piezas pintadas del auto.", gloss: g.completo_exterior_wpf, ultimate: u.completo_exterior_wpf },
      ].filter((f) => f.gloss || f.ultimate);
      const pq = d.paquetes;
      const paquetes = pq ? [
        { nombre: "Carclass Shield", detalle: "Kit frontal completo + sellado cerámico 4 años con corrección de pintura e informe técnico.", precio: pq.carclass_shield },
        { nombre: "Carclass Protection Pack", detalle: "Shield + láminas de seguridad 4 micras, en una sola visita.", precio: pq.carclass_protection_pack_laminas_4_micras },
      ] : [];
      const vehiculo = [i.marca, i.modelo, i.anio].filter(Boolean).join(" ");
      // Un solo PDF por auto y conversación (en el mismo turno o en los últimos 7 días)
      const archivo = nombreArchivo(vehiculo);
      const enviados: Set<string> = ((conv as any).ppf_enviados ??= new Set<string>());
      const yaEnviado = enviados.has(archivo) || (escribir && (await sql`
        select 1 from wa.mensajes where conversacion_id = ${conv.id}::uuid and tipo = 'document'
          and texto like ${"[Documento] " + archivo + "%"} and enviado_en > now() - interval '7 days' limit 1`).length > 0);
      if (yaEnviado) return { ok: true, data: { ya_enviado: true, instruccion: "Este PDF ya se le envió al cliente: no lo menciones como nuevo ni lo reenvíes." } };
      enviados.add(archivo);
      const hoy = partesChile(ahora).fecha, vig = sumarDias(hoy, 7);
      const larga = (f: string) => new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${f}T12:00:00Z`));
      const resumen = { vehiculo, modelo_planilla: d.modelo_planilla, kit_frontal: { gloss: g.kit_frontal_5_piezas, ultimate: u.kit_frontal_5_piezas }, completo_exterior: { gloss: g.completo_exterior_wpf, ultimate: u.completo_exterior_wpf }, paquetes: pq };
      if (!escribir) return { ok: true, data: { simulado: true, documento: nombreArchivo(vehiculo), resumen, instruccion: "El PDF se envía después de tu mensaje. No repitas en el texto toda la tabla: menciona el kit frontal recomendado y di que en el documento van las dos calidades y los paquetes." } };
      const numero = `CC-PPF-${hoy.replace(/-/g, "").slice(2)}-${String(Math.floor(Math.random() * 900) + 100)}`;
      const bytes = await pdfPpf({ numero, fecha: larga(hoy), vigencia: larga(vig), cliente: (conv.ficha?.nombre as string) ?? conv.nombre, vehiculo, filas, paquetes, estimado: false });
      const url = await subirDocumento(nombreArchivo(vehiculo), bytes);
      if (conv.oportunidad_id) {
        await sql`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                  values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'whatsapp', 'enviado', ${`Cotización PPF ${numero} (${vehiculo}, planilla «${d.modelo_planilla}»): ${url}`}, ${AUTOR})`;
      }
      return {
        ok: true,
        data: {
          documento: { url, nombre: nombreArchivo(vehiculo), numero }, resumen,
          instruccion: "El PDF se envía después de tu mensaje. No repitas en el texto toda la tabla: menciona el kit frontal recomendado y di que en el documento van las dos calidades y los paquetes.",
        },
      };
    },

    async consultar_stock_nom(i) {
      // Presupuesto con holgura del 10%: el precio publicado es conversable y un comprador cerca del precio es un buen lead.
      // Nunca se entrega el precio mínimo; los autos sobre el presupuesto van marcados.
      const max = i.precio_max ? Number(i.precio_max) : null;
      const tope = max ? Math.round(max * 1.10) : null;
      const consulta = (b: string | null) => sql`
        select marca, modelo, version, anio, km, precio_publicado,
               (${max}::bigint is not null and precio_publicado > ${max}::bigint) as sobre_presupuesto
        from ops.vehiculos
        where estado = 'disponible' and coalesce(precio_publicado, 0) > 0
          and (${b}::text is null or lower(marca || ' ' || modelo || ' ' || coalesce(version, '')) like ${b})
          and (${tope}::bigint is null or precio_publicado <= ${tope}::bigint)
        order by precio_publicado`;
      const b = i.busqueda ? `%${norm(String(i.busqueda))}%` : null;
      let filas = await consulta(b);
      // El stock no guarda el tipo (SUV, sedán, camioneta): si el texto no calza, se devuelve todo lo que entra en el presupuesto
      const notas: string[] = [];
      if (filas.length === 0 && b) {
        filas = await consulta(null);
        notas.push("La búsqueda por texto no calzó; estos son todos los autos disponibles dentro del presupuesto. Revisa tú cuáles corresponden a lo que pide (por ejemplo, Corolla Cross y Outlander son SUV).");
      }
      if (filas.some((f: any) => f.sobre_presupuesto)) {
        notas.push("Los autos con sobre_presupuesto = true pasan hasta un 10% el presupuesto del cliente. Puedes mostrarlos con su precio publicado y decir que el precio es conversable en la visita; nunca des un precio mínimo ni ofrezcas un descuento.");
      }
      return { ok: true, data: { autos: filas, ...(notas.length ? { nota: notas.join(" ") } : {}) } };
    },

    async crear_cotizacion(i) {
      const items = (i.items ?? []).map((x: any) => ({ ...x, cantidad: x.cantidad ?? 1 }));
      if (items.length === 0) return { ok: false, error: "Sin ítems" };
      const total = items.reduce((s: number, x: any) => s + Number(x.precio) * Number(x.cantidad), 0);
      const vigencia = sumarDias(partesChile(ahora).fecha, 7);
      const INSTR = "El PDF de la cotización se envía solo, después de tu mensaje. Di en una línea que le envías la cotización con el total y la vigencia de 7 días; nunca pegues links ni copies el detalle completo.";
      if (!escribir) return { ok: true, data: { simulado: true, numero: "CC-2611-SIM", total, vigencia, documento_simulado: "Cotizacion-CC-2611-SIM.pdf", instruccion: INSTR } };
      // Nombre visible de cada línea: el del catálogo si viene el código
      const cods = items.map((x: any) => x.codigo).filter(Boolean);
      const cat = cods.length ? await sql`select codigo, nombre, descripcion from crm.catalogo where unidad = 'carclass' and codigo = any(${cods})` : [];
      const lineas = items.map((x: any) => {
        const c: any = cat.find((k: any) => k.codigo === x.codigo);
        return { codigo: x.codigo ?? null, nombre: c?.nombre ?? x.descripcion, descripcion: c ? x.descripcion : null, cantidad: Number(x.cantidad), precio: Number(x.precio) };
      });
      const itemsJson = { v: 2, lineas, auto: i.vehiculo ?? null, origen: "asesor" };
      const estado = o.modo === "activo" ? "enviada" : "borrador";
      // Si en esta conversación ya hay una cotización abierta de los últimos 7 días, se actualiza (mismo número y link)
      const abierta = conv.oportunidad_id ? await sql`
        select id, numero, token from crm.cotizaciones
        where oportunidad_id = ${conv.oportunidad_id}::uuid and unidad = 'carclass' and estado in ('borrador','enviada','vista')
          and fecha >= ${partesChile(ahora).fecha}::date - 7
        order by creado_en desc limit 1` : [];
      let id: string, numero: string, token: string;
      if (abierta.length) {
        ({ id, numero, token } = abierta[0] as any);
        await sql`update crm.cotizaciones set items = ${sql.json(itemsJson as any)}, total = ${total}, neto = ${Math.round(total / 1.19)},
                    vigencia = ${vigencia}::date, notas = ${i.notas ?? null}, token = coalesce(token, ${crypto.randomUUID().replace(/-/g, "")}),
                    estado = case when estado = 'vista' then 'vista' else ${estado} end,
                    enviada_en = case when ${estado} = 'enviada' then coalesce(enviada_en, now()) else enviada_en end
                  where id = ${id}::uuid`;
        token = token ?? (await sql`select token from crm.cotizaciones where id = ${id}::uuid`)[0].token;
      } else {
        const yymm = partesChile(ahora).fecha.slice(2, 7).replace("-", "");
        const n = await sql`select count(*)::int + 1 n from crm.cotizaciones where unidad = 'carclass' and date_trunc('month', fecha) = date_trunc('month', ${partesChile(ahora).fecha}::date)`;
        numero = `CC-${yymm}-${String(n[0].n).padStart(3, "0")}`;
        token = crypto.randomUUID().replace(/-/g, "");
        const r = await sql`
          insert into crm.cotizaciones (oportunidad_id, empresa_id, unidad, numero, fecha, vigencia, items, total, neto, estado, token, creado_por, notas, enviada_en)
          values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'carclass', ${numero}, ${partesChile(ahora).fecha}::date, ${vigencia}::date,
                  ${sql.json(itemsJson as any)}, ${total}, ${Math.round(total / 1.19)}, ${estado}, ${token}, ${AUTOR}, ${i.notas ?? null},
                  ${estado === "enviada" ? sql`now()` : null})
          returning id`;
        id = r[0].id;
      }
      await moverEtapa("cotizado", { monto_estimado: total, proxima_accion: `Seguimiento de cotización ${numero}` });
      // PDF de la cotización: se envía por WhatsApp después del texto (Felipe 21-nov-2026: al cliente PDF, no links)
      const larga = (f: string) => new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${f}T12:00:00Z`));
      const bytes = await pdfCotizacion({
        numero, fecha: larga(partesChile(ahora).fecha), vigencia: larga(vigencia), cliente: (conv.ficha?.nombre as string) ?? conv.nombre,
        vehiculo: i.vehiculo ?? null, lineas: lineas.map((l: any) => ({ nombre: l.nombre, descripcion: l.descripcion, cantidad: l.cantidad, precio: l.precio })), total, notas: i.notas ?? null,
      });
      const archivo = `Cotizacion-${numero}.pdf`;
      const url = await subirDocumento(archivo, bytes, "cotizaciones");
      await sql`update crm.cotizaciones set pdf_url = ${url} where id = ${id}::uuid`;
      return {
        ok: true,
        data: { numero, total, vigencia, cotizacion_id: id, actualizada: abierta.length > 0, documento: { url, nombre: archivo, numero }, instruccion: INSTR },
      };
    },

    async proponer_horarios(i) {
      const [recepcion, cupos, plazos, retiro, transferencia] = await Promise.all([
        parametro(sql, "carclass.recepcion"), parametro(sql, "carclass.cupos"), parametro(sql, "carclass.plazos"),
        parametro(sql, "carclass.retiro"), parametro(sql, "carclass.transferencia"),
      ]);
      const servicio = i.servicio as string;
      const hoy = partesChile(ahora);
      // Hiendcar pide unos 3 días de anticipación (16-nov-2026); configurable en carclass.cupos.anticipacion_dias
      const anticipacion = Number(cupos?.anticipacion_dias ?? 3);
      let fecha = sumarDias(hoy.fecha, anticipacion + (hoy.hora >= 16 ? 1 : 0));
      if (i.desde && /^\d{4}-\d{2}-\d{2}$/.test(i.desde) && i.desde > fecha) fecha = i.desde;
      const citas = await sql`select inicio, servicio from wa.citas where estado in ('reservada','confirmada') and inicio >= now() - interval '7 days' and inicio < now() + interval '40 days'`;
      const semanaDe = (f: string) => { const d = new Date(`${f}T12:00:00Z`); const dow = (d.getUTCDay() + 6) % 7; return sumarDias(f, -dow); };
      const usadosSemana = (f: string, s: string) => citas.filter((c: any) => c.servicio === s && semanaDe(partesChile(new Date(c.inicio)).fecha) === semanaDe(f)).length;
      const usadosDia = (f: string, s: string) => citas.filter((c: any) => c.servicio === s && partesChile(new Date(c.inicio)).fecha === f).length;
      const tope = (s: string, f: string) => {
        if (s === "ceramico") return usadosSemana(f, "ceramico") < Number(cupos?.ceramico_semana ?? 2);
        if (s === "ppf_frontal") return usadosSemana(f, "ppf_frontal") < Number(cupos?.ppf_frontal_semana ?? 2);
        if (s === "laminas") return usadosDia(f, "laminas") < Number(cupos?.laminas_dia ?? 1);
        return true;
      };
      const opciones: { inicio_local: string; texto: string }[] = [];
      for (let k = 0; k < 30 && opciones.length < 2; k++) {
        const f = sumarDias(fecha, k);
        const dow = new Date(`${f}T12:00:00Z`).getUTCDay();
        if (dow === 0 || dow === 6) continue;
        if (!tope(servicio, f)) continue;
        const horas = dow === 5 ? ["10:00", "14:00"] : ["10:00", "15:00"];
        for (const h of horas) {
          if (opciones.length >= 2) break;
          const inst = instanteChile(f, h);
          if (citas.some((c: any) => Math.abs(new Date(c.inicio).getTime() - inst.getTime()) < 60 * 60_000)) continue;
          // Dos opciones en días distintos cuando se puede
          if (opciones.length === 1 && opciones[0].inicio_local.startsWith(f)) continue;
          opciones.push({ inicio_local: `${f}T${h}`, texto: textoFecha(inst) });
        }
      }
      const lugares = (recepcion?.lugares ?? []).map((l: any) => ({ codigo: l.codigo, como_decirlo: l.como_decirlo ?? `${l.nombre}, ${l.direccion}`, direccion: l.direccion, nota: l.nota }));
      const datos = transferencia ? {
        titular: transferencia.titular, rut: transferencia.rut, banco: transferencia.banco, tipo_cuenta: transferencia.tipo_cuenta,
        numero_cuenta: transferencia.numero_cuenta, correo_comprobante: transferencia.correo_comprobante,
      } : null;
      return {
        ok: true,
        data: {
          opciones,
          sin_cupo_cercano: opciones.length === 0,
          lugar_preferido: recepcion?.preferido ?? "taller",
          lugares,
          horario_recepcion: recepcion?.horario,
          plazos_aproximados_dias: plazos ? { ceramico: plazos.ceramico, ppf_frontal: plazos.ppf_frontal, ppf_total: plazos.ppf_total, laminas: plazos.laminas, nota: "aproximados, según el vehículo" } : null,
          // La condición de costo del retiro es interna: el asesor la aplica, pero nunca la menciona al cliente
          retiro: retiro ? { zonas: retiro.zonas ?? retiro.comunas_sin_costo, regla_interna: retiro.regla_agente, como_decirlo: retiro.como_decirlo ?? null } : null,
          pago: transferencia?.pago ?? null,
          datos_transferencia: datos,
          regla: recepcion?.regla_cliente ?? "Con clientes de Carclass nunca menciones NOM: di «nuestra oficina».",
        },
      };
    },

    async reservar_cita(i) {
      const m = String(i.inicio).match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
      if (!m) return { ok: false, error: "Formato de inicio inválido (YYYY-MM-DDTHH:MM)" };
      const inst = instanteChile(m[1], m[2]);
      if (inst.getTime() < ahora.getTime()) return { ok: false, error: "La fecha ya pasó" };
      const recepcion = await parametro(sql, "carclass.recepcion");
      const lugar = (recepcion?.lugares ?? []).find((l: any) => l.codigo === i.lugar);
      if (!escribir) return { ok: true, data: { simulado: true, inicio: textoFecha(inst), lugar: lugar?.como_decirlo ?? i.lugar, estado: "reservada, pendiente de validar la transferencia" } };
      const choque = await sql`select 1 from wa.citas where estado in ('reservada','confirmada') and abs(extract(epoch from (inicio - ${inst}))) < 3600`;
      if (choque.length) return { ok: false, error: "Ese horario ya no está disponible: vuelve a llamar a proponer_horarios." };
      await sql`insert into wa.citas (conversacion_id, oportunidad_id, unidad, tipo, servicio, inicio, lugar, email_cliente)
                values (${conv.id}::uuid, ${conv.oportunidad_id}::uuid, 'carclass', ${i.lugar === "retiro" ? "retiro" : "recepcion"}, ${i.servicio},
                        ${inst}, ${lugar?.direccion ?? i.lugar}, ${i.email_cliente ?? null})`;
      await sql`select core.api_crear_tarea(${sql.json({
        titulo: `[WhatsApp] Cita ${textoFecha(inst)} · ${conv.nombre ?? conv.telefono_norm ?? ""}`,
        descripcion: `Servicio: ${i.servicio} · Lugar: ${lugar?.direccion ?? i.lugar} · Correo: ${i.email_cliente ?? "—"}. Crear el evento en el calendario e invitar al cliente; confirmar con Hiendcar.`,
        unidad: "carclass", responsable: "Felipe", vence: partesChile(ahora).fecha, prioridad: "alta", oportunidad_id: conv.oportunidad_id, empresa_id: conv.empresa_id,
      } as any)}, ${AUTOR})`;
      await moverEtapa("agendado", { proxima_accion: "Recepción del vehículo", proxima_fecha: m[1] });
      return { ok: true, data: { inicio: textoFecha(inst), lugar: lugar?.como_decirlo ?? i.lugar, estado: "reservada, pendiente de validar la transferencia" } };
    },

    async registrar_comprobante(i) {
      if (!escribir) return { ok: true, data: { simulado: true, estado: "pendiente de validación" } };
      const media = await sql`select id, tipo from wa.mensajes where conversacion_id = ${conv.id}::uuid and direccion = 'entrante' and tipo in ('image','document') order by enviado_en desc limit 1`;
      await sql`select core.api_crear_tarea(${sql.json({
        titulo: `[WhatsApp] Validar reserva ${i.monto ? "$" + Number(i.monto).toLocaleString("es-CL") : "$50.000"} · ${conv.nombre ?? conv.telefono_norm ?? ""}`,
        descripcion: `Comprobante recibido por WhatsApp (mensaje ${media[0]?.id ?? "?"}). ${i.nota ?? ""}`.trim(),
        unidad: "carclass", responsable: "Felipe", vence: partesChile(ahora).fecha, prioridad: "alta", oportunidad_id: conv.oportunidad_id, empresa_id: conv.empresa_id,
      } as any)}, ${AUTOR})`;
      if (conv.oportunidad_id) {
        await sql`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                  values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'whatsapp', 'comprobante', 'Comprobante de reserva recibido (pendiente de validación)', ${AUTOR})`;
      }
      return { ok: true, data: { estado: "pendiente de validación" } };
    },

    async programar_seguimiento(i) {
      // Plan por unidad (carclass.seguimiento, blackgps.seguimiento…); si la unidad no tiene, el de Carclass
      const plan = (await parametro(sql, `${conv.unidad ?? "carclass"}.seguimiento`)) ?? (await parametro(sql, "carclass.seguimiento"));
      const pasos = (plan?.pasos ?? []) as any[];
      if (!escribir) return { ok: true, data: { simulado: true, pasos: pasos.length } };
      await sql`update wa.seguimientos set estado = 'cancelado' where conversacion_id = ${conv.id}::uuid and estado = 'pendiente'`;
      for (const p of pasos) {
        const n = parseInt(String(p.a));
        const ms = String(p.a).endsWith("h") ? n * 3600_000 : n * 86_400_000;
        const canal = p.accion === "marcar_perdida" ? "marcar_perdida" : p.canal;
        await sql`insert into wa.seguimientos (conversacion_id, cuando, canal, plantilla, idea)
                  values (${conv.id}::uuid, ${new Date(ahora.getTime() + ms)}, ${canal}, ${p.plantilla ?? null}, ${i.idea})`;
      }
      return { ok: true, data: { programados: pasos.map((p) => p.a) } };
    },

    async traspasar_humano(i) {
      if (!escribir) return { ok: true, data: { simulado: true } };
      await sql`select core.api_crear_tarea(${sql.json({
        titulo: `[WhatsApp] ${i.motivo} · ${conv.nombre ?? conv.telefono_norm ?? ""}`,
        descripcion: i.nota, unidad: conv.unidad ?? "grupo", responsable: "Felipe",
        vence: partesChile(ahora).fecha, prioridad: i.prioridad ?? "alta", oportunidad_id: conv.oportunidad_id, empresa_id: conv.empresa_id,
      } as any)}, ${AUTOR})`;
      await sql`update wa.conversaciones set agente_pausado_hasta = now() + interval '12 hours' where id = ${conv.id}::uuid`;
      if (conv.oportunidad_id) {
        await sql`insert into crm.actividades (oportunidad_id, empresa_id, tipo, resultado, nota, autor)
                  values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'nota', 'traspaso', ${`${i.motivo}: ${i.nota}`}, ${AUTOR})`;
      }
      return { ok: true, data: { traspasado: true, agente_pausado_horas: 12 } };
    },

    async marcar_personal() {
      if (!escribir) return { ok: true, data: { simulado: true } };
      await sql`update wa.conversaciones set estado = 'personal', ficha = '{}'::jsonb, actualizado_en = now() where id = ${conv.id}::uuid`;
      await sql`delete from wa.mensajes where conversacion_id = ${conv.id}::uuid`;
      await sql`delete from wa.borradores where conversacion_id = ${conv.id}::uuid`;
      if (conv.telefono_norm) {
        await sql`insert into wa.contactos_personales (telefono_norm, nombre, origen, tipo) values (${conv.telefono_norm}, ${conv.nombre}, 'manual', 'personal')
                  on conflict (telefono_norm) do nothing`;
      }
      return { ok: true, data: { personal: true } };
    },

    async descartar(i) {
      if (!escribir || o.modo !== "activo") return { ok: true, data: { diferido: !simular, simulado: simular, nota: "Se aplica cuando Felipe aprueba." } };
      if (!conv.oportunidad_id) return { ok: false, error: "Sin oportunidad" };
      await sql`select core.api_mover_etapa(${sql.json({ oportunidad_id: conv.oportunidad_id, estado: "perdida", motivo_codigo: i.motivo_codigo, motivo: i.nota ?? i.motivo_codigo } as any)}, ${AUTOR})`;
      return { ok: true };
    },
  };

  Object.assign(impl, crearNom(sql, conv, escribir));

  return async function ejecutar(nombre: string, input: unknown): Promise<Resultado> {
    const f = impl[nombre];
    if (!f) return { ok: false, error: `Herramienta desconocida: ${nombre}` };
    if (o.modo === "observar" && !simular && !["asignar_unidad", "actualizar_ficha", "consultar_catalogo", "consultar_ppf_modelo", "consultar_stock_nom", "traspasar_humano", "marcar_personal", ...NOM_SOLO_LECTURA].includes(nombre)) {
      return { ok: false, error: "Modo observar: esta acción no está habilitada; traspasa a Felipe." };
    }
    try {
      return await f((input ?? {}) as any);
    } catch (e) {
      return { ok: false, error: String((e as any)?.message ?? e).slice(0, 300) };
    }
  };
}

// Herramientas que delatan que el agente no debe enviar nada al cliente
export const SILENCIOSAS = new Set(["marcar_personal"]);
