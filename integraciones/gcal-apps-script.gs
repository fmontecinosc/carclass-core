/**
 * Carclass Core · puente con Google Calendar (fmontecinos@carclass.cl)
 *
 * Lo usan las funciones nom-automata y wa-agente de Supabase para:
 *   - ver qué horarios están ocupados antes de ofrecer una visita NOM,
 *   - crear el evento de la visita (con el cliente como invitado si dio su correo),
 *   - borrarlo si la visita se cancela.
 *
 * Cómo instalarlo (una vez, con la cuenta fmontecinos@carclass.cl):
 *   1. Abrir https://script.google.com → Nuevo proyecto → pegar este archivo completo.
 *   2. Reemplazar PEGAR_AQUI_EL_SECRETO por el secreto que te entrega Claude (no lo subas a GitHub).
 *   3. Implementar → Nueva implementación → Tipo «Aplicación web».
 *      Ejecutar como: «Yo». Quién tiene acceso: «Cualquier usuario».
 *   4. Autorizar el acceso al calendario y copiar la URL que termina en /exec.
 *   5. Esa URL se guarda en Supabase como secreto GCAL_SCRIPT_URL (y el secreto como GCAL_SCRIPT_SECRET).
 *
 * Sin el secreto correcto el script no responde nada útil: no expone el calendario.
 */
const SECRETO = 'PEGAR_AQUI_EL_SECRETO';
const CALENDARIO = 'fmontecinos@carclass.cl';
const FERIADOS = ['es.cl#holiday@group.v.calendar.google.com', 'es-419.cl#holiday@group.v.calendar.google.com'];

function doPost(e) {
  let p = {};
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return salida({ ok: false, error: 'json' }); }
  if (!p.secreto || p.secreto !== SECRETO) return salida({ ok: false, error: 'no autorizado' });
  try {
    const cal = CalendarApp.getCalendarById(CALENDARIO) || CalendarApp.getDefaultCalendar();
    if (p.accion === 'ocupado') {
      const desde = new Date(p.desde), hasta = new Date(p.hasta);
      const ocupados = [];
      cal.getEvents(desde, hasta).forEach(function (ev) {
        if (ev.isAllDayEvent()) return;                       // los de día completo (cumpleaños, recordatorios) no bloquean
        try { if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; } catch (x) {}
        try { if (String(ev.getTransparency()) === 'TRANSPARENT') return; } catch (x) {}
        ocupados.push({ inicio: ev.getStartTime().toISOString(), fin: ev.getEndTime().toISOString(), titulo: 'ocupado' });
      });
      FERIADOS.forEach(function (id) {
        const f = CalendarApp.getCalendarById(id);
        if (!f) return;
        f.getEvents(desde, hasta).forEach(function (ev) {
          ocupados.push({ inicio: ev.getStartTime().toISOString(), fin: ev.getEndTime().toISOString(), titulo: 'feriado' });
        });
      });
      return salida({ ok: true, ocupados: ocupados });
    }
    if (p.accion === 'crear') {
      const opciones = { description: p.descripcion || '', location: p.ubicacion || '' };
      if (p.invitado) { opciones.guests = p.invitado; opciones.sendInvites = true; }
      const ev = cal.createEvent(p.titulo, new Date(p.inicio), new Date(p.fin), opciones);
      try { ev.addPopupReminder(60); } catch (x) {}
      return salida({ ok: true, id: ev.getId() });
    }
    if (p.accion === 'cancelar') {
      const ev = cal.getEventById(p.id);
      if (ev) ev.deleteEvent();
      return salida({ ok: true });
    }
    return salida({ ok: false, error: 'acción desconocida' });
  } catch (err) {
    return salida({ ok: false, error: String(err && err.message || err).slice(0, 200) });
  }
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
