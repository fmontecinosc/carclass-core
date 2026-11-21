-- core_v65 · Preparación para más usuarios: las funciones del cotizador y PPF exigen acceso a Carclass (core.puede), no solo ser usuario.
do $$
declare f text; d text;
begin
  foreach f in array array['public.app_cotizacion_buscar(text)', 'public.app_orden_avance(jsonb)', 'public.app_ppf_modelos(text)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('core.puede(''carclass'')' in d) = 0 then
      d := replace(d, 'perform core.exigir_usuario();', 'perform core.exigir_usuario(); if not core.puede(''carclass'') then raise exception ''Sin acceso a Carclass''; end if;');
      execute d;
    end if;
  end loop;
end $$;

create or replace function public.app_oportunidad_estado(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o crm.oportunidades;
begin
  perform core.exigir_usuario();
  select * into o from crm.oportunidades where id = p_id;
  if o.id is null or not core.puede(o.unidad) then return null; end if;
  return jsonb_build_object('id', o.id, 'estado', o.estado, 'etapa', o.etapa, 'unidad', o.unidad);
end $$;
revoke all on function public.app_oportunidad_estado(uuid) from public, anon;
grant execute on function public.app_oportunidad_estado(uuid) to authenticated;
