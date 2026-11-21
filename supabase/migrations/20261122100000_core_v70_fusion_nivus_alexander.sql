-- core_v70 · El consignante del VW Nivus 2022 es Alexander Catalan (Felipe 22-nov-2026).
-- Se fusiona la ficha provisoria «Consignante VW Nivus 2022 (por identificar)» en la de Alexander:
-- su oportunidad NOM consignante (calificando, desde WhatsApp) toma el título y el vehículo;
-- la oportunidad provisoria (etapa nuevo, sin actividades ni tareas) se elimina y la ficha queda respaldada en archivo.empresas_eliminadas.
begin;

insert into archivo.empresas_eliminadas (empresa_id, nombre, motivo, fusionada_en, empresa, oportunidades, contactos)
select e.id, e.nombre, 'Fusión: el consignante del Nivus es Alexander Catalan (Felipe 22-nov)',
       'b26fc40d-8ad6-4890-af37-851cf32c217b'::uuid, to_jsonb(e),
       coalesce((select jsonb_agg(to_jsonb(o)) from crm.oportunidades o where o.empresa_id = e.id), '[]'::jsonb),
       '[]'::jsonb
from crm.empresas e where e.id = '6fa6ee18-a6d7-4a27-8129-1e4fdc5c6a7c';

update ops.vehiculos set consignante_id = 'b26fc40d-8ad6-4890-af37-851cf32c217b', actualizado_en = now()
where id = '14864a18-4aff-409c-9516-9194af830b6c';

update crm.oportunidades
set titulo = 'Consignación VW Nivus 2022',
    vehiculo_id = '14864a18-4aff-409c-9516-9194af830b6c',
    actualizado_en = now()
where id = 'cedfd245-b171-43ed-b1dd-b98043e3c240';

delete from crm.oportunidades where id = 'd7c90997-5292-47c5-bb92-6b8881bba62c';
delete from crm.empresas where id = '6fa6ee18-a6d7-4a27-8129-1e4fdc5c6a7c';

commit;
