-- v30 · Playbook comercial del panel anterior (app.carclass.cl) traído a Core (Felipe 17-nov)
-- 10 secciones y 35 textos de public.playbook_* (producto, perfiles, scripts, objeciones, cierre, postventa, KPIs, onboarding).
-- Se guardan en ops.sops con tipo «playbook»: se ven en Ayuda de la app como referencia, pero NO entran a
-- core.api_procesos (lo que leen los agentes), porque traen datos de antes (Kommo, ManyChat, plazos y precios de 2026-T3).

insert into ops.sops (unidad, titulo, seccion, contenido, orden, tipo)
select 'carclass', 'Playbook · ' || s.titulo, 'Playbook comercial (panel anterior)',
       coalesce(nullif(s.descripcion, '') || E'\n\n', '') ||
       string_agg('### ' || i.titulo || E'\n' || coalesce(i.contenido, ''), E'\n\n' order by i.orden),
       100 + coalesce(s.orden, 0), 'playbook'
from public.playbook_secciones s
join public.playbook_items i on i.seccion_id = s.id and coalesce(i.activo, true)
where coalesce(s.activo, true)
  and not exists (select 1 from ops.sops x where x.tipo = 'playbook' and x.titulo = 'Playbook · ' || s.titulo)
group by s.id, s.titulo, s.descripcion, s.orden;

-- La app muestra procesos + playbook; los agentes siguen leyendo solo procesos
create or replace function public.app_procesos(p_unidad text default null)
returns jsonb language sql stable set search_path = '' as $$
  select core.api_procesos(p_unidad) || coalesce((
    select jsonb_agg(jsonb_build_object('unidad', unidad, 'titulo', titulo, 'contenido', contenido, 'tipo', tipo) order by orden)
    from ops.sops where tipo = 'playbook' and (p_unidad is null or unidad in (p_unidad, 'grupo'))), '[]'::jsonb)
$$;
