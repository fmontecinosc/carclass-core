-- core_v52 · Tasador NOM: investigación por etapas, informe en PDF, botón «Investigar» y cron de nom-automata.
-- 1) nom.investigaciones guarda la conversación con Claude entre etapas (cada minuto avanza una llamada acotada).
alter table nom.investigaciones add column if not exists conversacion jsonb, add column if not exists vueltas int not null default 0;

-- 2) Parámetros de la investigación por etapas
update core.parametros set valor = valor || jsonb_build_object('investigacion_por_etapa', 4, 'investigacion_max_vueltas', 8)
 where clave = 'nom.automatizacion';

-- 3) Al aprobar, el mensaje anuncia el informe en PDF (Felipe 21-nov-2026: al cliente documentos, no links).
--    nom-automata adjunta el PDF después del primer mensaje y lo envía aunque el asesor NOM esté en observar.
create or replace function nom.al_aprobar() returns trigger language plpgsql security definer set search_path = '' as $$
declare c wa.conversaciones; v_nombre text;
begin
  if new.estado = 'aprobada' and old.estado is distinct from 'aprobada' and new.conversacion_id is not null then
    select * into c from wa.conversaciones where id = new.conversacion_id;
    v_nombre := nullif(split_part(coalesce(c.ficha->>'nombre', c.nombre, ''), ' ', 1), '');
    insert into nom.salientes (conversacion_id, tipo, referencia, mensajes)
    values (new.conversacion_id, 'tasacion_aprobada', new.id, jsonb_build_array(
      'Listo' || coalesce(', ' || v_nombre, '') || '. Te envío el informe de tasación de tu ' || concat_ws(' ', new.marca, new.modelo, new.anio) || ' en PDF.',
      'Con el mercado de hoy, el precio sugerido de publicación es *' || nom.miles(new.precio_publicacion) || '*. '
        || 'El siguiente paso es una visita de 2 horas en nuestra oficina de Chicureo para inspeccionar el auto y tomar las fotos de la publicación. ¿Te propongo horarios?'))
    on conflict (tipo, referencia) do nothing;
  end if;
  return new;
end $$;

-- 4) Lanzar la investigación de mercado desde Core (botón «Investigar con IA» en la tasación)
create or replace function public.app_nom_investigar(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t nom.tasaciones; v uuid;
begin
  if not nom.puede_aprobar() then raise exception 'Solo el responsable NOM puede lanzar investigaciones'; end if;
  select * into t from nom.tasaciones where id = p_id;
  if t.id is null then raise exception 'Tasación no encontrada'; end if;
  if t.estado not in ('borrador', 'calculada') then raise exception 'La tasación % está %; crea una nueva versión', t.folio, t.estado; end if;
  select id into v from nom.investigaciones where tasacion_id = p_id and estado in ('pendiente', 'en_curso');
  if v is null then insert into nom.investigaciones (tasacion_id) values (p_id) returning id into v; end if;
  return jsonb_build_object('ok', true, 'investigacion_id', v);
end $$;
revoke all on function public.app_nom_investigar(uuid) from public, anon;
grant execute on function public.app_nom_investigar(uuid) to authenticated;

-- 5) nom-automata cada minuto (investigación, informes aprobados, visitas, recordatorios). No existía el cron.
select cron.schedule('nom-automata', '* * * * *', $cron$
  select net.http_post(
    url := 'https://tvjpwwwnpchecolcsnxp.supabase.co/functions/v1/nom-automata',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-agente-secret', (select valor from wa.config where clave = 'agente_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000)
$cron$);

-- 6) Borrar la tasación de prueba del Mazda CX-5 (aprobado por Felipe el 20-nov), con su investigación y tarea
delete from ops.tareas where titulo ilike '%NOM-TAS-2026-11-20-0002%';
delete from nom.investigaciones where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.mercado_avisos where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.mercado_busquedas where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.tasacion_ajustes where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.tasacion_aprobaciones where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.tasacion_envios where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.tasacion_interna where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.visitas where tasacion_id = '7bf10fb0-a126-4819-a221-76348ac6d527';
delete from nom.tasaciones where id = '7bf10fb0-a126-4819-a221-76348ac6d527';
