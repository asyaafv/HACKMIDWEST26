/** Launcher checks cover occupied ports, readiness identity and process ownership without mutating Gate's database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { portBusy, freePort, gateApiReady, parsePort, Supervisor } from './run-gate.mjs';

test('port overrides reject malformed or out-of-range input', () => {
  assert.equal(parsePort(undefined, 8000), 8000);
  assert.equal(parsePort('5174', 5173), 5174);
  for (const value of ['abc', '1.5', '0', '65536', '']) assert.throws(() => parsePort(value, 8000));
});

test('an occupied port is preserved and the next port is selected', async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const port = server.address().port;
    assert.equal(await portBusy(port), true);
    assert.notEqual(await freePort(port), port);
    assert.equal(server.listening, true);
  } finally { server.close(); await once(server, 'close'); }
});

test('API reuse requires Gate identity and database readiness', async () => {
  let service = 'unrelated', consoleAvailable = false;
  const server = createServer((req, res) => {
    if (req.url === '/health') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ service, dashboard:true, demoDashboard:true, paymentExecution:true })); }
    else if (req.url === '/health/ready') res.end('{}');
    else { res.statusCode = consoleAvailable ? 200 : 404; res.end('Gate development console'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await gateApiReady(base), false);
    service = 'gate-backend'; assert.equal(await gateApiReady(base), true);
    consoleAvailable = true; assert.equal(await gateApiReady(base), true);
  } finally { server.closeAllConnections(); server.close(); await once(server, 'close'); }
});

test('cleanup of an empty supervisor cannot stop externally owned services', async () => {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await new Supervisor().stop(); assert.equal(await portBusy(server.address().port), true); }
  finally { server.close(); await once(server, 'close'); }
});
