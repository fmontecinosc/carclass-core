# Revisión nocturna · 21 al 22 de noviembre de 2026

Autorización de Felipe: revisar la ingeniería del negocio, la app, los procesos, el uso de la cuenta, las integraciones, el agente y los futuros usuarios, y tomar decisiones según las recomendaciones. Sin envíos a clientes reales, sin crear usuarios ni registrar movimientos financieros.

## 1. Urgente: WhatsApp sin cupo en Kapso

- Desde el **20-nov 22:14** Kapso responde 402: «Free plan message limit (2,000/month) reached». En noviembre van 2.978 eventos de webhook. Los mensajes de clientes **siguen entrando**, pero **nada sale por la API**: asesor, seguimientos, informes NOM y el envío desde Conversaciones.
- Impacto hasta ahora: bajo. Felipe respondió los leads desde su teléfono (105 mensajes en 7 días). Solo quedan esperando una consulta sin unidad sobre un pago con Caja Vecina y un lead de BlackGPS del 19-nov fuera de ventana.
- Lo que se hizo: wa-agente v13. Ante un 402, el turno queda como **borrador** (se envía desde el teléfono con «Enviar desde mi WhatsApp»), se marca `wa.config.kapso_limite_hasta` por 24 h, llega un aviso push al día y mientras dure la marca «activo» trabaja como «borrador», seguimientos incluidos. Se reintenta solo cada 24 h.
- **Decisión de Felipe:** subir Kapso a un plan pagado (o esperar el reinicio del ciclo). Al subir de plan, borrar la clave `kapso_limite_hasta` de `wa.config` para volver a enviar al instante.

## 2. Hecho esta noche

| Tema | Cambio |
|---|---|
| PPF | XPEL Gloss por defecto en prompt, PDF, herramientas, cotizador y `app_ppf_modelos` (claves `gloss`/`ultimate`, `core_v60`). Sin espesores; si los piden, «datos del fabricante, en la recepción te mostramos la ficha técnica», sin traspasar. |
| Venta cruzada | Activa nombrando la marca, solo con la primera venta cerrada (`core_v62`). Si el cliente cuenta antes que quiere vender su auto, se registra en la ficha y se retoma al cerrar. |
| NOM | Reporte al consignante cada 7 días (`nom.reporte_consignante`). Informe de tasación con botón «Agendar visita por WhatsApp» (y «Elegir horario en el calendario» si existe `nom.oficina.agenda_url`). Stock: autos hasta 10% sobre el presupuesto se muestran como «conversables» (antes el Corolla Cross quedaba fuera para un comprador de $17 MM). |
| Carwash.hf | Pulido Básico aprox. $150.000 y Sellado Cerámico Lite $250.000 (`core_v61`). |
| Cotizador | Integrado con Core (`core_v63`): trae la cotización del asesor, la orden se liga a la oportunidad (ingreso → «En taller», entrega → «Entregado») y la venta se registra como ganada con postventa automática. Botón «Orden de ingreso» en cada cotización Carclass (app 2.10.2/2.10.3). Probado de punta a punta en una transacción revertida. |
| PDF | Estética de cada marca: Carclass como el cotizador, NOM como el informe de la app. |
| Seguridad | `core_v64`: anon sin acceso a las funciones de visitas NOM. `core_v65`: cotizador y PPF exigen acceso a Carclass por unidad. |
| Limpieza | Borrada la tasación de prueba del RAV4. |
| Pruebas | 11 simulaciones del asesor (lotes `noche-21nov` y `noche-21nov-b` en `qa.simulaciones`): venta cruzada, PPF, retiro bajo $600.000, recepción sin «nuestro taller», NOM consignante y comprador. Todas correctas tras los ajustes. |

## 3. Para decidir (Felipe)

