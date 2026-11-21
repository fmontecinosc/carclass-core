-- core_v46 · Bucket público «documentos» para los PDF que el asesor envía por WhatsApp (cotización PPF por modelo).
-- Público para que Meta/Kapso pueda descargar el archivo por link; cada archivo vive en una ruta con token aleatorio.
-- Solo escribe la service role (Edge Function wa-agente): no hay políticas de insert para anon ni authenticated.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', true, 5242880, array['application/pdf'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['application/pdf'];
