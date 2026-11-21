-- core_v73 · Lavado a domicilio recomendado (Felipe 22-nov-2026): Carclass no hace lavados; si el cliente necesita
-- lavado a domicilio se le recomienda un colega de confianza: American Car Wash (van que lava en casa, oficina o calle, en todo Santiago).
insert into core.parametros (clave, valor) values ('carclass.lavado_recomendado', jsonb_build_object(
  'nombre', 'American Car Wash',
  'web', 'https://americancarwashchile.com/',
  'descripcion', 'Lavado a domicilio en todo Santiago: una van con agua y energía propias lava el auto en tu casa, oficina o en la calle.',
  'como_decirlo', 'Nosotros no hacemos lavados, pero te recomiendo a American Car Wash, un colega de confianza que lava a domicilio en todo Santiago: americancarwashchile.com',
  'telefono', null))
on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();
