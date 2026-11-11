import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

function peer(t) {
  const child = spawn(process.execPath, [new URL('./transport-fixture.js', import.meta.url).pathname],
    { env: { PATH: process.env.PATH }, stdio: ['pipe', 'pipe', 'ignore'] });
  const reader = createInterface({ input: child.stdout });
  const waiting = new Map();
  let id = 0;
  reader.on('line', line => { const response = JSON.parse(line); waiting.get(response.id)?.(response); waiting.delete(response.id); });
  t.after(async () => { child.stdin.end(); if (child.exitCode === null) await once(child, 'close'); reader.close(); });
  const send = message => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  return { send, request(method, params) {
    const identity = ++id;
    return { id: identity, result: new Promise(resolve => { waiting.set(identity, resolve); send({ id: identity, method, params }); }) };
  } };
}

test('private transport initializes, publishes schemas and validates arguments before input', { timeout: 20000 }, async t => {
  const client = peer(t);
  assert.equal((await client.request('tools/list').result).error.code, -32000);
  const initialized = await client.request('initialize', { protocolVersion: '2024-11-05' }).result;
  assert.equal(initialized.result.serverInfo.name, 'synthetic-backbone');
  const tools = (await client.request('tools/list').result).result.tools;
  assert.equal(tools[0].inputSchema.properties.value.type, 'integer');
  assert.equal((await client.request('tools/call', { name: 'echo', arguments: { value: -1 } }).result).error.code, -32602);
  assert.equal((await client.request('tools/call', { name: 'echo', arguments: { secret: true } }).result).error.code, -32602);
  const [first, second] = await Promise.all([
    client.request('tools/call', { name: 'echo', arguments: { value: 2 } }).result,
    client.request('tools/call', { name: 'echo' }).result,
  ]);
  assert.equal(JSON.parse(first.result.content[0].text).value, 2);
  assert.equal(JSON.parse(second.result.content[0].text).value, 0);
  assert.equal((await client.request('unknown').result).error.code, -32601);
});

test('cancellation reaches the correct in-flight request while other calls complete', { timeout: 20000 }, async t => {
  const client = peer(t);
  await client.request('initialize', { protocolVersion: '2025-06-18' }).result;
  const pending = client.request('tools/call', { name: 'wait' });
  assert.deepEqual((await client.request('ping').result).result, {});
  client.send({ method: 'notifications/cancelled', params: { requestId: pending.id } });
  assert.equal((await pending.result).result.isError, true);
});

test('ScummWEB backbone rejects direct unmanaged launch', { timeout: 20000 }, () => {
  const result = spawnSync(process.execPath, [new URL('../src/server.js', import.meta.url).pathname],
    { env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 15000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /internal ScummWEB backbone/);
});
