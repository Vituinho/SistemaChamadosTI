import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { HttpException } from '@nestjs/common';
import { canTransition, PRIORITIES, STATUSES, TRANSITIONS } from '../../src/common/catalog';
import { digest, isTokenShaped, matchesDigest, randomToken } from '../../src/common/crypto';
import { formatProtocol, parseId, parseProtocol } from '../../src/common/protocol';
import { ConfigError, loadConfig } from '../../src/config/app-config';
import { LoginRateLimiter } from '../../src/auth/login-rate-limiter';
import { LoginDto } from '../../src/auth/dto/login.dto';
import { AddNoteDto, CreateTicketDto, ListTicketsQuery, UpdateTicketDto } from '../../src/tickets/dto/ticket.dto';
import { PushSubscriptionDto } from '../../src/push/push.dto';
import { toDetail } from '../../src/tickets/ticket.serializer';
import { toErrorBody } from '../../src/common/http/api-exception.filter';
import { ApiError } from '../../src/common/http/api-error';
import { destructiveStatements, loadMigrations } from '../../src/database/migrator';
import { SlidingWindowLimiter } from '../../src/common/rate-limit';
import { isPushServiceEndpoint } from '../../src/push/push.service';

function validate<T extends object>(cls: new () => T, plain: unknown) {
  const instance = plainToInstance(cls, plain as object);
  const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true, stopAtFirstError: true });
  return { instance, fields: errors.map(e => e.property) };
}

const ticket = {
  name: 'Pessoa Teste', department: 'Financeiro', state: 'PR', location: 'Sala 01',
  category: 'Sistema', affected_system: 'DBFrete', title: 'Erro no sistema', description: 'Detalhe',
};

describe('ticket DTO validation', () => {
  test('trims text, uppercases the state and accepts null description', () => {
    const { instance, fields } = validate(CreateTicketDto, { ...ticket, name: '  Pessoa Teste ', state: 'pr', description: null });
    assert.deepEqual(fields, []);
    assert.equal(instance.name, 'Pessoa Teste');
    assert.equal(instance.state, 'PR');
    assert.equal(instance.description, '');
  });
  test('optional fields default to empty strings', () => {
    const { instance, fields } = validate(CreateTicketDto, { ...ticket, category: 'Internet', affected_system: undefined, location: undefined, description: undefined });
    assert.deepEqual(fields, []);
    assert.equal(instance.location, '');
    assert.equal(instance.affected_system, '');
  });
  test('requires the affected system for category Sistema', () => {
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, affected_system: '' }).fields, ['affected_system']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, affected_system: 'SAP' }).fields, ['affected_system']);
  });
  test('rejects unknown catalog values, bad lengths, wrong types and extra fields', () => {
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, department: 'Marketing' }).fields, ['department']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, state: 'XX' }).fields, ['state']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, name: 'A' }).fields, ['name']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, title: 'x'.repeat(161) }).fields, ['title']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, description: 'x'.repeat(5001) }).fields, ['description']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, name: 42 }).fields, ['name']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, status: 'RESOLVIDO' }).fields, ['status']);
    assert.deepEqual(validate(CreateTicketDto, { ...ticket, priority: 'URGENTE' }).fields, ['priority']);
  });
  test('update accepts only known status/priority values', () => {
    assert.deepEqual(validate(UpdateTicketDto, { status: 'AGUARDANDO_USUARIO', priority: null }).fields, []);
    assert.deepEqual(validate(UpdateTicketDto, { priority: 'CRITICAL' }).fields, ['priority']);
  });
  test('notes are trimmed and bounded', () => {
    assert.deepEqual(validate(AddNoteDto, { message: ' ' }).fields, ['message']);
    assert.equal(validate(AddNoteDto, { message: '  Traga o notebook  ' }).instance.message, 'Traga o notebook');
    assert.deepEqual(validate(AddNoteDto, { message: 'x'.repeat(2001) }).fields, ['message']);
  });
  test('list query converts numbers and rejects out-of-range paging', () => {
    const { instance, fields } = validate(ListTicketsQuery, { offset: '30', limit: '30', status: '', sort: 'priority' });
    assert.deepEqual(fields, []);
    assert.equal(instance.offset, 30);
    assert.equal(instance.status, undefined);
    assert.deepEqual(validate(ListTicketsQuery, { limit: '101' }).fields, ['limit']);
    assert.deepEqual(validate(ListTicketsQuery, { offset: '-1' }).fields, ['offset']);
    assert.deepEqual(validate(ListTicketsQuery, { sort: 'random' }).fields, ['sort']);
    assert.deepEqual(validate(ListTicketsQuery, { q: ['a', 'b'] }).fields, ['q']);
  });
});

