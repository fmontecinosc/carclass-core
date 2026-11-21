-- core_v71 · Portal Motores (Felipe 22-nov-2026): Camila, de la corredora Portal Motores, preguntó por el Suzuki Swift 2019
-- publicado en la web NOM para un lead suyo. Se le respondió que está vendido. No es comprador directo: se cierra la oportunidad.
update crm.empresas set nombre = 'Camila (Portal Motores)', notas = coalesce(notas || E'\n', '') || 'Ejecutiva de la corredora Portal Motores; consulta stock NOM para sus leads.', actualizado_en = now()
where id = '82325ca1-94e3-48f9-a58b-eceed1001ec4';

update crm.oportunidades set estado = 'perdida', motivo_codigo = 'otro',
  motivo_perdida = 'Corredora Portal Motores consultó por el Suzuki Swift 2019 de la web: no está en stock (se informó vendido).',
  cerrado_en = now(), actualizado_en = now()
where id = '38a17436-d9db-49e0-9278-60f7d3628b91' and estado = 'abierta';
