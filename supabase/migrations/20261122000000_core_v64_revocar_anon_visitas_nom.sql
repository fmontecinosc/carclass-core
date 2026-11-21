-- core_v64 · Defensa en profundidad: las funciones de visitas NOM ya exigen dueño (core.es_dueno), pero anon no debe poder llamarlas.
revoke all on function public.app_nom_visita_accion(uuid, text, text) from public, anon;
revoke all on function public.app_nom_visitas(date) from public, anon;
grant execute on function public.app_nom_visita_accion(uuid, text, text) to authenticated;
grant execute on function public.app_nom_visitas(date) to authenticated;
