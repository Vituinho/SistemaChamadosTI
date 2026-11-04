-- Data in the format written by the legacy FastAPI backend (no schema_migrations,
-- no ticket_history.kind). Used to rehearse the Render → Railway transfer.
-- Password of "legado": legacy-password-for-tests (pwdlib/argon2-cffi hash).
INSERT INTO technicians (id, username, name, password_hash) VALUES
  (1, 'legado', 'Técnico Legado', '$argon2id$v=19$m=65536,t=3,p=4$1f5Ezxc6KDw42G5t6oGjPg$ckdV8OiiilOizY4NdNa/5OFYg1fsDFmTPZhjfwDRCrg'),
  (2, 'ana', 'Ana Souza', '$argon2id$v=19$m=65536,t=3,p=4$1f5Ezxc6KDw42G5t6oGjPg$ckdV8OiiilOizY4NdNa/5OFYg1fsDFmTPZhjfwDRCrg');
SELECT setval('technicians_id_seq', 2);

INSERT INTO tickets (id, access_hash, name, department, category, title, description, status, priority, technician_id, created_at, assigned_at, resolved_at, solution, location, affected_system, state) VALUES
  (1, repeat('a', 64), 'Maria', 'Financeiro', 'Sistema', 'DBFrete não abre', 'Erro ao entrar', 'RESOLVIDO', 'ALTA', 1, '2026-09-08T12:00:00Z', '2026-09-08T12:10:00Z', '2026-09-08T13:00:00Z', 'Senha redefinida', 'Sala 2', 'DBFrete', 'PR'),
  (2, repeat('b', 64), 'João', 'Logística', 'Internet', 'Sem internet', '', 'EM_ATENDIMENTO', 'NORMAL', 2, '2026-10-01T09:00:00Z', '2026-10-01T09:05:00Z', NULL, NULL, 'Pátio', '', 'SP'),
  (3, repeat('c', 64), 'Lúcia', 'Juridico', 'Impressora', 'Impressora parada', 'Papel preso', 'NOVO', 'NORMAL', NULL, '2026-10-20T15:30:00Z', NULL, NULL, NULL, '', '', 'PR'),
  (5, repeat('d', 64), 'Paulo', 'Monitoramento', 'Outro', 'Duplicado', '', 'CANCELADO', 'BAIXA', NULL, '2026-10-21T08:00:00Z', NULL, NULL, NULL, 'Recepção', '', 'SC');
SELECT setval('tickets_id_seq', 7);

INSERT INTO ticket_history (ticket_id, message, created_at) VALUES
  (1, 'Chamado criado — aguardando TI — sistema: DBFrete', '2026-09-08T12:00:00Z'),
  (1, 'Técnico Legado assumiu o chamado — status EM_ATENDIMENTO', '2026-09-08T12:10:00Z'),
  (1, 'Técnico Legado resolveu o chamado — Senha redefinida', '2026-09-08T13:00:00Z'),
  (2, 'Chamado criado — aguardando TI', '2026-10-01T09:00:00Z'),
  (2, 'Ana Souza assumiu o chamado — status EM_ATENDIMENTO', '2026-10-01T09:05:00Z'),
  (3, 'Chamado criado — aguardando TI', '2026-10-20T15:30:00Z'),
  (5, 'Chamado criado — aguardando TI', '2026-10-21T08:00:00Z'),
  (5, 'Ana Souza: status NOVO → CANCELADO', '2026-10-21T08:30:00Z');

INSERT INTO attachments (ticket_id, mime, data) VALUES (1, 'image/webp', decode('52494646240000005745425056503820180000003001009d012a0100010002003425a400037000feec9400', 'hex'));
INSERT INTO sessions (token_hash, technician_id, expires_at) VALUES (repeat('e', 64), 1, now() + interval '1 hour');
INSERT INTO push_subscriptions (technician_id, endpoint, p256dh, auth, created_at) VALUES (2, 'https://fcm.googleapis.com/fcm/send/legacy-device', repeat('B', 87), repeat('a', 22), '2026-10-02T10:00:00Z');
