# CARWASH.HF — PROMPT MAESTRO DE CONTEXTO (catálogo de servicios)

> Archivo de contexto para Claude Code. Colócalo como `CLAUDE.md` en la raíz del repo de Carwash.hf, o impórtalo desde otro `CLAUDE.md` con `@CLAUDE-carwash-hf.md`.
> Fuente: catálogo vigente de WhatsApp Business de carwash.hf (leído el 5-nov-2026), cruzado con el registro de ventas feb–mar 2026 y las reglas de Carclass Core.
> Dueño: Felipe Montecinos (CEO Carclass Group). Si este archivo contradice una instrucción puntual de Felipe, manda Felipe.

---

## 1. Qué es Carwash.hf

- Lavado y estética automotriz B2C en **Huertos Familiares, Tiltil** (Región Metropolitana, Chile). Submarca de Carclass Group, gestionada como unidad separada (prioridad 4 del holding).
- Dirección: **4 Oriente #278, Huertos Familiares, Tiltil**. Horario: **lunes a sábado, 9:00 a 17:00**.
- Promesa del catálogo: "Más que un lavado, una experiencia premium, en Huertos Familiares".
- Líneas: lavado de vehículos, limpieza de tapiz, pulido, sellado cerámico.
- Clientes: vecinos de Huertos Familiares, Alto El Manzano, Santa Matilde, Diray, Tiltil, Lampa y Colina; trabajadores de faena con camioneta propia; flotas pequeñas (minería, ingeniería, transporte de personal).
- Canal único de entrada: WhatsApp. Sin cotización formal: el cliente elige servicio + tamaño y se agenda.
- Identidad: verde tipo Rolex, negro y blanco. Lujo silencioso, editorial.

## 2. Modelo de precios

Todo precio es **"desde"**, en **CLP con IVA incluido**, y depende del **tamaño del vehículo** en tres tramos:

| Tramo | Código | Incluye |
|---|---|---|
| T1 | `pequeno_mediano` | Citycar, hatchback, sedán, SUV compacto |
| T2 | `suv_pickup_mediana` | SUV mediano, pickup mediana (Hilux, L200, Ranger, D-Max, Frontier) |
| T3 | `pickup_xl_suv_3c` | Pickup XL (F-150, Ram, Tundra), SUV de 3 corridas (Tahoe, Maxus D90, Jetour X70 de 7 asientos) |

Los ejemplos de modelos por tramo son una guía de clasificación, no parte del catálogo; si hay duda, el tramo lo confirma un humano.

## 3. Catálogo completo (7 servicios)

| # | Servicio | Slug | Categoría | T1 | T2 | T3 |
|---|---|---|---|---|---|---|
| 1 | Lavado Básico (solo exterior) | `lavado_basico` | Lavados | 15.000 | 20.000 | 25.000 |
| 2 | Lavado Boutique | `lavado_boutique` | Lavados | 30.000 | 35.000 | 40.000 |
| 3 | Lavado Técnico | `lavado_tecnico` | Lavados | 60.000 | 75.000 | 90.000 |
| 4 | Pulido Básico | `pulido_basico` | Pulidos | 75.000 | 100.000 | 125.000 |
| 5 | Limpieza Interior + Tapicería | `interior_tapiceria` | Interior | 125.000 | 155.000 | 175.000 |
| 6 | Pulido Intermedio + Sellado Sintético | `pulido_intermedio_sintetico` | Pulidos | 150.000 | 175.000 | 200.000 |
| 7 | Pulido + Sellado Cerámico | `pulido_sellado_ceramico` | Pulidos | 250.000 | 275.000 | 300.000 |

### Qué incluye cada servicio (escalera acumulativa)

