const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { Error, module, exports: module.exports, require: (id) => imports[id], setTimeout: (resolve) => queueMicrotask(resolve) });
  return module.exports;
}
const { ApiError } = load('api.ts');
function session(results) {
  let calls = 0;
  const { loadSession } = load('session.ts', { './api': { ApiError, api: async () => { const value = results[Math.min(calls++, results.length - 1)]; if (value instanceof Error) throw value; return value; } } });
  return { loadSession, calls: () => calls };
}
test('401 means unauthenticated and is never retried', async () => {
  const check = session([new ApiError('unauthenticated', 401)]);
  assert.equal(await check.loadSession(new AbortController().signal), null);
  assert.equal(check.calls(), 1);
});
test('temporary network failure retries and retains the authenticated user', async () => {
  const user = { id: 'test-user', settings: {} };
  const check = session([new TypeError('network unavailable'), user]);
  assert.equal(await check.loadSession(new AbortController().signal), user);
  assert.equal(check.calls(), 2);
});
test('persistent server failure is an error, never a signed-out result', async () => {
  const failure = new ApiError('server unavailable', 503);
  const check = session([failure]);
  await assert.rejects(check.loadSession(new AbortController().signal), (e) => e === failure);
  assert.equal(check.calls(), 3);
});
test('403 is reported without retries or pretending the session is absent', async () => {
  const failure = new ApiError('forbidden', 403);
  const check = session([failure]);
  await assert.rejects(check.loadSession(new AbortController().signal), (e) => e === failure);
  assert.equal(check.calls(), 1);
});
test('cancelled session check cannot return a signed-out result', async () => {
  const check = session([new ApiError('unauthenticated', 401)]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(check.loadSession(controller.signal));
  assert.equal(check.calls(), 1);
});

