-- core_v37 · NOM: preparación del auto para la visita y datos de la SpA (Felipe, 18-nov-2026)
-- Aplicada por SQL. Los datos bancarios y el RUT del representante NO van en este archivo
-- (el repositorio es público): viven solo en core.parametros['nom.transferencia'] y ['nom.empresa'].

update core.parametros
set valor = valor || jsonb_build_object('preparacion_cliente', jsonb_build_array(
  'Traer el auto lavado por fuera y limpio por dentro, en las mejores condiciones posibles: con él se hacen las fotos de la publicación',
  'Retirar objetos personales del interior y del maletero',
  'Traer las llaves (todas las que tenga), padrón o certificado de inscripción, permiso de circulación, revisión técnica y SOAP vigentes',
  'Traer el historial de mantenciones si lo tiene'))
where clave = 'nom.oficina';

-- Estructura (valores cargados fuera del repo):
-- nom.empresa       = {razon_social, nombre_fantasia, rut, representante_legal, representante_rut, domicilio, correo}
-- nom.transferencia = {titular, rut, banco, tipo_cuenta, numero_cuenta, correo_comprobante, usos[]}
insert into core.parametros (clave, valor) values
  ('nom.empresa', '{"razon_social":"Servicios e Inversiones Nor Oriente SpA","nombre_fantasia":"Nor-Oriente Motors","rut":"78417752-1"}'::jsonb),
  ('nom.transferencia', '{"titular":"Servicios e Inversiones Nor Oriente SpA","rut":"78417752-1","banco":"Santander","tipo_cuenta":"corriente"}'::jsonb)
on conflict (clave) do nothing;
