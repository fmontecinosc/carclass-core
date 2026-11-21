-- core_v53 · Estado de la investigación de mercado de una tasación (para la app: botón «Investigar mercado con IA»).
create or replace function public.app_nom_investigacion(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not nom.puede_aprobar() then return null; end if;
  return (select jsonb_build_object('id', i.id, 'estado', i.estado, 'etapas', i.vueltas, 'intentos', i.intentos, 'costo_usd', i.costo_usd,
            'error', i.error, 'creado_en', i.creado_en, 'terminado_en', i.terminado_en,
            'avisos', i.resultado->'avisos', 'verificados', i.resultado->'verificados', 'notas', i.resultado->>'notas_internas')
          from nom.investigaciones i where i.tasacion_id = p_id order by i.creado_en desc limit 1);
end $$;
revoke all on function public.app_nom_investigacion(uuid) from public, anon;
grant execute on function public.app_nom_investigacion(uuid) to authenticated;
