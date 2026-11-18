-- Pruebas del tasador NOM (v31). Datos FICTICIOS (marcados DEMO). Corre todo en una transacción y la revierte
-- lanzando una excepción final «PRUEBAS OK …»: nada queda en la base. Cualquier otra excepción = prueba fallida.
do $$
declare
  c uuid; h uuid; p uuid; r jsonb; pay jsonb; txt text; n int; ok text[] := '{}'; e text; tok text;
  av jsonb := '[
    {"url":"https://demo.nom.test/aviso/1","titulo":"DEMO Nivus Comfortline AT 2022","version_txt":"1.0 TSI Comfortline 4x2 AT","version_match":"misma","anio":2022,"km":75000,"precio":11690000,"transmision":"Automática","traccion":"4x2","combustible":"Bencina","region":"Metropolitana de Santiago","comuna":"Las Condes","vendedor_tipo":"automotora","vendedor_nombre":"DEMO Autos","verificacion":"verificado_activo"},
    {"url":"https://demo.nom.test/aviso/2","titulo":"DEMO Nivus Comfortline AT 2022","version_txt":"Comfortline AT","version_match":"misma","anio":2022,"km":95000,"precio":11290000,"transmision":"AT","traccion":"4x2","combustible":"Bencina","region":"Metropolitana de Santiago","comuna":"Vitacura","verificacion":"verificado_activo"},
    {"url":"https://demo.nom.test/aviso/3","titulo":"DEMO Nivus Comfortline AT 2023","version_txt":"Comfortline AT","version_match":"misma","anio":2023,"km":60000,"precio":12490000,"transmision":"Automática","combustible":"Bencina","region":"Metropolitana de Santiago","comuna":"Ñuñoa","verificacion":"verificado_activo"},
    {"url":"https://demo.nom.test/aviso/4","titulo":"DEMO Nivus Comfortline AT 2021","version_txt":"Comfortline AT","version_match":"misma","anio":2021,"km":70000,"precio":10990000,"transmision":"Automática","combustible":"Bencina","region":"Metropolitana de Santiago","comuna":"Providencia","verificacion":"verificado_activo","condicion":"financiamiento"},
    {"url":"https://demo.nom.test/aviso/5","titulo":"DEMO Nivus Highline AT 2022","version_txt":"Highline AT","version_match":"distinta","anio":2022,"km":80000,"precio":13200000,"transmision":"Automática","region":"Metropolitana de Santiago","verificacion":"verificado_activo"},
    {"url":"https://demo.nom.test/aviso/6","titulo":"DEMO Nivus Comfortline 2022 recuperado","version_txt":"Comfortline AT","version_match":"misma","anio":2022,"km":50000,"precio":7500000,"transmision":"Automática","region":"Metropolitana de Santiago","verificacion":"verificado_activo","condicion":"siniestro"},
    {"url":"https://demo.nom.test/aviso/7","titulo":"DEMO Nivus Comfortline 2022 caído","version_txt":"Comfortline AT","version_match":"misma","anio":2022,"km":82000,"precio":11500000,"transmision":"Automática","region":"Metropolitana de Santiago","verificacion":"caido"},
    {"url":"https://demo.nom.test/aviso/8","titulo":"DEMO Nivus Comfortline 2022 sin verificar","version_txt":"Comfortline AT","version_match":"misma","anio":2022,"km":85000,"precio":11400000,"transmision":"Automática","region":"Metropolitana de Santiago","verificacion":"no_verificado"},
    {"url":"https://demo.nom.test/aviso/9","titulo":"DEMO Nivus Comfortline MT 2022","version_txt":"Comfortline MT","version_match":"misma","anio":2022,"km":80000,"precio":10500000,"transmision":"Manual","region":"Metropolitana de Santiago","verificacion":"verificado_activo"},
    {"url":"https://demo.nom.test/aviso/10","titulo":"DEMO Nivus TSI AUT 2022","version_txt":"TSI 1.0 AUT","version_match":"indeterminada","anio":2022,"km":55000,"precio":12990000,"transmision":"Automática","region":"Metropolitana de Santiago","verificacion":"verificado_activo"}
  ]';
