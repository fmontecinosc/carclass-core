-- core_v86 · Enlace al Director en Claude (27-nov-2026, Felipe).
-- La conversación con el Director vive en el proyecto de Claude; Core es la base de datos de los agentes.
insert into core.parametros (clave, valor, notas) values ('directorio.claude', jsonb_build_object('url', 'https://claude.ai/project/01a18ad0-521d-7720-9e60-4295275d7809', 'nombre', 'Directorio Carclass Group'), 'Proyecto de Claude donde Felipe conversa con el Director General (27-nov-2026). Core es la base de datos de los agentes; la conversación vive en Claude.')
on conflict (clave) do update set valor = excluded.valor, notas = excluded.notas;
