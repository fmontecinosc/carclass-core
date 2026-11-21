-- core_v50 · nom_inspecciones solo para usuarios de Carclass Core (Felipe 21-nov-2026: «que no pueda ingresar nadie
-- excepto yo o quien ingrese a través de Core»). nom-inspeccion v2 pide login de Core y usa el token de la sesión.
-- Se quitan las políticas anon de core_v49; queda solo usuarios_core_todo (authenticated + core.usuarios activo).
drop policy if exists anon_select_recientes on public.nom_inspecciones;
drop policy if exists anon_insert_sin_pago on public.nom_inspecciones;
drop policy if exists anon_update_recientes_sin_pago on public.nom_inspecciones;
revoke all on public.nom_inspecciones from anon;