describe('auth and push DTOs', () => {
  test('login lowercases the username but never trims the password', () => {
    const { instance } = validate(LoginDto, { username: ' TI ', password: ' secret ' });
    assert.equal(instance.username, 'ti');
    assert.equal(instance.password, ' secret ');
    assert.deepEqual(validate(LoginDto, { username: 'ti', password: 'x', remember: true }).fields, ['remember']);
  });
  test('push subscriptions require HTTPS endpoints and well-formed keys', () => {
    const keys = { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) };
    assert.deepEqual(validate(PushSubscriptionDto, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }).fields, []);
    assert.deepEqual(validate(PushSubscriptionDto, { endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys }).fields, ['endpoint']);
    assert.deepEqual(validate(PushSubscriptionDto, { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { ...keys, auth: '<script>' } }).fields, ['keys']);
  });
});

describe('domain rules', () => {
  test('status transitions never skip assign/resolve and closed tickets are final', () => {
    assert.equal(canTransition('NOVO', 'RESOLVIDO'), false);
    assert.equal(canTransition('NOVO', 'EM_ATENDIMENTO'), false);
    assert.equal(canTransition('NOVO', 'CANCELADO'), true);
    assert.equal(canTransition('EM_ATENDIMENTO', 'AGUARDANDO_USUARIO'), true);
    assert.equal(TRANSITIONS.RESOLVIDO.length + TRANSITIONS.CANCELADO.length, 0);
    for (const from of STATUSES) for (const to of TRANSITIONS[from]) assert.ok(STATUSES.includes(to));
    assert.equal(PRIORITIES.length, 4);
  });
  test('protocol parsing accepts only GV-<digits> within the integer range', () => {
    assert.equal(formatProtocol(7), 'GV-000007');
    assert.equal(formatProtocol(1234567), 'GV-1234567');
    assert.equal(parseProtocol('GV-000001'), 1);
    assert.equal(parseProtocol('GV-0'), null);
    assert.equal(parseProtocol('GV-1 OR 1=1'), null);
    assert.equal(parseProtocol('gv-1'), null);
    assert.equal(parseProtocol('GV-99999999999'), null);
    assert.equal(parseId('12'), 12);
    assert.equal(parseId('012'), null);
    assert.equal(parseId('1e3'), null);
  });
  test('tokens and digests are compatible with the legacy format', () => {
    assert.equal(digest('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const token = randomToken();
    assert.equal(token.length, 43);
    assert.ok(isTokenShaped(token));
    assert.ok(matchesDigest(digest(token), token));
    assert.equal(matchesDigest(digest(token), token + 'x'), false);
    assert.equal(matchesDigest('', token), false);
    assert.equal(isTokenShaped('short'), false);
    assert.equal(isTokenShaped('a'.repeat(20) + ';'), false);
  });
  test('serializer keeps the legacy contract and labels history entries', () => {
    const created = new Date('2026-01-02T03:04:05Z');
    const detail = toDetail(
      {
        id: 3, access_hash: 'x', name: 'N', department: 'Financeiro', state: 'PR', location: '', category: 'Internet',
        affected_system: '', title: 'T', description: '', status: 'NOVO', priority: 'NORMAL', technician_id: null,
        technician: null, created_at: created, assigned_at: null, resolved_at: null, solution: null, has_attachment: false,
        last_activity_at: null,
      },
      [{ id: 1, message: 'Chamado criado', created_at: created, kind: 'event', author_name: null }],
    );
    assert.equal(detail.protocol, 'GV-000003');
    assert.equal(detail.created_at, '2026-01-02T03:04:05.000Z');
    assert.equal(detail.last_activity_at, detail.created_at);
    assert.equal('access_hash' in detail, false);
    assert.deepEqual(detail.history[0], { id: 1, message: 'Chamado criado', created_at: '2026-01-02T03:04:05.000Z', kind: 'event', author: null });
  });
});

describe('login rate limiter', () => {
  test('blocks per account and per IP inside the window, then recovers', () => {
    let now = 0;
    const limiter = new LoginRateLimiter(3, 5, 1000, 100, () => now);
    assert.ok(limiter.tryConsume('1.1.1.1', 'ana'));
    assert.ok(limiter.tryConsume('1.1.1.1', 'ana'));
    assert.ok(limiter.tryConsume('1.1.1.1', 'ana'));
    assert.equal(limiter.tryConsume('1.1.1.1', 'ana'), false);
    assert.ok(limiter.tryConsume('1.1.1.1', 'bia'));
    assert.ok(limiter.tryConsume('1.1.1.1', 'bia'));
    assert.equal(limiter.tryConsume('1.1.1.1', 'caio'), false, 'per-IP budget exhausted');
    assert.ok(limiter.tryConsume('2.2.2.2', 'ana'), 'other IPs unaffected');
    now = 1001;
    assert.ok(limiter.tryConsume('1.1.1.1', 'ana'));
  });
  test('a successful login resets the account bucket', () => {
    const limiter = new LoginRateLimiter(2, 50, 1000);
    limiter.tryConsume('ip', 'ana');
    limiter.tryConsume('ip', 'ana');
    assert.equal(limiter.tryConsume('ip', 'ana'), false);
    limiter.reset('ip', 'ana');
    assert.ok(limiter.tryConsume('ip', 'ana'));
  });
  test('memory is bounded', () => {
    const limiter = new LoginRateLimiter(10, 10, 60_000, 4);
    assert.ok(limiter.tryConsume('a', 'x'));
    assert.ok(limiter.tryConsume('b', 'x'));
    assert.equal(limiter.tryConsume('c', 'x'), false);
  });
});

describe('configuration', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@localhost/db' };
  test('secure defaults', () => {
    const config = loadConfig(base);
    assert.equal(config.cookieSecure, true);
    assert.equal(config.trustProxy, 0);
    assert.equal(config.sessionHours, 8);
    assert.equal(config.vapid, null);
    assert.equal(config.slaFirstResponseMinutes, null, 'no implicit business targets');
    assert.equal(config.ticketCreateMaxPerIp, 60);
  });
  test('rejects unsafe or malformed settings', () => {
    assert.throws(() => loadConfig({}), ConfigError);
    assert.throws(() => loadConfig({ ...base, NODE_ENV: 'production', COOKIE_SECURE: 'false' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, ALLOWED_ORIGINS: '*' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, ALLOWED_ORIGINS: '["https://a.com/path"]' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, SESSION_HOURS: '0' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, TIMEZONE: 'Mars/Base' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, VAPID_PUBLIC_KEY: 'x' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, SLA_FIRST_RESPONSE_MINUTES: '{"CRITICA":5}' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, SLA_FIRST_RESPONSE_MINUTES: '{"URGENTE":10}' }), ConfigError, 'all four priorities are required');
    assert.throws(() => loadConfig({ ...base, SLA_FIRST_RESPONSE_MINUTES: '{"URGENTE":0,"ALTA":30,"NORMAL":120,"BAIXA":480}' }), ConfigError);
    assert.throws(() => loadConfig({ ...base, TICKET_CREATE_MAX_PER_IP: '1' }), ConfigError);
  });
  test('parses origins and SLA overrides', () => {
    const config = loadConfig({ ...base, ALLOWED_ORIGINS: '["https://suporte.exemplo.com.br/"]', SLA_FIRST_RESPONSE_MINUTES: '{"URGENTE":10,"ALTA":20,"NORMAL":60,"BAIXA":240}' });
    assert.deepEqual(config.allowedOrigins, ['https://suporte.exemplo.com.br']);
    assert.deepEqual(config.slaFirstResponseMinutes, { URGENTE: 10, ALTA: 20, NORMAL: 60, BAIXA: 240 });
  });
});

describe('sliding window limiter and push endpoints', () => {
  test('limits per key inside the window and recovers', () => {
    let now = 0;
    const limiter = new SlidingWindowLimiter(2, 1000, 100, () => now);
    assert.ok(limiter.tryConsume('a'));
    assert.ok(limiter.tryConsume('a'));
    assert.equal(limiter.tryConsume('a'), false);
    assert.ok(limiter.tryConsume('b'));
    now = 1001;
    assert.ok(limiter.tryConsume('a'));
  });
  test('only browser push services are accepted as Web Push endpoints', () => {
    for (const ok of [
      'https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://wns2-by3p.notify.windows.com/w/?token=abc', 'https://web.push.apple.com/abc',
    ]) assert.ok(isPushServiceEndpoint(ok), ok);
    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc', 'https://fcm.googleapis.com:8443/x', 'https://evil.com/fcm.googleapis.com',
      'https://fcm.googleapis.com.evil.com/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://user@fcm.googleapis.com/x', 'not a url',
    ]) assert.equal(isPushServiceEndpoint(bad), false, bad);
  });
});

describe('error contract', () => {
  test('maps exceptions to { detail } without internals', () => {
    assert.deepEqual(toErrorBody(new ApiError(409, 'Conflito')), { status: 409, body: { detail: 'Conflito' } });
    assert.deepEqual(toErrorBody(new ApiError(422, 'Confira', ['name'])).body, { detail: 'Confira', fields: ['name'] });
    assert.deepEqual(toErrorBody(new HttpException('Cannot GET /x', 404)).body, { detail: 'Endpoint inexistente.' });
    const internal = toErrorBody(new Error('password=hunter2 at db.ts:12'));
    assert.equal(internal.status, 500);
    assert.equal(JSON.stringify(internal.body).includes('hunter2'), false);
  });
});

describe('migrations', () => {
  test('are ordered and never destructive', () => {
    const migrations = loadMigrations();
    assert.equal(migrations[0].version, '0000_baseline');
    assert.deepEqual(migrations.map(m => m.version), [...migrations.map(m => m.version)].sort());
    for (const migration of migrations) assert.deepEqual(destructiveStatements(migration.sql), [], migration.version);
    assert.deepEqual(destructiveStatements('DROP TABLE tickets; -- DROP TABLE x'), ['DROP TABLE']);
  });
});
