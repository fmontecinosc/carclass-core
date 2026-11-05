update fin.costos c set fecha = v.fecha from fin.ventas v
 where c.venta_id = v.id and v.modalidad = 'compraventa' and c.origen = 'planilla_ig' and c.fecha < v.fecha;
