-- core_v54 · NOM compra directa y parte de pago (Felipe 21-nov-2026, procesos v2.4 ficha 10)
-- Flujo propio en el embudo NOM: nuevo → calificando → tasado → oferta_enviada → aceptada → inspeccionado → comprado (ganada).
-- Después de comprar, en preparación y publicado se siguen en Vehículos (stock propio, modalidad compra_directa).
alter table crm.oportunidades drop constraint if exists flujo_ok;
alter table crm.oportunidades add constraint flujo_ok check (flujo is null or flujo = any (array['consignante', 'comprador', 'compra_directa']));

create or replace function core.etapas(p_unidad text, p_flujo text default null)
returns text[] language sql immutable set search_path to '' as $function$
  select case
    when p_unidad in ('blackgps','somosb2b') then array['pre_revision','por_contactar','en_prospeccion','reunion_por_agendar','en_asisma','onboarding']
    when p_unidad = 'carclass' then array['nuevo','calificando','pre_evaluado','cotizado','negociando','agendado','en_taller','entregado']
    when p_unidad = 'carwash'  then array['nuevo','coordinando','agendado','atendido']
    when p_unidad = 'nom' and p_flujo = 'comprador' then array['nuevo','calificando','presentado','visita_agendada','negociando','reservado','entregado']
    when p_unidad = 'nom' and p_flujo = 'compra_directa' then array['nuevo','calificando','tasado','oferta_enviada','aceptada','inspeccionado','comprado']
    when p_unidad = 'nom' then array['nuevo','calificando','revision_agendada','revisado','propuesta','contrato_firmado','publicado','negociando']
    else array['nuevo','en_curso'] end
$function$;

update ops.sops set contenido = replace(contenido,
  'Etapas propuestas: nuevo → calificando → tasado → oferta_enviada → aceptada → inspeccionado → comprado (ganada) → en_preparacion → publicado. (Pendiente: estas etapas aún no existen en Core; hoy el flujo compra_directa usa las de consignación.)',
  'Etapas (flujo compra_directa en Core): nuevo → calificando → tasado → oferta_enviada → aceptada → inspeccionado → comprado (ganada). Después: en preparación → publicado, en Vehículos (stock propio).'),
  actualizado_en = now()
where tipo = 'proceso' and titulo = 'NOM compra directa y parte de pago';

-- Clasificar un chat de WhatsApp como NOM compra directa
do $$ declare d text; begin
  d := pg_get_functiondef('public.app_conversacion_clasificar(uuid,text,text,boolean)'::regprocedure);
  d := replace(d, $q$coalesce(p_flujo, '') not in ('consignante', 'comprador')$q$, $q$coalesce(p_flujo, '') not in ('consignante', 'comprador', 'compra_directa')$q$);
  execute d;
end $$;
