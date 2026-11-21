-- v33 · Tasador NOM: alerta de posicionamiento del precio de publicación
-- Detectado en la primera tasación real (Nivus Comfortline AT 2022, 18-nov): el ajuste por km/año puede llevar la
-- publicación sugerida sobre avisos del mismo año con MENOS kilometraje, que es justo lo que hace que un aviso no
-- se vea atractivo. No se cambia la cifra sola (es una decisión comercial): se advierte para que el tasador la ajuste
-- con motivo o la mantenga.
alter function nom.calcular(uuid) rename to calcular_base;

create or replace function nom.calcular(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; v_mejor record; v_adv jsonb := '[]'::jsonb;
begin
  perform nom.calcular_base(p_id);
  select * into t from nom.tasaciones where id = p_id;
  if t.precio_publicacion is not null then
    -- aviso válido igual o más nuevo y con menos km, publicado bajo nuestra sugerencia
    select m.precio, m.anio, m.km into v_mejor from nom.mercado_avisos m
     where m.tasacion_id = p_id and m.valido and m.anio >= t.anio and coalesce(m.km, 0) < coalesce(t.km, 0)
       and m.precio < t.precio_publicacion order by m.precio limit 1;
    if v_mejor.precio is not null then
      v_adv := v_adv || to_jsonb(format('Hay un aviso %s con %s km publicado a $%s, bajo la publicación sugerida ($%s) y con menos kilometraje: el auto podría verse caro frente a él.',
        v_mejor.anio, replace(to_char(v_mejor.km, 'FM999,999,999'), ',', '.'), replace(to_char(v_mejor.precio, 'FM999,999,999'), ',', '.'), replace(to_char(t.precio_publicacion, 'FM999,999,999'), ',', '.')));
    end if;
    -- publicación sobre el rango de oferta comparable
    if t.rango_oferta_max is not null and t.precio_publicacion > t.rango_oferta_max then
      v_adv := v_adv || to_jsonb('La publicación sugerida queda sobre el rango de oferta comparable.'::text);
    end if;
  end if;
  if jsonb_array_length(v_adv) > 0 then
    update nom.tasaciones set advertencias = advertencias || v_adv where id = p_id;
  end if;
  return nom.vista_interna(p_id);
end $$;
revoke all on function nom.calcular(uuid), nom.calcular_base(uuid) from public, anon, authenticated;

-- El payload del cliente se arma en una sentencia aparte del cálculo (una función STABLE en la misma sentencia
-- vería la foto previa al cálculo y devolvería el informe sin cifras).
create or replace function core.api_nom_tasacion_calcular(p_id uuid, p_autor text) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('core.autor', coalesce(p_autor, 'api'), true);
  perform nom.calcular(p_id);
  return nom.vista_interna(p_id) || jsonb_build_object('informe', nom.payload_cliente(p_id));
end $$;
revoke all on function core.api_nom_tasacion_calcular(uuid, text) from public, anon, authenticated;
