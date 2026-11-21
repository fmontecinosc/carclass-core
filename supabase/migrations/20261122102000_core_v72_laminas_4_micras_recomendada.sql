-- core_v72 · Láminas de seguridad (Felipe 22-nov-2026): se recomienda la de 4 micras para cerrar más ventas;
-- la de 8 micras queda como alternativa de mayor resistencia (reemplaza «8 micras recomendada» de core_v55).
update crm.catalogo set nombre = 'Láminas de seguridad XPEL 4 micras (recomendada)',
  descripcion = 'Laterales + luneta, $225.000 a $250.000 según modelo. Es la que se recomienda: cubre bien el uso diario. Tienen tonalidad: si piden «polarizado», es esta lámina con el tono legal.'
where codigo = 'laminas';

update crm.catalogo set nombre = 'Láminas de seguridad XPEL 8 micras',
  descripcion = 'Laterales + luneta, $300.000 a $325.000 según modelo; parabrisas como adicional. Alternativa de mayor resistencia si el cliente busca más protección.'
where codigo = 'laminas_8';
