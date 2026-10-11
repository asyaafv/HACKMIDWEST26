/** Supervises local Gate setup/services. Existing services and payment history are never reset or killed. */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer, createConnection } from 'node:net';
import { mkdir, access, copyFile, open, readFile, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backend = resolve(root, 'backend');
const frontend = resolve(root, 'frontend');
const work = resolve(backend, 'work');
// Windows cannot spawn npm.cmd without a shell; invoke npm's JS entry instead.
const npm = process.platform === 'win32' ? process.execPath : 'npm';
const npmEntry = process.platform === 'win32' ? resolve(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js') : null;
const npmArgs = args => npmEntry ? [npmEntry, ...args] : args;

export async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

export async function portBusy(port, host = '127.0.0.1') {
  return new Promise(resolveProbe => {
    const socket = createConnection({ port, host });
    const complete = busy => { socket.destroy(); resolveProbe(busy); };
    socket.setTimeout(500);
    socket.once('connect', () => complete(true));
    socket.once('error', () => complete(false));
    socket.once('timeout', () => complete(false));
  });
}

export async function freePort(preferred) {
  for (let port = preferred; port < preferred + 20 && port < 65536; port++) {
    const available = await new Promise(resolveProbe => {
      const server = createServer();
      server.once('error', () => resolveProbe(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolveProbe(true)));
    });
    if (available) return port;
  }
  throw new Error(`No free local port near ${preferred}.`);
}

export async function gateApiReady(base, origin) {
  try {
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1500), ...(origin ? {headers:{Origin:origin}} : {}) });
    if (!health.ok) return false;
    const identity = await health.json();
    if (identity.service !== 'gate-backend' || identity.dashboard !== true || identity.demoDashboard !== true || identity.paymentExecution !== true) return false;
    const ready = await fetch(`${base}/health/ready`, { signal: AbortSignal.timeout(1500) });
    if (!ready.ok) return false;
    return true;
  } catch { return false; }
}

export function parsePort(value, fallback) {
  const port = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Service ports must be integers between 1 and 65535.');
  return port;
}

