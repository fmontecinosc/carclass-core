-- v32 · API del tasador NOM con autor (la clave de API queda registrada como autor en la auditoría)
-- Mismo patrón que core.api_*: el último parámetro es el autor que entrega core-api.
drop function if exists core.api_nom_tasacion_crear(jsonb), core.api_nom_tasacion_actualizar(uuid, jsonb),
  core.api_nom_registrar_mercado(uuid, jsonb), core.api_nom_tasacion_calcular(uuid);

create or replace function core.api_nom_tasacion_crear(p jsonb, p_autor text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  perform set_config('core.autor', coalesce(p_autor, 'api'), true);
  v := nom.crear((p - 'interna') || jsonb_build_object('origen', coalesce(nullif(p->>'origen',''), 'mcp')));
  return nom.vista_interna(v);
end $$;

create or replace function core.api_nom_tasacion_actualizar(p_id uuid, p jsonb, p_autor text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('core.autor', coalesce(p_autor, 'api'), true);
  perform nom.actualizar(p_id, p - 'interna');
  return nom.vista_interna(p_id);
end $$;

create or replace function core.api_nom_registrar_mercado(p_id uuid, p jsonb, p_autor text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('core.autor', coalesce(p_autor, 'api'), true);
  return nom.registrar_busqueda(p_id, p);
end $$;

create or replace function core.api_nom_tasacion_calcular(p_id uuid, p_autor text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('core.autor', coalesce(p_autor, 'api'), true);
  return nom.calcular(p_id) || jsonb_build_object('informe', nom.payload_cliente(p_id));
end $$;

-- La parte interna (precio pretendido, toma, comisión…) solo con permiso explícito «nom_interno» en core-api.
create or replace function core.api_nom_interna_guardar(p_id uuid, p jsonb, p_autor text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('core.autor', coalesce(p_autor, 'api'), true);
  perform nom.guardar_interna(p_id, p);
  return (select to_jsonb(i) from nom.tasacion_interna i where i.tasacion_id = p_id);
end $$;

revoke all on function core.api_nom_tasacion_crear(jsonb, text), core.api_nom_tasacion_actualizar(uuid, jsonb, text),
  core.api_nom_registrar_mercado(uuid, jsonb, text), core.api_nom_tasacion_calcular(uuid, text), core.api_nom_interna_guardar(uuid, jsonb, text)
  from public, anon, authenticated;