| Componente | Básico | Boutique | Técnico | Pulido Básico | Pulido Int. + Sintético | Pulido + Cerámico | Interior + Tapicería |
|---|---|---|---|---|---|---|---|
| Lavado exterior | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (básico, de cortesía) |
| Limpieza de vidrios | ✓ | | | | | | |
| Hidratación neumáticos y plásticos ext. | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Limpieza de llantas y guardafangos | | ✓ | ✓ | ✓ | ✓ | ✓ | |
| Aspirado y limpieza interior | | ✓ | ✓ (+ hidratación de plásticos) | ✓ | ✓ | ✓ | |
| Descontaminación de pintura | | | ✓ | ✓ | ✓ | ✓ | |
| Encerado | | | ✓ | | | | |
| Pulido abrillantado 3 en 1 | | | | ✓ | | | |
| Pulido de corrección intermedia | | | | | ✓ | | |
| Corrección de pintura detallada | | | | | | ✓ | |
| Sellado sintético (6 meses) | | | | | ✓ | | |
| Sellado cerámico | | | | | | ✓ (duración no publicada) | |
| Limpieza profunda de tapices (techo, alfombra, asientos, maleta) y paneles (tablero, puertas, maleta) | | | | | | | ✓ |

Notas de catálogo:
- "Limpieza de vidrios" aparece explícita solo en el Lavado Básico. Se asume incluida en los demás, pero no está escrito: confirmar con Felipe antes de prometerla.
- El Interior + Tapicería es un servicio independiente; no incluye llantas ni hidratación exterior.

## 4. Datos operativos conocidos

- **Capacidad:** máximo 4 autos por día mientras opere una sola persona. Nunca agendar por sobre la capacidad.
- **Bloques históricos:** lun–sáb 09–11, 11–13, 14–16, 16–18 (el catálogo publica cierre a las 17:00; usar el catálogo). Sábado preferido para pulidos e interiores.
- **Duraciones por servicio:** NO definidas. No inventarlas; dejar como campo configurable.
- **Costo de insumos registrado (feb–mar 2026):** Lavado Boutique ~$5.000–$7.000 por auto; Interior ~$16.800–$21.000 por auto. Sin costo de mano de obra cargado.
- **Ticket real observado:** el Boutique se cobró $30.000 / $35.000 / $40.000 (coincide con el catálogo). Flotas pagaron $35.700, $41.650, $45.000 y $55.000 (van de pasajeros), es decir, ya hay precios fuera de tramo para furgones y vans.
- **Personas:** Simón ejecuta los lavados. Closers para Carwash.hf: Felipe, Stephanie, Jorge.

## 5. Flujo comercial (Carclass Core)

Etapas: `nuevo → coordinando → agendado → atendido (ganada) → recompra`.

1. **Nuevo:** primera respuesta en menos de 5 minutos.
2. **Coordinando (setter):** identificar vehículo (marca, modelo) → tramo, servicio, día y hora. Máximo 3 preguntas por mensaje.
3. **Agendado:** bloque reservado; recordatorio el día anterior.
4. **Atendido:** servicio hecho y pagado = venta ganada. Fotos antes/después.
5. **Recompra:** recordatorio a los 30 días. Postventa: agradecimiento + reseña en Google.

Motivos de pérdida (lista fija): precio · competencia · sin respuesta tras cotización · fuera de zona · no califica · desistió · datos erróneos · otro.

## 6. Reglas duras (no negociables)

1. **Precios:** solo los de la tabla de la sección 3. Nunca descuentos, promociones, planes ni paquetes que no estén escritos aquí.
2. **Precio aprobado vs. publicado:** Carclass Core hoy marca como único precio aprobado para el setter el **Boutique T2 $35.000**. El catálogo de WhatsApp es público, pero hasta que Felipe confirme que es la lista oficial, un setter IA puede **citar el catálogo como "valores desde"** y debe derivar a un humano para confirmar cualquier servicio de pulido, cerámico o interior.
3. **No mezclar con Carclass:** no trasladar precios, garantías, marcas de producto (XPEL), convenios ni la condición de dealer de Carclass a Carwash.hf, ni al revés.
4. **Vehículos fuera de tramo** (vans, furgones, minibuses, camiones, flotas de más de 2 vehículos): sin precio automático; derivar a Felipe.
5. **Sin domicilio:** el servicio es en el local de Huertos Familiares.
6. **Lubricentro, mecánica, neumáticos y alineación** son proyectos futuros. No ofrecerlos.
7. **No registrar ventas ni costos** en Core sin confirmación explícita de Felipe.
8. **Nunca inventar** duraciones, garantías del sellado cerámico ni resultados (p. ej. "elimina todas las rayas").

