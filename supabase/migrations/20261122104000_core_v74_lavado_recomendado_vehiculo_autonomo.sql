-- core_v74 · American Car Wash lava con un vehículo autónomo, con agua y energía propias (Felipe 22-nov-2026).
update core.parametros set valor = valor || jsonb_build_object(
  'descripcion','Lavado a domicilio en todo Santiago con un vehículo autónomo, con agua y energía propias: lava el auto en tu casa, oficina o en la calle.',
  'como_decirlo','Nosotros no hacemos lavados, pero te recomiendo a American Car Wash, un colega de confianza que lava a domicilio en todo Santiago con un vehículo autónomo, con agua y energía propias: americancarwashchile.com'),
  actualizado_en = now()
where clave='carclass.lavado_recomendado';