begin
  -- T1 · Comfortline: solo cuentan comparables limpios de su versión
  c := nom.crear(jsonb_build_object('marca','Volkswagen','modelo','Nivus','version','Comfortline 1.0 TSI AT 4x2','version_confirmada',true,
       'anio',2022,'transmision','Automática','traccion','4x2','combustible','Bencina','km',82000,'color','DEMO','patente','DEMO11',
       'resumen_comercial','DEMO resumen','interna', jsonb_build_object('precio_toma', 9876543, 'precio_pretendido_cliente', 13579246,
       'comision_monto', 4455667, 'notas_negociacion', 'SECRETO-NEGOCIACION-DEMO')));
  perform nom.registrar_busqueda(c, jsonb_build_object('portal','demo','consulta','DEMO','avisos', av));
  r := nom.calcular(c);
  select count(*) into n from nom.mercado_avisos where tasacion_id = c and valido;
  if n <> 4 then raise exception 'T1: se esperaban 4 válidos, hay %', n; end if;
  if exists (select 1 from nom.mercado_avisos where tasacion_id = c and valido and version_match <> 'misma') then raise exception 'T1: entró una versión distinta'; end if;
  ok := ok || 'T1 versión exacta: 4 válidos de 10 (Highline, indeterminada y manual fuera)'::text;

  -- T2 · siniestro, caído y no verificado etiquetados y fuera del cálculo
  select string_agg(motivo_exclusion, ' | ') into txt from nom.mercado_avisos where tasacion_id = c and url in
    ('https://demo.nom.test/aviso/6','https://demo.nom.test/aviso/7','https://demo.nom.test/aviso/8');
  if txt !~ 'siniestro' or txt !~ 'caído' or txt !~ 'No verificado' then raise exception 'T2: etiquetas incorrectas: %', txt; end if;
  if (select valor_comercial from nom.tasaciones where id = c) < 10500000 then raise exception 'T2: el siniestro distorsionó el valor'; end if;
  if (select peso from nom.mercado_avisos where tasacion_id = c and url = 'https://demo.nom.test/aviso/4') >=
     (select peso from nom.mercado_avisos where tasacion_id = c and url = 'https://demo.nom.test/aviso/2') then raise exception 'T2: financiamiento no rebajó su peso'; end if;
  ok := ok || 'T2 siniestro/caído/no verificado excluidos; financiamiento pondera menos'::text;

  -- T3 · Highline con los mismos avisos: no mezcla Comfortline
  h := nom.crear(jsonb_build_object('marca','Volkswagen','modelo','Nivus','version','Highline 1.0 TSI AT','version_confirmada',true,'anio',2022,
       'transmision','Automática','km',82000,'resumen_comercial','DEMO'));
  perform nom.registrar_busqueda(h, jsonb_build_object('portal','demo','avisos',
    (select jsonb_agg(case when x->>'version_match' = 'misma' then x || '{"version_match":"distinta"}' when x->>'version_match' = 'distinta' then x || '{"version_match":"misma"}' else x end) from jsonb_array_elements(av) x)));
  perform nom.calcular(h);
  select count(*) into n from nom.mercado_avisos where tasacion_id = h and valido;
  if n <> 1 then raise exception 'T3: Highline debía tener 1 válido, tiene %', n; end if;
  if (select tipo from nom.tasaciones where id = h) <> 'pre_estimacion' then raise exception 'T3: con 1 comparable debía ser pre-estimación'; end if;
  ok := ok || 'T3 Highline separado: 1 válido → pre-estimación'::text;

  -- T4 · < 3 comparables: bloqueo sin excepción; con excepción y comentario se aprueba
  begin perform nom.aprobar(h, 'aprobada', null, false); raise exception 'T4: aprobó sin excepción';
  exception when others then e := sqlerrm; if e like 'T4:%' then raise; end if; end;
  begin perform nom.aprobar(h, 'aprobada', 'corto', true); raise exception 'T4b: excepción sin comentario suficiente';
  exception when others then e := sqlerrm; if e like 'T4b:%' then raise; end if; end;
  perform nom.aprobar(h, 'aprobada', 'DEMO: excepción aprobada por nicho y versión escasa', true);
  ok := ok || 'T4 menos de 3 comparables exige excepción con comentario'::text;

  -- T5 · el payload del cliente no trae ningún dato interno, ni cifras reservadas
  pay := nom.payload_cliente(c); txt := pay::text;
  if txt ~* '(precio_compra|precio_toma|margen|utilidad|comision|interna|notas_negociacion|pretendido|estadisticas|parametros|peso|ajuste|evidencia|patente_interna)' then
    raise exception 'T5: clave interna en payload cliente'; end if;
  if txt ~ '(9876543|13579246|4455667|SECRETO-NEGOCIACION)' then raise exception 'T5: valor interno en payload cliente'; end if;
  if (nom.vista_interna(c, false))->'interna' <> 'null'::jsonb then raise exception 'T5: vista sin permiso trae interna'; end if;
  ok := ok || 'T5 payload cliente sin claves ni valores internos'::text;

  -- T6 · enlaces del informe = URL guardada de un comparable válido y seleccionado
  if exists (select 1 from jsonb_array_elements(pay->'comparables') x
              where not exists (select 1 from nom.mercado_avisos m where m.tasacion_id = c and m.url = x->>'url' and m.valido and m.seleccionado_informe)) then
    raise exception 'T6: enlace del informe sin respaldo'; end if;
  if jsonb_array_length(pay->'comparables') <> 4 then raise exception 'T6: se esperaban 4 comparables en el informe'; end if;
  ok := ok || 'T6 enlaces del informe = avisos usados para tasar'::text;

  -- T7 · no se envía sin aprobación; aprobación deja constancia; link público solo tras aprobar
  begin perform nom.registrar_envio(c, 'whatsapp_manual', 'DEMO'); raise exception 'T7: envió sin aprobar';
  exception when others then e := sqlerrm; if e like 'T7:%' then raise; end if; end;
  if public.tasacion_publica(coalesce((select token from nom.tasaciones where id = c), 'x')) is not null then raise exception 'T7: link público antes de aprobar'; end if;
  perform nom.aprobar(c, 'aprobada', 'DEMO ok', false);
  select token into tok from nom.tasaciones where id = c;
  if public.tasacion_publica(tok) is null then raise exception 'T7: link público no responde tras aprobar'; end if;
  r := nom.registrar_envio(c, 'whatsapp_manual', '+56900000000 DEMO');
  if not exists (select 1 from nom.tasacion_envios e join nom.tasacion_aprobaciones a on a.id = e.aprobacion_id where e.tasacion_id = c and a.decision = 'aprobada') then
    raise exception 'T7: envío sin aprobación ligada'; end if;
  ok := ok || 'T7 sin aprobación no hay envío ni link; el envío queda ligado a aprobador y versión'::text;

  -- T8 · aprobada/enviada = congelada; nueva versión copia y reemplaza
  begin update nom.tasaciones set precio_publicacion = 1 where id = c; raise exception 'T8: modificó una enviada';
  exception when others then e := sqlerrm; if e like 'T8:%' then raise; end if; end;
  begin perform nom.registrar_busqueda(c, '{"portal":"demo","avisos":[]}'); raise exception 'T8b: agregó búsqueda a una enviada';
  exception when others then e := sqlerrm; if e like 'T8b:%' then raise; end if; end;
  p := nom.nueva_version(c, 'DEMO: cambia el kilometraje tras inspección');
  if (select estado from nom.tasaciones where id = c) <> 'reemplazada' then raise exception 'T8: la anterior no quedó reemplazada'; end if;
  if (select count(*) from nom.mercado_avisos where tasacion_id = p) <> 10 then raise exception 'T8: la versión nueva no copió los avisos'; end if;
  if (select precio_toma from nom.tasacion_interna where tasacion_id = p) <> 9876543 then raise exception 'T8: no copió la parte interna'; end if;
  perform nom.actualizar(p, '{"km": 120000}'); perform nom.calcular(p);
  if (select valor_comercial from nom.tasaciones where id = p) >= (select valor_comercial from nom.tasaciones where id = c) then raise exception 'T8: más km no bajó el valor'; end if;
  ok := ok || 'T8 congelamiento, nueva versión y recálculo con más km'::text;

  -- T9 · ajuste manual auditado
  perform nom.ajustar(p, 'precio_publicacion', 11490000, 'DEMO: posicionar bajo la mediana por kilometraje alto');
  if (select precio_publicacion from nom.tasaciones where id = p) <> 11490000 then raise exception 'T9: no aplicó el ajuste'; end if;
  if not exists (select 1 from nom.tasacion_ajustes where tasacion_id = p and campo = 'precio_publicacion' and a = '11490000') then raise exception 'T9: ajuste sin auditoría'; end if;
  begin perform nom.ajustar(p, 'precio_publicacion', 1, ''); raise exception 'T9b: ajuste sin motivo';
  exception when others then e := sqlerrm; if e like 'T9b:%' then raise; end if; end;
  ok := ok || 'T9 ajuste manual con motivo obligatorio y auditado'::text;

  -- T10 · aviso caído no puede ir al informe
  begin perform nom.editar_aviso((select id from nom.mercado_avisos where tasacion_id = p and url = 'https://demo.nom.test/aviso/7'), '{"seleccionado_informe": true}');
    raise exception 'T10: un aviso caído entró al informe';
  exception when others then e := sqlerrm; if e like 'T10:%' then raise; end if; end;
  ok := ok || 'T10 un aviso caído o no válido no puede ir al informe'::text;

  -- T11 · (v33) alerta de posicionamiento: aviso del mismo año y menos km publicado bajo nuestra sugerencia
  if not exists (select 1 from nom.tasaciones t, jsonb_array_elements_text(t.advertencias) a where t.id = p and a like 'Hay un aviso%') then
    raise exception 'T11: falta la alerta de posicionamiento'; end if;
  ok := ok || 'T11 alerta de posicionamiento frente a avisos con menos km'::text;

  -- T12 · (v34) modo conservador: nunca sobre un comparable igual o más nuevo con menos km, y bajo la mediana
  if (select precio_publicacion from nom.tasaciones where id = c) >= 11690000 then raise exception 'T12: publicó sobre un comparable mejor'; end if;
  if (select valor_comercial from nom.tasaciones where id = c) > (select (estadisticas->>'valor_mediana_ponderada')::bigint from nom.tasaciones where id = c) then
    raise exception 'T12: el valor conservador quedó sobre la mediana'; end if;
  ok := ok || 'T12 modo conservador bajo el mejor comparable y bajo la mediana'::text;

  raise exception 'PRUEBAS OK (%) → %', array_length(ok, 1), array_to_string(ok, ' ║ ');
end $$;