## 7. Modelo de datos sugerido (seed)

```json
{
  "negocio": {
    "nombre": "Carwash.hf",
    "direccion": "4 Oriente #278, Huertos Familiares, Tiltil",
    "horario": { "dias": "lun-sab", "apertura": "09:00", "cierre": "17:00" },
    "capacidad_diaria": 4,
    "moneda": "CLP",
    "iva_incluido": true
  },
  "tramos": [
    { "codigo": "pequeno_mediano", "nombre": "Vehículos pequeños y medianos" },
    { "codigo": "suv_pickup_mediana", "nombre": "SUV y pickup medianas" },
    { "codigo": "pickup_xl_suv_3c", "nombre": "Pickups XL y SUV 3 corridas" }
  ],
  "servicios": [
    { "slug": "lavado_basico", "nombre": "Lavado Básico (solo exterior)", "categoria": "lavados", "orden": 1,
      "precios": { "pequeno_mediano": 15000, "suv_pickup_mediana": 20000, "pickup_xl_suv_3c": 25000 },
      "incluye": ["Lavado exterior", "Limpieza de vidrios", "Hidratación de neumáticos y plásticos exteriores"],
      "duracion_min": null, "requiere_humano": false },
    { "slug": "lavado_boutique", "nombre": "Lavado Boutique", "categoria": "lavados", "orden": 2, "destacado": true,
      "precios": { "pequeno_mediano": 30000, "suv_pickup_mediana": 35000, "pickup_xl_suv_3c": 40000 },
      "incluye": ["Lavado exterior", "Limpieza de llantas y guardafangos", "Aspirado y limpieza interior", "Hidratación de neumáticos y plásticos exteriores"],
      "duracion_min": null, "requiere_humano": false },
    { "slug": "lavado_tecnico", "nombre": "Lavado Técnico", "categoria": "lavados", "orden": 3,
      "precios": { "pequeno_mediano": 60000, "suv_pickup_mediana": 75000, "pickup_xl_suv_3c": 90000 },
      "incluye": ["Lavado exterior", "Descontaminación de pintura", "Encerado", "Limpieza de llantas y guardafangos", "Aspirado y limpieza interior con hidratación de plásticos", "Hidratación de neumáticos y plásticos exteriores"],
      "duracion_min": null, "requiere_humano": false },
    { "slug": "pulido_basico", "nombre": "Pulido Básico", "categoria": "pulidos", "orden": 4,
      "precios": { "pequeno_mediano": 75000, "suv_pickup_mediana": 100000, "pickup_xl_suv_3c": 125000 },
      "incluye": ["Lavado exterior", "Descontaminación de pintura", "Pulido de abrillantado 3 en 1", "Limpieza de llantas y guardafangos", "Aspirado y limpieza interior", "Hidratación de neumáticos y plásticos exteriores"],
      "duracion_min": null, "requiere_humano": true },
    { "slug": "interior_tapiceria", "nombre": "Limpieza Interior + Tapicería", "categoria": "interior", "orden": 5,
      "precios": { "pequeno_mediano": 125000, "suv_pickup_mediana": 155000, "pickup_xl_suv_3c": 175000 },
      "incluye": ["Limpieza profunda de tapices: techo, alfombra, asientos y maleta", "Limpieza de paneles: tablero, puertas y maleta", "Productos específicos por superficie", "Lavado exterior básico de cortesía"],
      "duracion_min": null, "requiere_humano": true },
    { "slug": "pulido_intermedio_sintetico", "nombre": "Pulido Intermedio + Sellado Sintético", "categoria": "pulidos", "orden": 6,
      "precios": { "pequeno_mediano": 150000, "suv_pickup_mediana": 175000, "pickup_xl_suv_3c": 200000 },
      "incluye": ["Lavado exterior", "Descontaminación de pintura", "Pulido de corrección intermedia", "Sellado sintético (6 meses)", "Limpieza de llantas y guardafangos", "Aspirado y limpieza interior", "Hidratación de neumáticos y plásticos exteriores"],
      "duracion_min": null, "requiere_humano": true },
    { "slug": "pulido_sellado_ceramico", "nombre": "Pulido + Sellado Cerámico", "categoria": "pulidos", "orden": 7,
      "precios": { "pequeno_mediano": 250000, "suv_pickup_mediana": 275000, "pickup_xl_suv_3c": 300000 },
      "incluye": ["Lavado exterior", "Descontaminación de pintura", "Corrección de pintura detallada", "Sellado cerámico", "Limpieza de llantas y guardafangos", "Aspirado y limpieza interior", "Hidratación de neumáticos y plásticos exteriores"],
      "duracion_min": null, "requiere_humano": true }
  ]
}
```

