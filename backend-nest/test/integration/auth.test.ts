import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { Client, LEGACY_PASSWORD, skipReason, startApp, type TestApp } from '../support/harness';

describe('authentication and sessions', { skip: skipReason }, () => {
  let t: TestApp;
  before(async () => {
    t = await startApp();
    await t.createTechnician('legado', 'Técnico Legado', LEGACY_PASSWORD);
    await t.createTechnician('ana', 'Ana TI');
  });
  after(() => t?.close());

  test('health and catalog are public', async () => {
    const c = t.client();
    assert.deepEqual((await c.get('/health')).body, { status: 'ok', system: 'Givova TI' });
    assert.deepEqual((await c.get('/health/live')).body, { status: 'ok' });
    const catalog = (await c.get('/catalog')).body;
    assert.ok(catalog.departments.includes('Financeiro'));
    assert.equal(catalog.api_version, 2);
    assert.ok(catalog.features.includes('notes'));
  });

  test('logs in with a password hash created by the legacy Python backend', async () => {
    const c = t.client();
    const res = await c.post('/auth/login', { username: ' LEGADO ', password: LEGACY_PASSWORD });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['id', 'name']);
    const cookie = res.headers.get('set-cookie') ?? '';
    assert.match(cookie, /^givova_session=[A-Za-z0-9_-]{43};/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.match(cookie, /Path=\//);
    assert.equal((await c.get('/auth/me')).body.name, 'Técnico Legado');
  });

  test('session tokens are stored only as SHA-256 hashes', async () => {
    const c = await t.login('ana');
    const token = c.cookie.split('=')[1];
    const { rows } = await t.pool.query('SELECT token_hash FROM sessions');
    assert.ok(rows.every(r => r.token_hash !== token && /^[0-9a-f]{64}$/.test(r.token_hash)));
  });

  test('wrong password, unknown user and malformed bodies are refused uniformly', async () => {
    const c = t.client();
    assert.deepEqual((await c.post('/auth/login', { username: 'ana', password: 'errada' })).body, { detail: 'Usuário ou senha inválidos' });
    assert.equal((await c.post('/auth/login', { username: 'ninguem', password: 'x' })).status, 401);
    assert.equal((await c.post('/auth/login', { username: 'ana' })).status, 422);
    assert.equal((await c.post('/auth/login', { username: 'ana', password: 'x', admin: true })).status, 422);
    const raw = await fetch(t.base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(raw.status, 422);
    assert.ok(((await raw.json()) as { detail: string }).detail);
  });

  test('logout revokes the session on the server', async () => {
    const c = await t.login('ana');
    const stolen = c.cookie;
    assert.equal((await c.post('/auth/logout')).status, 200);
    assert.equal(c.cookie, '');
    const replay = new Client(t.base);
    replay.cookie = stolen;
    assert.equal((await replay.get('/auth/me')).status, 401);
  });

  test('expired sessions and forged cookies are rejected', async () => {
    const c = await t.login('ana');
    await t.pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    assert.equal((await c.get('/auth/me')).status, 401);
    const forged = new Client(t.base);
    forged.cookie = 'givova_session=' + 'A'.repeat(43);
    assert.equal((await forged.get('/dashboard')).status, 401);
    forged.cookie = "givova_session=x' OR '1'='1";
    assert.equal((await forged.get('/dashboard')).status, 401);
  });

  test('login is rate limited per user and IP', async () => {
    await t.createTechnician('alvo', 'Alvo');
    const c = t.client();
    for (let i = 0; i < 5; i++) assert.equal((await c.post('/auth/login', { username: 'alvo', password: 'errada' })).status, 401);
    const blocked = await c.post('/auth/login', { username: 'alvo', password: 'senha-de-teste-segura-123' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.body.detail, /Muitas tentativas/);
    // A different account from the same IP is unaffected.
    assert.equal((await t.client().post('/auth/login', { username: 'ana', password: 'senha-de-teste-segura-123' })).status, 200);
  });

  test('CSRF defences: foreign origins, cross-site fetches and form posts are blocked', async () => {
    const c = await t.login('ana');
    assert.equal((await c.request('POST', '/auth/logout', { origin: 'https://evil.example' })).status, 403);
    assert.equal((await c.request('POST', '/auth/logout', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    const form = await fetch(t.base + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://localhost:3000' },
      body: 'username=ana&password=x',
    });
    assert.equal(form.status, 415);
    assert.equal((await c.get('/auth/me')).status, 200);
  });

  test('CORS allows only the configured origin with credentials', async () => {
    const ok = await fetch(t.base + '/catalog', { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000');
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    const evil = await fetch(t.base + '/catalog', { headers: { Origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
  });

  test('security headers and unknown routes', async () => {
    const res = await t.client().get('/health');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(res.headers.get('x-request-id'));
    assert.equal(res.headers.get('x-powered-by'), null);
    const missing = await t.client().get('/admin');
    assert.equal(missing.status, 404);
    assert.deepEqual(missing.body, { detail: 'Endpoint inexistente.' });
  });
});
