-- core_v57 · descripción del retiro alineada con core_v53 (cualquier servicio desde $600.000; bajo eso aprox. $30.000)
update crm.catalogo set descripcion = 'Regla interna en core.parametros[''carclass.retiro'']: retiro y entrega a domicilio en Chicureo, Lo Barnechea y alrededores; sin costo extra en cualquier servicio con total desde $600.000, bajo eso aprox. $30.000. Otras zonas: se evalúa según distancia y se traspasa «retiro a confirmar». Nunca mencionar el monto mínimo.'
 where unidad = 'carclass' and codigo = 'retiro';
