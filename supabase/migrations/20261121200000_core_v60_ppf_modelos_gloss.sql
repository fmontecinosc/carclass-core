-- core_v60 · PPF por defecto XPEL Gloss (Felipe 21-nov): app_ppf_modelos entrega las calidades como «gloss» y «ultimate».
-- Mantiene las claves «xtreme» y «ultimate_plus_8» (mismos valores) por compatibilidad. Los precios no cambian.
create or replace function public.app_ppf_modelos(p_q text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_ws text[]; v_res jsonb;
begin
  perform core.exigir_usuario();
  v_ws := array(select w from unnest(string_to_array(regexp_replace(lower(coalesce(p_q,'')), '[^a-z0-9 ]+', ' ', 'g'), ' ')) w where w <> '');
  if coalesce(array_length(v_ws,1),0) = 0 then return '[]'::jsonb; end if;
  with base as (
    select drive_file_id, modelo, modelo_norm, fecha_planilla, material, kit, precio_publico,
           string_to_array(modelo_norm, ' ') t
    from crm.ppf_modelos
    where not es_pieza and precio_publico > 0
      and not exists (select 1 from unnest(v_ws) w where position(w in replace(modelo_norm,' ','')) = 0)
  ), marcados as (
    select b.*, not exists (
      select 1 from unnest(v_ws) w
      where not (w = any(b.t) or w = any(array(select b.t[i] || b.t[i+1] from generate_subscripts(b.t,1) i where i < array_length(b.t,1))))
    ) exacta from base b
  ), elegidos as (
    select * from marcados where exacta or not exists (select 1 from marcados where exacta)
  ), por_planilla as (
    select drive_file_id, min(modelo) modelo, max(fecha_planilla) fecha,
      jsonb_build_object(
        'gloss', jsonb_build_object('kit_frontal_reducido', max(precio_publico) filter (where material='gloss' and kit='kit_frontal_reducido'),
                                     'kit_frontal', max(precio_publico) filter (where material='gloss' and kit='kit_frontal_5'),
                                     'completo_exterior', max(precio_publico) filter (where material='gloss' and kit='completo_wpf')),
        'ultimate', jsonb_build_object('kit_frontal_reducido', max(precio_publico) filter (where material='ultimate_stealth' and kit='kit_frontal_reducido'),
                                     'kit_frontal', max(precio_publico) filter (where material='ultimate_stealth' and kit='kit_frontal_5'),
                                     'completo_exterior', max(precio_publico) filter (where material='ultimate_stealth' and kit='completo_wpf')),
        -- claves anteriores, mientras se actualizan los clientes (cotizador de Netlify)
        'xtreme', jsonb_build_object('kit_frontal_reducido', max(precio_publico) filter (where material='gloss' and kit='kit_frontal_reducido'),
                                     'kit_frontal', max(precio_publico) filter (where material='gloss' and kit='kit_frontal_5'),
                                     'completo_exterior', max(precio_publico) filter (where material='gloss' and kit='completo_wpf')),
        'ultimate_plus_8', jsonb_build_object('kit_frontal_reducido', max(precio_publico) filter (where material='ultimate_stealth' and kit='kit_frontal_reducido'),
                                     'kit_frontal', max(precio_publico) filter (where material='ultimate_stealth' and kit='kit_frontal_5'),
                                     'completo_exterior', max(precio_publico) filter (where material='ultimate_stealth' and kit='completo_wpf'))) kits
    from elegidos group by drive_file_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('planilla', drive_file_id, 'modelo', modelo, 'fecha', fecha, 'kits', kits) order by fecha desc nulls last, modelo), '[]')
    into v_res from (select * from por_planilla order by fecha desc nulls last, modelo limit 8) x;
  return v_res;
end $$;
revoke all on function public.app_ppf_modelos(text) from public, anon;
grant execute on function public.app_ppf_modelos(text) to authenticated;
