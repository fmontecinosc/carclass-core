// Herramientas del asesor: definiciones (para Claude) e implementación contra Carclass Core.
// En modo simulación (eval) las de solo lectura consultan la base real y las de escritura no tocan nada.
import type Anthropic from "npm:@anthropic-ai/sdk@0.136.0";
import type postgres from "npm:postgres@3.4.4";
import { HERRAMIENTAS_NOM, NOM_SOLO_LECTURA, crearNom } from "./nom.ts";

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
    description: "Crea la cotización de Carclass en Core con los ítems y precios que ya obtuviste de las herramientas. Devuelve número y vigencia.",
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
    description: "Programa los seguimientos de una cotización enviada (23 h, día 3, día 7; día 10 se marca perdida).",
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
      return { ok: true, data: { moneda: "CLP con IVA", items: filas } };
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
      let filas = await buscar(palabras);
      // Sin calce exacto: se prueba sin la marca (las planillas a veces la abrevian)
      if (filas.length === 0 && palabras.length > 1) filas = await buscar(palabras.slice(1));
      const cat = await sql`select codigo, precio from crm.catalogo where activo and unidad = 'carclass' and codigo in ('ceramico_4','laminas','laminas_8','ppf_frontal','ppf_frontal_reducido','shield','protection_pack')`;
      const precio = (c: string) => Number(cat.find((x: any) => x.codigo === c)?.precio ?? 0);
      if (filas.length === 0) {
        return {
          ok: true,
          data: {
            encontrado: false,
            instruccion: "No hay planilla para este modelo: da el valor referencial como 'desde', di que Felipe confirma el valor exacto hoy y traspasa con motivo 'cotizar PPF para modelo sin planilla'.",
            referencial_desde: { ppf_kit_frontal: precio("ppf_frontal"), ppf_frontal_reducido: precio("ppf_frontal_reducido"), shield: precio("shield"), protection_pack: precio("protection_pack") },
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
          ppf_total: "requiere validación de Felipe",
        },
      };
    },

    async consultar_stock_nom(i) {
      const consulta = (b: string | null) => sql`
        select marca, modelo, version, anio, km, precio_publicado
        from ops.vehiculos
        where estado = 'disponible' and coalesce(precio_publicado, 0) > 0
          and (${b}::text is null or lower(marca || ' ' || modelo || ' ' || coalesce(version, '')) like ${b})
          and (${i.precio_max ?? null}::bigint is null or precio_publicado <= ${i.precio_max ?? null})
        order by precio_publicado`;
      const b = i.busqueda ? `%${norm(String(i.busqueda))}%` : null;
      let filas = await consulta(b);
      // El stock no guarda el tipo (SUV, sedán, camioneta): si el texto no calza, se devuelve todo lo que entra en el presupuesto
      let nota: string | undefined;
      if (filas.length === 0 && b) {
        filas = await consulta(null);
        nota = "La búsqueda por texto no calzó; estos son todos los autos disponibles dentro del presupuesto. Revisa tú cuáles corresponden a lo que pide (por ejemplo, Corolla Cross y Outlander son SUV).";
      }
      return { ok: true, data: { autos: filas, ...(nota ? { nota } : {}) } };
    },

    async crear_cotizacion(i) {
      const items = (i.items ?? []).map((x: any) => ({ ...x, cantidad: x.cantidad ?? 1 }));
      if (items.length === 0) return { ok: false, error: "Sin ítems" };
      const total = items.reduce((s: number, x: any) => s + Number(x.precio) * Number(x.cantidad), 0);
      const vigencia = sumarDias(partesChile(ahora).fecha, 7);
      if (!escribir) return { ok: true, data: { simulado: true, numero: "CC-SIM-0001", total, vigencia } };
      const anio = partesChile(ahora).fecha.slice(0, 4);
      const ult = await sql`select count(*)::int n from crm.cotizaciones where unidad = 'carclass' and numero like ${"CC-" + anio + "-%"}`;
      const numero = `CC-${anio}-${String((ult[0]?.n ?? 0) + 1).padStart(4, "0")}`;
      const token = crypto.randomUUID().replace(/-/g, "");
      const r = await sql`
        insert into crm.cotizaciones (oportunidad_id, empresa_id, unidad, numero, fecha, vigencia, items, total, neto, estado, token, creado_por, notas)
        values (${conv.oportunidad_id}::uuid, ${conv.empresa_id}::uuid, 'carclass', ${numero}, ${partesChile(ahora).fecha}::date, ${vigencia}::date,
                ${sql.json({ vehiculo: i.vehiculo ?? null, items } as any)}, ${total}, ${Math.round(total / 1.19)},
                ${o.modo === "activo" ? "enviada" : "borrador"}, ${token}, ${AUTOR}, ${i.notas ?? null})
        returning id`;
      await moverEtapa("cotizado", { monto_estimado: total, proxima_accion: "Seguimiento de cotización" });
      return {
        ok: true,
        data: {
          numero, total, vigencia, cotizacion_id: r[0].id,
          instruccion: "Aún no hay página pública de cotización: escribe en el mensaje el detalle (servicio y precio con IVA) y el número de cotización.",
        },
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
          retiro: retiro ? { comunas_sin_costo: retiro.comunas_sin_costo, desde_monto: retiro.desde_monto, otras_comunas: "Felipe confirma el costo" } : null,
          pago: transferencia?.pago ?? null,
          datos_transferencia: datos,
          regla: "Con clientes de Carclass nunca menciones NOM: di 'nuestra oficina ubicada en Puerta Oriente 361, Chicureo'.",
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
      const plan = await parametro(sql, "carclass.seguimiento");
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
