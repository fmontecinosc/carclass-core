# NOM · Tasador trazable (Fases 0 y 1)

Versión 18-nov-2026 · migraciones `core_v31`, `core_v32`, `core_v33` · core-api 1.2.0 · app 2.9.0 (en rama, sin publicar).

## 1. Auditoría (Fase 0)

| Pieza existente | Estado | Decisión |
|---|---|---|
| Supabase `carclass-group` (esquemas `core`, `crm`, `fin`, `ops`, `wa`) | Producción, fuente de verdad | El tasador vive aquí, en un esquema nuevo `nom`, ligado a `crm.empresas`, `crm.oportunidades`, `ops.vehiculos` y `wa.conversaciones`. Nada paralelo. |
| `public.nom_tasaciones` (1 fila, Outlander jun-2026) | Tasación «IA» sin comparables ni URL | Se deja intacta como histórico. No se usa. |
| Herramienta IPC `nom-inspeccion` → `public.nom_inspecciones` | 6 secciones (c1–c6), sin repositorio; los nombres de los puntos viven en su código | Fase 3 la reutiliza: la tasación ya tiene `inspeccion_folio`. Falta subir su código para leer las 6 capas / 138 puntos con nombre. |
| core-api (MCP + REST) | v1.1.0 → **1.2.0** | Se agregaron 7 herramientas `nom_*`. Ninguna aprueba ni envía. |
| App Core (app.carclass.cl) | v2.8.3 en producción | v2.9.0 agrega «Tasaciones NOM», ficha, comparables, aprobación, informe y link público `#/t/<token>`. |
| WhatsApp (`wa-webhook`, `wa-agente`, `wa-enviar`) | Activo para Carclass; NOM en modo «activo» como setter | El tasador expone interfaces para la Fase 2; no se tocó el agente. |
| Flujo NOM consignantes (`core.etapas`) | nuevo → calificando → revision_agendada → revisado → propuesta → … | La tasación se cuelga de la oportunidad (botón «Tasar» en la ficha). |

Riesgos detectados (no tocados, decisión de Felipe):
- El repositorio `fmontecinosc/carclass-core` es **público**.
- `archivo.prospectos_callhub` y `archivo.empresas_eliminadas` tienen **RLS desactivado** (alerta crítica de Supabase): cualquiera con la clave publicable puede leerlas.
- Reglas de comisión NOM en conflicto: `procesos` dice 4 % mínimo $150.000 y exclusividad 45 días; `core.parametros['nom.comision']` dice 3–5 %, fee de entrada $50.000 y referencia 5 %/3 %/mín. $500.000. El tasador no fija ninguna: la comisión es un campo interno manual.

## 2. Cómo funciona

```
Ficha (app, agente o WhatsApp)  →  Investigación de mercado (agente Claude con búsqueda web, o carga manual)
  → nom.registrar_busqueda: cada aviso con URL directa, verificación, condición y evidencia
  → nom.calcular: depura, ajusta, pondera, calcula y advierte
  → ajuste manual motivado (opcional, auditado)
  → aprobación humana (solo dueño) → congela la versión y habilita el link
  → envío registrado (WhatsApp manual hoy; API en Fase 2) → actividad en la oportunidad
```

**Por qué la investigación la hace el agente y no el servidor:** Chileautos, Mercado Libre y Yapo no ofrecen API pública de búsqueda y bloquean robots. El agente de Claude busca con su herramienta web, abre cada aviso y registra lo que vio (URL, precio, km, versión, evidencia textual). No se evade ningún bloqueo y nada se inventa: sin URL no hay aviso.

### Reglas del cálculo (`nom.calcular_base` + `nom.calcular`)
1. Fuera del cálculo, con motivo visible: excluido por el tasador, sin precio, caído/vendido, **no verificado**, siniestro/remate/liquidación/bono 0 km, versión distinta o no identificable, transmisión/tracción/combustible distintos, más de 2 años de diferencia, otro modelo.
2. Ajuste por año (6 %/año) y km (1,5 % c/10.000 km), con tope ±18 %. **Propuesta, pendiente de aprobación.**
3. Peso por similitud; un precio ligado a financiamiento pesa la mitad.
4. Atípicos fuera de Q1−1,5·IQR / Q3+1,5·IQR (con 4+ válidos).
5. Valor comercial = mediana ponderada de precios ajustados. Publicación = valor +2,5 %, terminado en …90.000. Cierre = publicación −6 % a −3 %.
6. Confianza: alta (≥5 válidos, ≥3 misma versión, dispersión ≤12 %), media (≥3), baja.
7. Menos de 3 válidos o versión sin confirmar ⇒ **pre-estimación**; aprobarla exige excepción con comentario y el informe sale rotulado.
8. Advertencias: fuera de RM, financiamiento, dispersión alta, publicación bajo todos los avisos, **aviso igual o más nuevo con menos km publicado bajo nuestra sugerencia**, publicación sobre el rango.