Reglas para el código:
- Precios como enteros en CLP; mostrar con separador de miles chileno (`$35.000`) y la palabra "desde".
- `duracion_min: null` es intencional: la agenda debe funcionar por bloques hasta que Felipe defina duraciones.
- La capacidad diaria y el horario deben ser configurables, no constantes en el código.
- No guardar llaves ni secretos en el repo: van en variables de entorno.

## 8. Análisis del catálogo (para decidir, no para ejecutar)

Lo que está bien:
- **Escalera clara y acumulativa:** cada nivel suma pasos visibles; facilita el upsell en WhatsApp ("por $X más, incluye descontaminación").
- **Tramos por tamaño coherentes** con lo que realmente se cobró: el Boutique (servicio más pedido) cuadra exacto con las ventas de feb–mar 2026.
- **Ancla de entrada baja** ($15.000) para captar al vecino, y un servicio estrella ($30.000–$40.000) con margen de insumos superior al 80%.

Problemas a resolver (decisiones de Felipe):
1. **¿El catálogo es la lista oficial?** Core dice que solo hay un precio aprobado; WhatsApp publica siete. Hasta que se cierre, el agente no puede cotizar con seguridad. Es la decisión que más destraba.
2. **Conflicto de canal con Carclass.** "Pulido + Sellado Cerámico" a $250.000 compite con el cerámico de Carclass ($300.000–$750.000) en el mismo WhatsApp compartido. Definir si el cerámico queda en Carwash.hf (con otro producto y sin garantía en años) o pasa a Carclass.
3. **Lavado Técnico vs. Pulido Básico:** solo $15.000 de diferencia en T1, y el Pulido Básico incluye más. El Técnico queda canibalizado. Opciones: subir el Pulido Básico o reposicionar el Técnico como "lavado + encerado".
4. **Salto grande entre $75.000 y $150.000** en pulidos sin escalón intermedio; y el Interior escala irregular (+$30.000 y luego +$20.000), a diferencia del resto (+$5.000, +$15.000, +$25.000 por tramo).
5. **Vans, furgones y flotas no tienen precio**, siendo justamente el segmento que paga sobre lista y genera recurrencia. Falta un tramo T4 o una tarifa de flota.
6. **Faltan planes de recurrencia** (la meta de negocio es recompra), duraciones por servicio (sin ellas no se puede respetar la capacidad de 4 autos/día con pulidos de jornada completa) y la duración del sellado cerámico.
7. **Core pregunta "sedán o SUV"**, pero el catálogo tiene 3 tramos. El flujo debe preguntar marca y modelo y clasificar.

## 9. Pendientes que este archivo no resuelve

- Confirmar catálogo = lista oficial de precios.
- Duraciones por servicio y cuántos autos por día de cada tipo.
- Duración y producto del sellado cerámico.
- Tarifa para vans, furgones y flotas.
- Si existirán planes mensuales y a qué precio.
- Si los vidrios se incluyen en todos los lavados.
