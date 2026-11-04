/* Contract smoke test: real NestJS HTTP and the original Alembic PostgreSQL schema. */
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const argon2 = require('argon2');
const sharp = require('sharp');

const url = 'http://127.0.0.1:8000';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let cookie = '';
async function request(path, method = 'GET', body, headers = {}) {
  const write = method !== 'GET';
  const h = { ...headers, ...(cookie ? { Cookie: cookie } : {}),
    ...(write ? { Origin: 'http://localhost:3000' } : {}) };
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  return fetch(url + path, { method, headers: h, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
}
async function json(response, expected = 200) {
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
(async function smoke() {
  const hash = await argon2.hash('local-test-password-12345', { type: argon2.argon2id });
  await pool.query('INSERT INTO technicians(username,name,password_hash) VALUES ($1,$2,$3)', ['e2e-tech', 'Técnico E2E', hash]);
  assert.equal((await json(await request('/health'))).status, 'ok');
  assert.ok((await json(await request('/catalog'))).departments.includes('Financeiro'));
  await json(await request('/auth/me'), 401);
  await json(await request('/auth/login', 'POST', {username:'e2e-tech',password:'wrong'}), 401);
  const login = await request('/auth/login', 'POST', {username:'E2E-TECH',password:'local-test-password-12345'});
  assert.equal((await json(login)).name, 'Técnico E2E');
  cookie = login.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('givova_session='));
  assert.equal((await json(await request('/auth/me'))).name, 'Técnico E2E');
  assert.equal((await json(await request('/push/config'))).enabled, false);

  const form = new FormData();
  for (const [key,value] of Object.entries({
    name:'Colaborador E2E',department:'Financeiro',state:'PR',location:'Escritório',
    category:'Sistema',affected_system:'DBFrete',title:'Não consigo abrir DBFrete',description:'Erro no login'
  })) form.append(key,value);
  const png = await sharp(Buffer.from([255, 120, 0]), {raw:{width:1,height:1,channels:3}}).png().toBuffer();
  form.append('attachment', new Blob([png], {type:'image/png'}), 'screenshot.png');
  const created = await json(await request('/tickets', 'POST', form), 201);
  assert.ok(/^GV-[0-9]{6,}$/.test(created.protocol));
  assert.equal(created.status, 'NOVO');
  assert.equal(created.has_attachment, true);
  assert.ok(created.access_key.length >= 32);
  assert.equal(created.history.length, 1);
  await json(await request('/tracking/' + created.protocol, 'GET', undefined, {'X-Ticket-Key':'invalid'}), 404);
  const tracking = await json(await request('/tracking/' + created.protocol, 'GET', undefined, {'X-Ticket-Key':created.access_key}));
  assert.equal(tracking.title, created.title);
  const preview = await request('/tracking/' + created.protocol + '/attachment', 'GET', undefined, {'X-Ticket-Key':created.access_key});
  assert.equal(preview.status, 200);
  assert.ok(preview.headers.get('content-type').startsWith('image/webp'));
  assert.ok((await preview.arrayBuffer()).byteLength > 0);
  const listing = await json(await request('/tickets?q=DBFrete&state=PR'));
  assert.ok(listing.items.some(t => t.id === created.id));
  assert.ok(listing.total >= 1);
  const dash = await json(await request('/dashboard'));
  assert.ok(dash.new >= 1);
  assert.ok(dash.latest_id >= created.id);
  await json(await request('/tickets/' + created.id + '/resolve', 'POST', {solution:'Fiz teste'}), 409);
  const assigned = await json(await request('/tickets/' + created.id + '/assign', 'POST'));
  assert.equal(assigned.status, 'EM_ATENDIMENTO');
  assert.equal(assigned.technician, 'Técnico E2E');
  const pending = await json(await request('/tickets/' + created.id, 'PATCH', { status:'AGUARDANDO_USUARIO', priority:'ALTA' }));
  assert.equal(pending.priority, 'ALTA');
  assert.equal(pending.status, 'AGUARDANDO_USUARIO');
  const solved = await json(await request('/tickets/' + created.id + '/resolve', 'POST', { solution: 'Corrigido acesso ao sistema' }));
  assert.equal(solved.status, 'RESOLVIDO');
  assert.ok(solved.history.length >= 4);
  assert.equal((await json(await request('/dashboard'))).resolved_today >= 1, true);
  await json(await request('/tickets/' + created.id, 'PATCH', { priority:'URGENTE' }), 409);
  await json(await request('/tickets', 'POST', { ...{name:'a',department:'Financeiro'} }), 422);
  assert.equal((await json(await request('/auth/logout', 'POST'))).ok, true);
  await json(await request('/auth/me'), 401);
  console.log('HTTP integration OK: login/session, ticket/create/image, tracking, filters/dashboard, locks, transitions, resolve, logout');
})().catch(e => { console.error(e); process.exitCode=1; }).finally(() => pool.end());
