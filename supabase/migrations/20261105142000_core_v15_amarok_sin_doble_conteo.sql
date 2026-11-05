-- El VW Amarok fue compraventa propia (venta $17 MM, ago-2026, origen planilla_ig). La «comisión» de $1.000.000 del 20-sep duplicaba la misma operación.
delete from fin.ventas where unidad='nom' and modalidad='consignacion' and fecha='2026-09-20' and monto=1000000 and descripcion='Volkswagen Amarok';
