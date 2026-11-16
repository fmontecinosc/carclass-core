-- v22: la app y el importador enviaban tipo = 'operacional', que fin.costos no acepta
-- (costos_tipo_check: directo, fijo, variable). Se normaliza en la base para que ningún
-- cliente (app en caché, importador, agentes) vuelva a fallar: 'operacional' o vacío → 'fijo'.
create or replace function fin.normalizar_tipo_costo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.tipo is null or new.tipo in ('operacional', 'gasto', 'operacion') then new.tipo := 'fijo'; end if;
  return new;
end $$;

drop trigger if exists normalizar_tipo on fin.costos;
create trigger normalizar_tipo before insert or update of tipo on fin.costos
  for each row execute function fin.normalizar_tipo_costo();
