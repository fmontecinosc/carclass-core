-- core_v66 · la app muestra cuándo Kapso (WhatsApp API) está sin cupo: app_asesor_modos devuelve kapso_limite_hasta
-- (wa.config, lo marca wa-agente al recibir un 402 «Free plan message limit»). Mientras esté vigente, nada sale por la API.
create or replace function public.app_asesor_modos()
returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare v_lim timestamptz;
begin
  perform core.exigir_usuario();
  begin
    select nullif(valor, '')::timestamptz into v_lim from wa.config where clave = 'kapso_limite_hasta';
  exception when others then v_lim := null;
  end;
  return jsonb_build_object(
    'modos', (select jsonb_object_agg(u, wa.modo_agente(u)) from unnest(array['carclass', 'nom', 'blackgps']) u),
    'puede_editar', core.es_dueno(),
    'programado', exists (select 1 from cron.job where active and command ilike '%wa-agente%'),
    'kapso_limite_hasta', case when v_lim > now() then v_lim end);
end $function$;
