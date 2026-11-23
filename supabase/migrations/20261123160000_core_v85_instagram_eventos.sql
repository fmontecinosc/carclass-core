-- core_v85 · Instagram fase 1: receptor de eventos (función ig-webhook). Token de verificación del webhook en
-- wa.config['ig_verify_token'] (se genera al aplicar). Los eventos quedan en wa.ig_eventos hasta la fase 2.
create table if not exists wa.ig_eventos (
  id bigserial primary key,
  recibido_en timestamptz not null default now(),
  firma_ok boolean,
  payload jsonb not null,
  procesado boolean not null default false
);
alter table wa.ig_eventos enable row level security;
revoke all on wa.ig_eventos from anon, authenticated;
insert into wa.config (clave, valor) values ('ig_verify_token', 'cc-ig-' || encode(gen_random_bytes(12), 'hex'))
on conflict (clave) do nothing;