1. **Kapso:** subir de plan (punto 1).
2. **Stock NOM:** `ops.vehiculos` tiene un **Opel Astra GTC 2016 «disponible» a $9 MM**, pero lo vigente según lo conversado es solo el Corolla Cross. ¿Se vendió o se retiró?
3. **Corolla Cross:** publicado en Core en $17.490.000; lo conversado el 18-nov fue venta ideal $16.500.000 y mínimo $16.000.000. ¿Se ajusta el precio publicado?
4. **NOM en «observar»:** el asesor no solicita tasaciones ni agenda visitas por sí mismo; traspasa. Con el tasador, el PDF y la visita listos, se puede pasar a «activo» (la tasación sigue necesitando tu aprobación). Recomendación: activarlo cuando Kapso tenga cupo.
5. **Cotizador BlackGPS:** en v2.1 se decidió que las cotizaciones BlackGPS viven en Asisma; luego pediste integrar el cotizador Black a Core. ¿Core cotiza BlackGPS o solo prepara y traspasa a Asisma?

## 4. Usuarios futuros (Stephanie, Jorge, Bryan): qué falta antes de invitarlos

La base ya tiene el modelo: `core.usuarios` (rol, unidades, ve_finanzas, activo), `core.puede(unidad)` en las políticas de `crm`, `ops` y `fin`, y finanzas solo para el dueño o quien tenga `ve_finanzas`.

Brechas encontradas:

- **24 de 37 funciones `app_*` con privilegios solo verifican que el usuario exista**, no su unidad. Un operador de Carwash.hf podría ver conversaciones o tasaciones de NOM. Las del cotizador ya se corrigieron (`core_v65`). Faltan Conversaciones (`app_conversacion*`, `app_borrador_descartar`), fichas y oportunidades (`app_ficha_guardar`, `app_oportunidad_guardar`) y Tasaciones NOM (`app_nom_*`; la aprobación ya exige dueño internamente).
- **29 tablas antiguas `public.*` abiertas a cualquier usuario autenticado** (car_ventas, gps_contratos, movimientos, clientes, leads, car_ordenes…), con datos financieros incluidos. Hay que cerrarlas o restringirlas al dueño antes del primer usuario adicional.
- No existe flujo de invitación ni permisos por módulo; la matriz de Equipo es solo de lectura.

Plan propuesto, en orden:

1. Migración que agrega `core.puede(unidad)` a las 24 funciones y restringe las 29 tablas `public.*` a `core.es_dueno()`. Se prueba con un usuario de prueba con unidad `carwash` en una transacción revertida.
2. Roles: `dueno`, `admin_finanzas` (ve finanzas, no aprueba tasaciones), `comercial` (unidades asignadas, sin finanzas), `operacion` (tareas, vehículos, órdenes y agenda de sus unidades) y `closer_nom` (Bryan: NOM compradores y consignantes, sin finanzas).
3. Invitación desde Equipo (`app_invitar_usuario`, solo dueño, con correo, rol y unidades) usando la invitación de Supabase Auth. El onboarding de 3 pasos ya existe.
4. Conversaciones por unidad: cada usuario ve solo los chats de sus unidades; los personales, nunca.

## 5. BlackGPS en Core (pendiente)

- Ya existe: embudo de setter (pre-revisión → prospección → reunión → Asisma), meta de llamadas, landing con pre-revisión, asesor en borrador con seguimientos de días 1, 4, 10 y 21, y ventas únicas.
- Falta: registro diario de llamadas con resultado (hoy se registran como actividades sueltas), el playbook como guía en la ficha (ya está en `core_v30`), y una cola diaria de postventa: clientes con contrato sin contacto en 60 días y visitas recomendadas según equipos, antigüedad y tickets.
- Depende de la decisión del punto 3.5.

## 6. Salud de la operación (22-nov, madrugada)

- 13 tareas abiertas: 6 vencidas y 4 de «[WhatsApp]».
- 43 oportunidades abiertas (BlackGPS 30, Carclass 8, NOM 3, Carwash.hf 2): 24 con la próxima acción vencida (la mayoría BlackGPS).
- 19 leads en 7 días; costo del asesor en 7 días: USD 0,31.
- 6 dispositivos con avisos push activos.
