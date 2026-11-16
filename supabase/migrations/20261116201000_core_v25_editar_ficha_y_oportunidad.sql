-- v25 · Editar la ficha del cliente y los datos de una oportunidad desde la app (Felipe 16-nov: «no me permite editar el lead»)
-- Respeta la deduplicación: un RUT o un teléfono que ya tiene otra ficha no se puede repetir.

create or replace function public.app_ficha_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid := (p->>'id')::uuid; e crm.empresas; v_rut text; v_tel text; v_otro text; k jsonb := p->'contacto';
begin
  perform core.exigir_usuario(); perform set_config('core.autor', core.autor(), true);
  select * into e from crm.empresas where id = v_id; if e.id is null then raise exception 'Cliente no encontrado'; end if;
  if nullif(trim(p->>'nombre'), '') is null then raise exception 'Escribe el nombre'; end if;
  v_rut := case when nullif(trim(p->>'rut'), '') is null then null else core.norm_rut(p->>'rut') end;
  if v_rut is not null then
    select nombre into v_otro from crm.empresas where rut = v_rut and id <> v_id;
    if v_otro is not null then raise exception 'Ese RUT ya está en la ficha de %', v_otro; end if;
  end if;
  v_tel := nullif(trim(p->>'telefono'), '');
  if v_tel is not null and e.tipo = 'persona' then
    select nombre into v_otro from crm.empresas where telefono_norm = core.norm_tel(v_tel) and id <> v_id and tipo = 'persona';
    if v_otro is not null then raise exception 'Ese teléfono ya está en la ficha de %', v_otro; end if;
  end if;
  update crm.empresas set nombre = trim(p->>'nombre'), rut = v_rut, telefono = v_tel, email = nullif(trim(p->>'email'), ''),
         comuna = nullif(trim(p->>'comuna'), ''), region = nullif(trim(p->>'region'), ''), direccion = nullif(trim(p->>'direccion'), ''),
         rubro = nullif(trim(p->>'rubro'), ''), tamano_flota = nullif(p->>'flota', '')::int, notas = nullif(trim(p->>'notas'), '')
   where id = v_id;
  if k is not null and nullif(trim(k->>'nombre'), '') is not null then
    if nullif(k->>'id', '') is not null then
      update crm.contactos set nombre = trim(k->>'nombre'), cargo = nullif(trim(k->>'cargo'), ''), telefono = nullif(trim(k->>'telefono'), ''),
             email = nullif(trim(k->>'email'), '') where id = (k->>'id')::uuid and empresa_id = v_id;
    else
      insert into crm.contactos (empresa_id, nombre, cargo, telefono, email, decisor, creado_por)
      values (v_id, trim(k->>'nombre'), nullif(trim(k->>'cargo'), ''), nullif(trim(k->>'telefono'), ''), nullif(trim(k->>'email'), ''),
              not exists (select 1 from crm.contactos where empresa_id = v_id), core.autor());
    end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.app_oportunidad_guardar(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o crm.oportunidades;
begin
  perform core.exigir_usuario(); perform set_config('core.autor', core.autor(), true);
  select * into o from crm.oportunidades where id = (p->>'id')::uuid; if o.id is null then raise exception 'Oportunidad no encontrada'; end if;
  if o.estado = 'abierta' and (nullif(trim(p->>'proxima_accion'), '') is null or nullif(p->>'proxima_fecha', '') is null) then
    raise exception 'Toda oportunidad abierta necesita próxima acción y fecha';
  end if;
  update crm.oportunidades set titulo = nullif(trim(p->>'titulo'), ''), proxima_accion = nullif(trim(p->>'proxima_accion'), ''),
         proxima_fecha = nullif(p->>'proxima_fecha', '')::date, monto_estimado = nullif(p->>'monto', '')::bigint
   where id = o.id;
  return jsonb_build_object('ok', true, 'id', o.id);
end $$;

revoke execute on function public.app_ficha_guardar(jsonb), public.app_oportunidad_guardar(jsonb) from public, anon;
grant execute on function public.app_ficha_guardar(jsonb), public.app_oportunidad_guardar(jsonb) to authenticated;
