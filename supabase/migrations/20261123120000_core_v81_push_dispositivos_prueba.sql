-- core_v81 · Avisos push: lista de dispositivos del usuario y aviso de prueba (para la interfaz en Equipo)
create or replace function public.app_push_dispositivos() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
begin
  perform core.exigir_usuario();
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'activa', s.activa, 'fallos', s.fallos, 'creado_en', s.creado_en, 'ultimo_envio', s.ultimo_envio,
      'dispositivo', s.dispositivo,
      'tipo', case when s.dispositivo ilike '%iphone%' or s.dispositivo ilike '%ipad%' then 'iPhone'
                   when s.dispositivo ilike '%android%' then 'Android'
                   when s.dispositivo ilike '%windows%' then 'Windows'
                   when s.dispositivo ilike '%mac os%' then 'Mac' else 'Otro' end)
    order by s.activa desc, s.creado_en desc)
    from core.push_suscripciones s where s.user_id = auth.uid()), '[]'::jsonb);
end $$;
revoke all on function public.app_push_dispositivos() from public, anon;
grant execute on function public.app_push_dispositivos() to authenticated;

-- Aviso de prueba a todos los dispositivos activos (core-push envía a todas las suscripciones activas)
create or replace function public.app_push_probar() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare n int;
begin
  perform core.exigir_usuario();
  select count(*) into n from core.push_suscripciones where user_id = auth.uid() and activa;
  if n = 0 then return jsonb_build_object('ok', false, 'activos', 0, 'mensaje', 'No hay dispositivos con avisos activos. Pulsa «Activar avisos» en cada dispositivo.'); end if;
  perform core.push('Aviso de prueba', 'Si ves esto, los avisos de Carclass Core llegan a este dispositivo.', '#/notificaciones', 'prueba:' || gen_random_uuid());
  return jsonb_build_object('ok', true, 'activos', n);
end $$;
revoke all on function public.app_push_probar() from public, anon;
grant execute on function public.app_push_probar() to authenticated;
