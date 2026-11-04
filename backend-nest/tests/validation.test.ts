import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { catalog, digest, protocolId, transitions, validateTicket, validateUpdate, validateLogin } from '../src/shared';

const valid = {
  name: 'Pessoa Teste', department: 'Financeiro', state: 'PR', location: 'Sala 01',
  category: 'Sistema', affected_system: 'DBFrete', title: 'Erro no sistema', description: '',
};

test('preserves frontend catalog contract', () => {
  assert.ok(catalog().departments.includes('Financeiro'));
  assert.ok(catalog().systems.includes('DBFrete'));
  assert.equal(catalog().statuses.length, 6);
});
test('ticket input trims and canonicalizes state', () => {
  assert.deepEqual(validateTicket({ ...valid, name: ' Pessoa Teste ', state: 'pr', description: null }), valid);
});
test('rejects invalid or missing software context', () => {
  assert.throws(() => validateTicket({ ...valid, affected_system: '' }));
  assert.throws(() => validateTicket({ ...valid, department: 'Outside' }));
  assert.throws(() => validateTicket({ ...valid, unknown: 'value' }));
});
test('rejects dangerous state transitions', () => {
  assert.equal(transitions.NOVO.includes('RESOLVIDO'), false);
  assert.equal(transitions.RESOLVIDO.length, 0);
  assert.equal(validateUpdate({ status: 'AGUARDANDO_USUARIO' }).status, 'AGUARDANDO_USUARIO');
  assert.throws(() => validateUpdate({ priority: 'CRITICAL' }));
});
test('password spaces are significant', () => {
  assert.equal(validateLogin({ username: ' TI ', password: ' secret ' }).username, 'ti');
  assert.equal(validateLogin({ username: 'TI', password: ' secret ' }).password, ' secret ');
});
test('tracking parses only valid protocol shapes', () => {
  assert.equal(protocolId('GV-000001'), 1);
  assert.equal(protocolId('invalid'), null);
  assert.equal(protocolId('GV-1 OR 1=1'), null);
  assert.equal(digest('abc').length, 64);
});