### Separación cliente / NOM
- El informe y el link público solo leen `nom.payload_cliente(id)`: lista blanca de campos. La parte interna está en otra tabla (`nom.tasacion_interna`) que esa función no toca.
- Ninguna tabla `nom.*` es legible desde la app ni con la clave pública: todo pasa por funciones con control de rol.
- API: la parte interna exige permiso `nom_interno` (o `*`). Un agente setter con permiso `nom_tasador` puede crear, investigar y calcular, pero no ver lo interno.

## 3. Interfaces para las fases siguientes

| Fase | Punto de integración ya disponible |
|---|---|
| 2 · WhatsApp | `nom.tasaciones.conversacion_id`, `origen = 'whatsapp'`; herramientas MCP `nom_tasacion_crear` / `nom_registrar_mercado` / `nom_tasacion_calcular`; `nom.registrar_envio(id, 'whatsapp_api', destinatario)` solo acepta versiones aprobadas; el link `#/t/<token>` es lo que se envía. |
| 2 · CRM | `oportunidad_id` y `empresa_id`; el envío crea una actividad en la oportunidad; botón «Tasar» en oportunidades NOM consignante. |
| 3 · Agenda Chicureo | La tasación aprobada es el disparador natural de `revision_agendada`. Falta: dirección y horario reales, y calendario conectado. |
| 3 · Inspección | `inspeccion_folio` → `public.nom_inspecciones`. Tras la inspección se crea **nueva versión** con lo observado (`fuentes` = `observado_en_inspeccion`) y se recalcula. |
| 4 · Consignación | `vehiculo_id` (→ `ops.vehiculos`), `nom.tasacion_interna.modalidad_recomendada`, `precio_publicacion` como base del acuerdo; contrato desde documentos aprobados. |
| 4 · Publicación | Los avisos comparables y el precio aprobado alimentan el copy y el precio de los anuncios. |

## 4. Archivos

- `supabase/migrations/20261118060000_core_v31_nom_tasador.sql` · esquema, motor, app y API
- `supabase/migrations/20261118061000_core_v32_nom_tasador_api_autor.sql` · autoría en la API
- `supabase/migrations/20261118062000_core_v33_nom_tasador_alerta_posicion.sql` · alerta de posicionamiento
- `supabase/tests/nom_tasador_test.sql` · 11 pruebas en transacción revertida (resultado 18-nov: 11/11)
- `supabase/functions/core-api/index.ts` · herramientas `nom_*`
- `app/informe-tasacion.js` · plantilla del informe (app, link público y PDF)
- `app/app.js` · módulo Tasaciones NOM · `app/img/nom-logo.png` (extraído del PDF de referencia: **reemplazar por el oficial en alta**)
- `scripts/informe_pdf.py` · genera el PDF desde el payload · `scripts/test_informe_pdf.py` · pruebas del PDF

## 5. Cómo probar

```bash
# base: correr supabase/tests/nom_tasador_test.sql en el editor SQL; debe terminar en «PRUEBAS OK (11)» (todo se revierte)
pip install playwright pypdf && python3 scripts/test_informe_pdf.py tests/fixtures/*.json
python3 scripts/informe_pdf.py tests/fixtures/informe_nivus_real_2026-11-18.json informe.pdf
```
En la app: Comercial → Tasaciones NOM → `NOM-TAS-2026-11-18-0001` (prueba real con mercado vigente, sin cliente).

## 6. Cambios del 18-nov (mañana) · `core_v34`

- **Modo conservador** (Felipe: «más a la baja que hacia arriba, para vender más rápido»): valor = percentil 35 ponderado de los precios ajustados; publicación = valor +1 %; nunca sobre un aviso válido igual o más nuevo con menos km; cierre = publicación −2 % a −5 %. Nivus de prueba: $12.290.000 → **$11.590.000** (la tasación manual previa decía $11.790.000).
- **Oficina** en `core.parametros['nom.oficina']`: Avenida Puerto Oriente 361, oficina 409P, Chicureo (Colina). Lunes a viernes, 9:00 a 18:00, previa coordinación.
- **Patente visible** en el informe (confirmado). **Logo oficial** con fondo transparente en `app/img/nom-logo.png`.
- Prueba T12 (modo conservador). 12/12.
