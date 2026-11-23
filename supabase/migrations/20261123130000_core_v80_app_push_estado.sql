-- core_v80 · Estado de la suscripción push de este dispositivo (23-nov-2026).
-- La app compara su endpoint local con el servidor al iniciar: si core-push lo dio por muerto (404/410 → activa = false)
-- o no existe, la app cancela la suscripción vieja y crea una nueva, en vez de reactivar un endpoint que ya no sirve.
create or replace function public.app_push_estado(p_endpoint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r core.push_suscripciones;
begin
  perform core.exigir_usuario();
  select * into r from core.push_suscripciones where endpoint = p_endpoint and user_id = auth.uid();
  return jsonb_build_object('existe', r.id is not null, 'activa', coalesce(r.activa, false),
    'dispositivos', (select count(*) from core.push_suscripciones where user_id = auth.uid() and activa));
end $$;
revoke all on function public.app_push_estado(text) from public, anon;
grant execute on function public.app_push_estado(text) to authenticated;
