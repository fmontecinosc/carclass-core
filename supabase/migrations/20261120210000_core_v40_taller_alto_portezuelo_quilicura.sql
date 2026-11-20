-- core_v40 · Felipe 20-nov-2026: el taller se nombra «complejo industrial Alto Portezuelo, en Quilicura».
update core.parametros set valor = jsonb_set(valor, '{lugares}', (
  select jsonb_agg(case when l->>'codigo' = 'taller' then l || '{
    "direccion": "El Juncal 240, bodega 16, complejo industrial Alto Portezuelo, Quilicura",
    "como_decirlo": "en nuestro taller del complejo industrial Alto Portezuelo, en Quilicura, con seguridad y monitoreo 24/7",
    "nota": "Lo mejor: el cliente lleva el auto directo al taller. La calle y bodega exactas al confirmar la reserva."}'::jsonb else l end)
  from jsonb_array_elements(valor->'lugares') l))
 where clave = 'carclass.recepcion';
update core.parametros set valor = valor
  || '{"regla_cliente": "Con clientes de Carclass nunca menciones NOM ni Nor-Oriente Motors (di «nuestra oficina»). El taller es «complejo industrial Alto Portezuelo, en Quilicura»."}'::jsonb
 where clave = 'carclass.recepcion';
update core.parametros set valor = valor || '{"como_decirlo": "complejo industrial Alto Portezuelo, en Quilicura"}'::jsonb
 where clave = 'carclass.taller';
