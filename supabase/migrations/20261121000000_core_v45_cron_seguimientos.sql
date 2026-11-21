-- core_v45 · El cron wa-agente también despierta al asesor cuando vence un seguimiento (wa.seguimientos).
-- Antes solo corría con mensajes en cola, así que los seguimientos programados nunca se enviaban.
select cron.schedule('wa-agente', '10 seconds', $cron$
  select net.http_post(
    url := 'https://tvjpwwwnpchecolcsnxp.supabase.co/functions/v1/wa-agente',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-agente-secret', (select valor from wa.config where clave = 'agente_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 2000)
  where exists (select 1 from wa.cola_agente
                where procesar_desde <= now() and coalesce(bloqueado_hasta, '-infinity'::timestamptz) < now())
     or exists (select 1 from wa.seguimientos where estado = 'pendiente' and cuando <= now())
$cron$);
