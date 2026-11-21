-- v35 · NOM: comisión definitiva, fee de entrada, flujo consignantes actualizado y catálogo de links de pago
-- Felipe 18-nov-2026: «5% bajo los 20 millones, 3% sobre 20 millones, mínimo $500.000; déjalo establecido en el cerebro,
-- la memoria y todos los respaldos». Fee de entrada $50.000 al agendar (transferencia o link de Mercado Pago).

update core.parametros set valor = jsonb_build_object(
  'regla', 'definitiva (Felipe 18-nov-2026)',
  'pct_hasta_umbral', 5, 'umbral_clp', 20000000, 'pct_sobre_umbral', 3, 'minimo_clp', 500000,
  'tramo_pendiente', 'confirmar si el 3% aplica a todo el precio de los autos sobre $20 MM o solo al exceso',
  'fee_entrada_clp', 50000, 'fee_cuando', 'al agendar la visita', 'fee_medios', jsonb_build_array('transferencia', 'link_mercadopago'),
  'fee_reembolsable', false, 'fee_descontable_de_comision', true,
  'agente_menciona', false, 'montos_con_iva', true),
  notas = 'Comisión NOM definitiva. Reemplaza las referencias anteriores (4% mín. $150.000 del mapa de procesos y el rango 3–5%).',
  actualizado_en = now()
where clave = 'nom.comision';

update ops.sops set contenido = $t$
Etapas: nuevo → calificando → revision_agendada → revisado → propuesta → contrato_firmado → publicado → negociando → vendido (ganada) | no_renovado.
- Calificando (setter): marca, modelo, versión, año, km, precio esperado, documentos, prendas, exclusividad. Criterios: 2015+, sin prendas, precio ±10% de mercado.
- Tasación (Core · Tasaciones NOM): avisos reales verificados, modo conservador (percentil 35, nunca sobre un comparable mejor). Felipe aprueba antes de enviar; el informe nunca muestra datos internos.
- Visita en la oficina de Chicureo (Av. Puerto Oriente 361, of. 409P · lunes a viernes 9:00–18:00, previa coordinación): inspección, fotos y firma. Se agenda con fee de entrada de $50.000 (transferencia o link de Mercado Pago), no reembolsable y descontable de la comisión.
- Revisión 4 capas con herramienta de inspección; score ≥ 75% aprueba.
- Propuesta: 3 comparables, precio publicación y piso. Comisión: 5% bajo $20 MM, 3% sobre $20 MM, mínimo $500.000 (con IVA). Contrato con exclusividad 45 días.
- Contrato: borrador por WhatsApp para revisión y firma.
- Publicado: fotos, ficha, Chileautos, Yapo, Instagram; reporte semanal al consignante.
- Nada bajo el piso sin aprobación escrita. Liquidación en 3 días hábiles.
$t$
where titulo = 'Flujo NOM consignantes';

-- Links de pago (Mercado Pago u otro). Fijos (monto estándar) o generados por cliente desde la API.
create table if not exists core.links_pago (
  id uuid primary key default gen_random_uuid(),
  unidad text not null check (unidad in ('carclass','nom','carwash','blackgps','grupo')),
  codigo text not null,                       -- ej. nom_fee_entrada, carclass_abono_reserva, ceramico_4
  concepto text not null,
  monto bigint not null check (monto > 0),    -- CLP con IVA
  proveedor text not null default 'mercadopago',
  tipo text not null default 'fijo' check (tipo in ('fijo','dinamico')),
  url text check (url is null or url ~* '^https://'),
  activo boolean not null default true,
  notas text,
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
  unique (unidad, codigo, monto)
);
alter table core.links_pago enable row level security;
create trigger auditar after insert or update or delete on core.links_pago for each row execute function core.auditar();
insert into core.links_pago (unidad, codigo, concepto, monto, tipo, activo, notas)
values ('nom', 'nom_fee_entrada', 'Fee de entrada consignación NOM (descontable de la comisión)', 50000, 'fijo', false, 'Falta la URL de Mercado Pago')
on conflict do nothing;
