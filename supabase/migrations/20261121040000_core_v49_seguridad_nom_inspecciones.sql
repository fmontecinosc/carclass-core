-- core_v49 · Contención de seguridad en public.nom_inspecciones (revisión de ingeniería 21-nov-2026, aprobada por Felipe).
-- Antes: anon podía leer, crear y editar todas las inspecciones (cliente, teléfono, VIN, fotos) y marcarlas pagadas,
-- y core.sync_inspecciones_ipc() las pasa a fin.ventas. La clave anónima está en el HTML público de nom-inspeccion.
-- Ahora (mientras la herramienta pasa a login de Core):
--  · anon solo ve y edita inspecciones creadas en las últimas 48 h (la que está en curso; el autoguardado usa upsert);
--  · anon no puede dejar una inspección como pagada/cobrada: el pago se marca desde Core (app_ipc_marcar_pago, solo dueño);
--  · el acceso autenticado queda limitado a usuarios activos de Core.
drop policy if exists anon_select_nom_inspecciones on public.nom_inspecciones;
drop policy if exists anon_insert_nom_inspecciones on public.nom_inspecciones;
drop policy if exists anon_update_nom_inspecciones on public.nom_inspecciones;
drop policy if exists auth_all_nom_inspecciones on public.nom_inspecciones;

create policy anon_select_recientes on public.nom_inspecciones for select to anon
  using (created_at > now() - interval '48 hours');
create policy anon_insert_sin_pago on public.nom_inspecciones for insert to anon
  with check (coalesce(estado_pago, '') !~* '(pagad|cobrad)');
create policy anon_update_recientes_sin_pago on public.nom_inspecciones for update to anon
  using (created_at > now() - interval '48 hours' and coalesce(estado_pago, '') !~* '(pagad|cobrad)')
  with check (created_at > now() - interval '48 hours' and coalesce(estado_pago, '') !~* '(pagad|cobrad)');
create policy usuarios_core_todo on public.nom_inspecciones for all to authenticated
  using (exists (select 1 from core.usuarios u where u.user_id = auth.uid() and u.activo))
  with check (exists (select 1 from core.usuarios u where u.user_id = auth.uid() and u.activo));
revoke delete, truncate on public.nom_inspecciones from anon;

-- Marcar el pago de una inspección desde Core (solo dueño). El cron horario la pasa a fin.ventas si queda pagada.
create or replace function public.app_ipc_marcar_pago(p_id text, p_estado text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not core.es_dueno() then raise exception 'Solo el dueño marca pagos de inspecciones'; end if;
  if p_estado not in ('Pendiente', 'Pagado', 'Exento (cliente NOM)') then raise exception 'Estado de pago inválido'; end if;
  update public.nom_inspecciones set estado_pago = p_estado, actualizado_por = core.autor(), updated_at = now() where id = p_id;
  if not found then raise exception 'Inspección no encontrada'; end if;
  return jsonb_build_object('ok', true, 'id', p_id, 'estado_pago', p_estado);
end $$;
revoke all on function public.app_ipc_marcar_pago(text, text) from public, anon;
grant execute on function public.app_ipc_marcar_pago(text, text) to authenticated;
