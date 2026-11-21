-- core_v67 · Prueba de inspección y sesión de fotos a domicilio para consignantes NOM (Felipe 21-nov-2026)
-- Zona preferente: Chicureo, Lo Barnechea y Chicauma (fee normal $50.000). Fuera de esa zona, a domicilio: fee $75.000.
-- Cupo de prueba: 2 visitas a domicilio por semana durante el primer mes. Se mide domicilio vs oficina.
alter table nom.visitas add column if not exists lugar text not null default 'oficina';
alter table nom.visitas add column if not exists direccion text;
alter table nom.visitas drop constraint if exists visitas_lugar_ok;
alter table nom.visitas add constraint visitas_lugar_ok check (lugar in ('oficina', 'domicilio'));

insert into core.parametros (clave, valor) values ('nom.visita_domicilio', jsonb_build_object(
  'activo', true,
  'estado', 'prueba acotada (Felipe 21-nov-2026); evaluar al mes',
  'prueba_hasta', '2026-12-21',
  'zonas', jsonb_build_array('Chicureo', 'Lo Barnechea', 'Chicauma'),
  'fee_zona_clp', 50000,
  'fee_fuera_zona_clp', 75000,
  'cupo_semanal', 2,
  'duracion_min', 120,
  'bloques', jsonb_build_array('10:00', '15:00'),
  'dias', 'lunes a viernes',
  'requisitos', jsonb_build_array('Luz de día', 'Espacio despejado alrededor del auto (unos 2 m)', 'Auto lavado y sin objetos personales', 'Documentos del auto a mano'),
  'si_no_cumple', 'se reagenda o se hace en nuestra oficina en Puertas de Chicureo',
  'como_decirlo', 'Podemos hacer la inspección y la sesión de fotos en tu casa o en nuestra oficina en Puertas de Chicureo, lo que te acomode.',
  'regla_agente', 'Ofrece la visita en la casa del cliente o en la oficina. En Chicureo, Lo Barnechea y Chicauma el fee es el mismo ($50.000); fuera de esas zonas, a domicilio el fee es $75.000 (en la oficina sigue en $50.000). Máximo 2 visitas a domicilio por semana: si no hay cupo, ofrece la oficina o la semana siguiente. Pide la dirección y confirma los requisitos (luz de día, espacio despejado, auto lavado).'))
on conflict (clave) do update set valor = excluded.valor, actualizado_en = now();

update ops.sops set contenido = replace(contenido,
  '- Visita de ingreso: oficina NOM, Av. Puerta Oriente 361, oficina 409B, Chicureo. Lunes a viernes de 9:00 a 18:00, previa coordinación; bloques de 2 h a las 10:00 o 15:00. El auto llega lavado, presentable y sin objetos personales, porque con él se hacen las fotos de la publicación.',
  '- Visita de ingreso (inspección y sesión de fotos): en nuestra oficina en Puertas de Chicureo (Av. Puerta Oriente 361, oficina 409B) o, en prueba hasta el 21-dic-2026, a domicilio. Lunes a viernes, previa coordinación; bloques de 2 h a las 10:00 o 15:00. A domicilio: Chicureo, Lo Barnechea y Chicauma con el fee normal; fuera de esas zonas, fee de $75.000; máximo 2 por semana; requisitos: luz de día, espacio despejado y auto lavado (si no se cumplen, se reagenda o se hace en la oficina). El auto llega lavado, presentable y sin objetos personales, porque con él se hacen las fotos de la publicación. Core registra el lugar de cada visita (`nom.visitas.lugar`) para comparar la conversión.'),
  actualizado_en = now()
where tipo = 'proceso' and titulo = 'Flujo NOM consignantes';