/** Every child has its own group; cleanup signals only the supervisor's recorded children. */
export class Supervisor {
  children = [];
  stopping = false;
  unexpectedExit = null;
  async start(name, args, cwd, env) {
    const logPath = resolve(work, `${name}.log`);
    const log = await open(logPath, 'w', 0o600);
    const child = spawn(npm, npmArgs(args), { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', log.fd, log.fd] });
    await log.close();
    const record = { name, child, logPath, exited: false };
    this.children.push(record);
    child.once('error', () => { record.exited = true; this.unexpectedExit ??= `${name} failed to start. See ${logPath}`; });
    child.once('exit', (code, signal) => {
      record.exited = true;
      if (!this.stopping) this.unexpectedExit ??= `${name} stopped (${signal ?? code}). See ${logPath}`;
    });
    return record;
  }
  async waitFor(check, description, timeout = 60000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (this.unexpectedExit) throw new Error(this.unexpectedExit);
      if (await check()) return;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${description}. Logs: ${work}`);
  }
  async stop() {
    if (this.stopping) return;
    this.stopping = true;
    // Stop consumers first and the owned database last, allowing normal pool shutdown.
    for (const record of [...this.children].reverse()) {
      if (record.exited || !record.child.pid) continue;
      const signal = value => {
        try { process.kill(process.platform === 'win32' ? record.child.pid : -record.child.pid, value); }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      };
      signal('SIGTERM');
      const deadline = Date.now() + 8000;
      while (!record.exited && Date.now() < deadline) await sleep(100);
      if (!record.exited) signal('SIGKILL');
    }
  }
}

async function command(name, args, cwd, env) {
  console.log(`[Gate] ${name}`);
  await new Promise((resolveCommand, reject) => {
    const child = spawn(npm, npmArgs(args), { cwd, env, stdio: 'inherit' });
    child.once('error', () => reject(new Error(`Cannot start npm for ${name}.`)));
    child.once('exit', code => code === 0 ? resolveCommand() : reject(new Error(`${name} failed. See the command output above.`)));
  });
}

async function dependencies(directory, env) {
  const modules = resolve(directory, 'node_modules');
  const lock = resolve(directory, 'package-lock.json');
  const stamp = resolve(modules, '.gate-launcher-lock');
  const current = await readFile(lock, 'utf8');
  const old = await readFile(stamp, 'utf8').catch(() => '');
  const installed = await readFile(resolve(modules, '.package-lock.json'), 'utf8').then(JSON.parse).catch(() => null);
  const expected = JSON.parse(current);
  const supported = (list, value) => !list || (!list.includes(`!${value}`) && (!list.some(item => !item.startsWith('!')) || list.includes(value)));
  const matches = installed && Object.entries(expected.packages).every(([path, entry]) => path === '' || !supported(entry.os, process.platform) || !supported(entry.cpu, process.arch) || installed.packages?.[path]?.version === entry.version);
  if (old !== current && !matches) {
    if (directory === backend && await portBusy(55432)) throw new Error('Backend dependencies changed while local PostgreSQL is running. Stop its owning terminal first, then rerun; the launcher will not replace a running database runtime.');
    await command(`Installing locked ${directory === backend ? 'backend' : 'frontend'} dependencies`, ['ci', '--cache', resolve(work, 'npm-cache')], directory, env);
  }
  if (old !== current) {
    const file = await open(stamp, 'w');
    try { await file.writeFile(current); } finally { await file.close(); }
  }
}

/** npm may silently omit optional binaries; make the local PostgreSQL platform package an explicit check. */
async function postgresRuntime(env) {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const name = `@embedded-postgres/${platform}-${process.arch}`;
  const requireBackend = createRequire(resolve(backend, 'package.json'));
  try { requireBackend.resolve(name); return; } catch { /* Install the exact version already pinned in the lockfile. */ }
  if (await portBusy(55432)) throw new Error('Local PostgreSQL is running with a missing runtime. Stop its owning terminal before repairing dependencies.');
  const lock = JSON.parse(await readFile(resolve(backend, 'package-lock.json'), 'utf8'));
  const version = lock.packages?.[`node_modules/${name}`]?.version;
  if (!version) throw new Error(`No locked PostgreSQL runtime for ${platform}/${process.arch}. Use a separately configured local PostgreSQL server.`);
  await command('Installing the locked local PostgreSQL runtime', ['install', '--no-save', '--package-lock=false', '--include=optional', '--fetch-retries=1', '--fetch-timeout=60000', `${name}@${version}`, '--cache', resolve(work, 'npm-cache')], backend, env);
  requireBackend.resolve(name);
}

async function acquireLock() {
  const path = resolve(work, 'gate-launcher.pid');
  try {
    const file = await open(path, 'wx', 0o600);
    await file.writeFile(String(process.pid)); await file.close();
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const old = Number(await readFile(path, 'utf8'));
    let alive = Number.isInteger(old) && old > 0;
    if (alive) {
      try { process.kill(old, 0); } catch (probeError) { alive = probeError.code !== 'ESRCH'; }
    }
    if (alive) throw new Error('Another Gate launcher is active. Use its terminal or stop it with Ctrl+C first.');
    await unlink(path); return acquireLock();
  }
  return async () => {
    if (await readFile(path, 'utf8').catch(() => '') === String(process.pid)) await unlink(path);
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if ([...args].some(arg => !['--smoke', '--help'].includes(arg))) throw new Error('Usage: ./run-gate.sh [--smoke]');
  if (args.has('--help')) { console.log('Run run-gate.cmd on Windows or ./run-gate.sh on macOS/Linux. The smoke option starts, checks readiness, then stops owned services. Ctrl+C stops owned services; existing services and payment data are preserved.'); return; }
  await mkdir(work, { recursive: true, mode: 0o700 });
  const releaseLock = await acquireLock();
  const supervisor = new Supervisor();
  let stopRequested = false;
  const onSignal = () => { stopRequested = true; supervisor.unexpectedExit ??= 'Shutdown requested.'; };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  try {
    const envFile = resolve(backend, '.env');
    if (!await fileExists(envFile)) await copyFile(resolve(backend, '.env.example'), envFile);
    process.loadEnvFile(envFile);
    const baseEnv = { ...process.env, NODE_ENV: 'development', APP_MODE: 'sandbox', HOST: '127.0.0.1' };
    await dependencies(backend, baseEnv);
    await dependencies(frontend, baseEnv);
    await postgresRuntime(baseEnv);
    const requireBackend = createRequire(resolve(backend, 'package.json'));
    const { Pool } = requireBackend('pg');
    const databaseUrl = new URL(baseEnv.DATABASE_URL);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) throw new Error('This launcher starts local development only. Use a separate deployment runbook for a remote database.');
    const databaseReady = async () => {
      const db = new Pool({ connectionString: baseEnv.DATABASE_URL, connectionTimeoutMillis: 1500, max: 1 });
      try { await db.query('SELECT 1'); return true; } catch { return false; } finally { await db.end(); }
    };
    if (await databaseReady()) console.log('[Gate] Reusing the configured local database.');
    else {
      if ((databaseUrl.port || '5432') !== '55432' || databaseUrl.pathname !== '/gate') throw new Error('Configured local database is unavailable. Start it, or use the default backend/.env.example settings.');
      if (await portBusy(55432)) throw new Error('Port 55432 is occupied but the configured Gate database is unavailable. No existing process was stopped.');
      await supervisor.start('database', ['run', 'db:local'], backend, baseEnv);
      await supervisor.waitFor(databaseReady, 'PostgreSQL');
    }
    await command('Applying versioned database migrations', ['run', 'db:migrate'], backend, baseEnv);
    await command('Preparing synthetic demo data without resetting history', ['run', 'demo:prepare'], backend, baseEnv);

    const preferredApi = parsePort(process.env.GATE_API_PORT ?? process.env.PORT, 8000);
    let apiPort = preferredApi;
    let existingApi = await gateApiReady(`http://127.0.0.1:${apiPort}`);
    if (!existingApi) apiPort = await freePort(preferredApi);
    const frontendPort = await freePort(parsePort(process.env.GATE_FRONTEND_PORT, 5173));
    const frontendUrl = `http://127.0.0.1:${frontendPort}`;
    if (existingApi && !await gateApiReady(`http://127.0.0.1:${apiPort}`, frontendUrl)) {
      existingApi = false; apiPort = await freePort(preferredApi);
    }
    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const scopeDb = new Pool({connectionString:baseEnv.DATABASE_URL,max:1});
    let demoScope;
    try { demoScope = (await scopeDb.query("SELECT p.org_id,p.id FROM principals p JOIN organizations o ON o.id=p.org_id WHERE o.name='Gate sandbox' AND p.role='FINANCE' AND p.active ORDER BY p.org_id,p.id LIMIT 1")).rows[0]; }
    finally { await scopeDb.end(); }
    if (!demoScope) throw new Error('No prepared demo workspace is available.');
    const serviceEnv = { ...baseEnv, PORT: String(apiPort), GATE_API_URL: apiUrl,
      DEMO_WORKSPACE_ORG_ID: demoScope.org_id, DEMO_WORKSPACE_PRINCIPAL_ID: demoScope.id,
      ALLOWED_ORIGINS: [...new Set([apiUrl, frontendUrl, `http://localhost:${apiPort}`, `http://localhost:${frontendPort}`, ...String(baseEnv.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean)])].join(','),
      BROWSER_ALLOWED_HOSTS: `127.0.0.1:${apiPort},localhost:${apiPort}`,
      MCP_ALLOWED_HOSTS: `127.0.0.1:${apiPort},localhost:${apiPort}` };
    if (existingApi) console.log('[Gate] Reusing the existing healthy Gate API.');
    else await supervisor.start('api', ['run', 'dev'], backend, serviceEnv);
    await supervisor.waitFor(() => gateApiReady(apiUrl), 'Gate API');
    await supervisor.start('worker', ['run', 'worker'], backend, serviceEnv);
    await supervisor.start('frontend', ['run', 'dev', '--', '--port', String(frontendPort), '--strictPort'], frontend, serviceEnv);
    await supervisor.waitFor(async () => {
      try { const response = await fetch(frontendUrl, { signal: AbortSignal.timeout(1500) }); return response.ok && /Gate/.test(await response.text()); } catch { return false; }
    }, 'frontend');
    await sleep(750);
    if (supervisor.unexpectedExit) throw new Error(supervisor.unexpectedExit);
    console.log(`\nGate is ready.\n  Gate dashboard: ${frontendUrl}\n  API: ${apiUrl}/v1\n  MCP: ${apiUrl}/mcp\n  Dashboard: opens directly, no login\n  Service logs: ${work}\n\nLow-risk purchases execute in the sandbox. Purchases over $1,000 and other review cases require approval.\nPress Ctrl+C to stop services started by this launcher. Existing services/data remain intact.\n`);
    if (args.has('--smoke')) { console.log('[Gate] Startup smoke check passed. Stopping owned services.'); return; }
    while (!stopRequested) {
      if (supervisor.unexpectedExit) throw new Error(supervisor.unexpectedExit);
      await sleep(500);
    }
  } catch (error) {
    if (!stopRequested) throw error;
  } finally {
    await supervisor.stop(); await releaseLock();
    process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[Gate] ${error.message}`); process.exitCode = 1; });
}
