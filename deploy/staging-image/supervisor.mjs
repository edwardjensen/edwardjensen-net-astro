// Staging site supervisor: builds the site from a content relay and serves it in workerd, in one container.
//
// It builds once at start and again on every authenticated POST /build (the CMS calls it after a publish). Each build reads one of two content sources through the same /v2 contract the production site uses: `staging` (the staging relay, the default) or `production` (the production relay, to preview the site against real content). Which one is a sticky setting: POST /source changes it, it survives a restart (DATA_DIR/source.json), and every build uses it until it is changed again. A publish on staging therefore rebuilds from whichever source is selected. Whatever calls these routes is left open: this is only the door, and it is only on the control port, which the stack keeps off the public routers.
//
// Each build lands in its own release folder, `current` is flipped to it, and `wrangler dev` is restarted on it, because wrangler reads the release when it starts. A failed build leaves the last good release serving.
//
// When a staging publish says which relay version it pushed (client_payload.relayVersion), the build first waits for the staging relay to report that version, as production's republish workflow does (.github/scripts/wait-for-relay.sh): KV can serve a stale copy for a short while after a write.
//
// Settings (environment):
//   SITE_BUILD_TOKEN   required. The bearer token POST /build, POST /source and GET /status must present.
//   STAGING_CONTENT_URL / STAGING_CONTENT_READ_KEY   the staging relay (base URL, no /v2) and this builder's read key for it. Required unless the legacy CMS_API_URL is set.
//   PRODUCTION_CONTENT_URL / PRODUCTION_CONTENT_READ_KEY   optional. The production relay and a read key for it, so the source can be switched to production.
//   CMS_API_URL        legacy. Used for the staging source only when STAGING_CONTENT_URL is not set: the staging CMS's own API root (for example http://cms:3000/api), read with no key and with no freshness gate.
//   PUBLIC_INTAKE_SUBMIT_URL / PUBLIC_HCAPTCHA_SITEKEY   optional. Passed to the build so the /hi/{tag}/ event pages get their intake forms (docs/environment.md).
//   SITE_SHA           the commit this image was built from (set by the Dockerfile).
//   SITE_TIMEZONE      for the build date (default UTC).
//   DATA_DIR           where releases/, current and source.json live (default /srv/site). Must be writable.
//   SITE_PORT          where wrangler serves the site (default 8787).
//   CONTROL_PORT       where the control routes and GET /healthz listen (default 8080). Never route this publicly.
//   DEBOUNCE_MS        how long to wait after a request before building, so a publish transaction has committed and close requests coalesce (default 5000).
//   KEEP_RELEASES      how many releases to keep (default 3).
//   RELAY_WAIT_MS      how long a build waits for the staging relay to reach a published version before it fails (default 180000).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const APP_DIR = process.env.APP_DIR ?? '/app';
const DATA_DIR = process.env.DATA_DIR ?? '/srv/site';
const SITE_PORT = process.env.SITE_PORT ?? '8787';
const CONTROL_PORT = Number(process.env.CONTROL_PORT ?? 8080);
const DEBOUNCE_MS = Number(process.env.DEBOUNCE_MS ?? 5000);
const KEEP_RELEASES = Number(process.env.KEEP_RELEASES ?? 3);
const RELAY_WAIT_MS = Number(process.env.RELAY_WAIT_MS ?? 180_000);
const RELAY_POLL_MS = 5_000;
const RETRY_FIRST_BUILD_MS = 60_000;
const TOKEN = process.env.SITE_BUILD_TOKEN ?? '';
const trimUrl = (value) => (value ?? '').replace(/\/$/, '');
const STAGING_RELAY_URL = trimUrl(process.env.STAGING_CONTENT_URL);
const LEGACY_CMS_URL = trimUrl(process.env.CMS_API_URL);
const PRODUCTION_URL = trimUrl(process.env.PRODUCTION_CONTENT_URL);
const SHA = process.env.SITE_SHA ?? 'unknown';
const TIMEZONE = process.env.SITE_TIMEZONE ?? 'UTC';

if (!TOKEN || !(STAGING_RELAY_URL || LEGACY_CMS_URL)) {
  console.error('SITE_BUILD_TOKEN and STAGING_CONTENT_URL (or the legacy CMS_API_URL) must both be set.');
  process.exit(1);
}

// What each source reads. `relay` says the url serves the relay's /v2 contract with a version to wait for.
const SOURCES = {
  staging: STAGING_RELAY_URL
    ? { url: STAGING_RELAY_URL, key: process.env.STAGING_CONTENT_READ_KEY ?? '', relay: true }
    : { url: LEGACY_CMS_URL, key: '', relay: false },
  production: { url: PRODUCTION_URL, key: process.env.PRODUCTION_CONTENT_READ_KEY ?? '', relay: true },
};

const releasesDir = path.join(DATA_DIR, 'releases');
const currentLink = path.join(DATA_DIR, 'current');
const sourceFile = path.join(DATA_DIR, 'source.json');
const log = (msg) => console.log(`[supervisor] ${new Date().toISOString()} ${msg}`);

const isUsable = (name) => name in SOURCES && Boolean(SOURCES[name].url);
const state = { selected: 'staging', built: null, release: null, building: false, queued: null, lastBuild: null, lastOk: null };
let debounceTimer = null;
// A one-off source asked for by the latest request, or null to use the selected one.
let pendingOverride = null;
// Relay versions the staging publishes since the last build said they pushed, per collection: the build waits for the newest.
const pendingGates = new Map();
let wrangler = null;
let stopping = false;

function run(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code ?? signal}`))));
  });
}

// The selected source outlives a restart. An unreadable or unusable value falls back to staging.
async function loadSelected() {
  try {
    const { source } = JSON.parse(await readFile(sourceFile, 'utf8'));
    if (isUsable(source)) return source;
    log(`stored source ${JSON.stringify(source)} is not usable; using staging`);
  } catch (err) {
    if (err.code !== 'ENOENT') log(`could not read ${sourceFile} (${err.message}); using staging`);
  }
  return 'staging';
}

async function saveSelected(source) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${sourceFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ source, changedAt: new Date().toISOString() })}\n`);
  await rename(tmp, sourceFile);
}

async function writeBuildInfo(stamp, source) {
  const version = `main-${SHA.slice(0, 7)}`;
  const buildDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIMEZONE });
  const info = {
    commit: SHA,
    buildId: stamp,
    buildDate,
    version,
    buildName: 'Staging builder',
    siteTitle: `Edward Jensen [STAGING · ${version} · ${source}]`,
  };
  const body = `// Auto-generated by the staging builder. Do not edit manually.\nexport const buildInfo = ${JSON.stringify(info, null, 2)} as const;\n`;
  await writeFile(path.join(APP_DIR, 'src/data/buildinfo.ts'), body);
}

async function relayVersion(source, collection) {
  const { url, key } = SOURCES[source];
  try {
    const response = await fetch(`${url}/v2/${collection}?limit=1`, {
      headers: { Accept: 'application/json', ...(key ? { 'X-Read-Key': key } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { error: `${response.status} ${response.statusText}` };
    return { version: (await response.json()).version ?? null };
  } catch (err) {
    return { error: String(err.message ?? err) };
  }
}

// Blocks until the relay reports at least each version a publish pushed, or fails the build. Versions are ISO 8601 UTC strings the relay mints, so comparing them as text compares them in time.
async function waitForRelay(source, gates) {
  const deadline = Date.now() + RELAY_WAIT_MS;
  for (const [collection, target] of gates) {
    for (let waited = 0; ; waited += 1) {
      const { version, error } = await relayVersion(source, collection);
      if (version === null) {
        // A relay that predates versioning has nothing to wait for; production's gate falls back to a weaker check, this one proceeds.
        log(`${source} relay reports no version for '${collection}'; not waiting`);
        break;
      }
      if (version && !(version < target)) {
        log(`${source} relay '${collection}' is at ${version} (>= ${target})`);
        break;
      }
      if (Date.now() >= deadline) {
        throw new Error(`${source} relay did not reach '${collection}' version ${target} within ${RELAY_WAIT_MS / 1000}s (${error ?? `at ${version}`}); refusing to build from unverified content`);
      }
      if (waited % 6 === 0) log(`waiting for ${source} relay '${collection}' ${target} (${error ?? `at ${version}`})`);
      await new Promise((resolve) => setTimeout(resolve, RELAY_POLL_MS));
    }
  }
}

async function build(source) {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const name = `${stamp}-${SHA.slice(0, 7)}`;
  const staging = path.join(releasesDir, `.${name}.tmp`);
  log(`build ${name} starting (${source})`);
  await writeBuildInfo(stamp, source);
  await run('npm', ['run', 'build'], {
    cwd: APP_DIR,
    env: { ...process.env, CONTENT_RELAY_URL: SOURCES[source].url, CONTENT_RELAY_READ_KEY: SOURCES[source].key },
  });
  await mkdir(releasesDir, { recursive: true });
  await rm(staging, { recursive: true, force: true });
  await cp(path.join(APP_DIR, 'dist'), staging, { recursive: true });
  await rename(staging, path.join(releasesDir, name));
  // Flip `current` in one step: a relative link, made beside it and renamed over it.
  const tmpLink = `${currentLink}.tmp`;
  await rm(tmpLink, { force: true });
  await symlink(path.join('releases', name), tmpLink);
  await rename(tmpLink, currentLink);
  await prune(name);
  log(`build ${name} is current`);
  return name;
}

async function prune(keepName) {
  const entries = (await readdir(releasesDir, { withFileTypes: true })).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const old = entries.map((e) => e.name).sort().reverse().slice(KEEP_RELEASES).filter((n) => n !== keepName);
  for (const n of old) await rm(path.join(releasesDir, n), { recursive: true, force: true });
  // Half-made releases left by a crash.
  for (const e of await readdir(releasesDir)) if (e.startsWith('.') && e.endsWith('.tmp')) await rm(path.join(releasesDir, e), { recursive: true, force: true });
}

function startWrangler() {
  if (stopping) return Promise.resolve();
  const config = path.join(currentLink, 'server/wrangler.json');
  wrangler = spawn(
    path.join(APP_DIR, 'node_modules/.bin/wrangler'),
    ['dev', `--config=${config}`, '--local', '--ip=0.0.0.0', `--port=${SITE_PORT}`, `--persist-to=${path.join(DATA_DIR, 'wrangler-state')}`, '--show-interactive-dev-session=false', '--live-reload=false', '--log-level=warn'],
    { cwd: path.join(currentLink, 'server'), stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' } },
  );
  const mine = wrangler;
  mine.on('exit', (code, signal) => {
    if (wrangler === mine) wrangler = null;
    if (!stopping && signal !== 'SIGTERM') log(`wrangler exited ${code ?? signal}; the next build restarts it`);
  });
  return Promise.resolve();
}

function stopWrangler() {
  const child = wrangler;
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 10_000).unref();
  });
}

async function cycle() {
  if (state.building) {
    state.queued = { override: pendingOverride };
    return;
  }
  const override = pendingOverride;
  const source = override ?? state.selected;
  // Take the versions published so far: ones that arrive during this build belong to the next one.
  const gates = new Map(pendingGates);
  pendingGates.clear();
  state.building = true;
  state.lastBuild = { startedAt: new Date().toISOString(), source, override, ok: null };
  try {
    // Only the staging relay is waited for: a staging publish says nothing about the production relay's versions.
    if (source === 'staging' && SOURCES.staging.relay && gates.size) {
      state.lastBuild.waitedFor = Object.fromEntries(gates);
      await waitForRelay('staging', gates);
    }
    state.release = await build(source);
    state.built = source;
    await stopWrangler();
    await startWrangler();
    state.lastBuild.ok = true;
    state.lastOk = new Date().toISOString();
  } catch (err) {
    state.lastBuild.ok = false;
    state.lastBuild.error = String(err.message ?? err);
    log(`build failed: ${state.lastBuild.error}; ${existsSync(currentLink) ? 'the last good release keeps serving' : 'nothing is serving yet, retrying'}`);
    // With nothing to serve yet, keep trying: a relay that was not reachable when this started will be soon.
    if (!existsSync(currentLink)) setTimeout(() => request(state.lastBuild?.override ?? null), RETRY_FIRST_BUILD_MS).unref();
  } finally {
    state.lastBuild.finishedAt = new Date().toISOString();
    state.building = false;
    if (state.queued) {
      const next = state.queued;
      state.queued = null;
      request(next.override);
    }
  }
}

// Requests close together share one build; the wait also lets the publish that asked commit first.
function request(override = null) {
  pendingOverride = override;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(cycle, DEBOUNCE_MS);
}

function authorised(req) {
  const given = Buffer.from(req.headers.authorization ?? '');
  const want = Buffer.from(`Bearer ${TOKEN}`);
  return given.length === want.length && timingSafeEqual(given, want);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

const sourceProblem = (source) => (!(source in SOURCES) ? `source must be one of: ${Object.keys(SOURCES).join(', ')}` : !SOURCES[source].url ? `the ${source} source is not configured` : null);

// POST /build: a rebuild from the selected source. A `source` (query or body) builds from that one just this once and leaves the selection alone.
async function requestedBuild(req, send) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(400, { error: 'Body must be JSON' });
  }
  const override = new URL(req.url, 'http://x').searchParams.get('source') || body.source || null;
  if (override && sourceProblem(override)) return send(400, { error: sourceProblem(override) });
  // The relay version a staging publish pushed: the build waits for it. Only the newest per collection matters.
  const { collection, relayVersion: version } = body.client_payload ?? {};
  if (typeof collection === 'string' && typeof version === 'string' && (pendingGates.get(collection) ?? '') < version) pendingGates.set(collection, version);
  log(`build requested (${override ? `one-off ${override}` : `selected ${state.selected}`}${collection ? `, ${collection} ${version ?? 'no version'}` : ''})`);
  request(override);
  return send(202, { accepted: true, source: override ?? state.selected, selected: state.selected, building: state.building });
}

// POST /source: the new selection, kept until the next change, and a build from it.
async function selectedSource(req, send) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(400, { error: 'Body must be JSON like {"source":"production"}' });
  }
  const problem = sourceProblem(body.source);
  if (problem) return send(400, { error: problem });
  state.selected = body.source;
  await saveSelected(body.source);
  log(`source is now ${body.source}`);
  request(null);
  return send(202, { accepted: true, source: body.source, building: state.building });
}

const server = createServer((req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const route = `${req.method} ${req.url?.split('?')[0]}`;
  if (route === 'GET /healthz') return send(200, { ok: true });
  if (route === 'POST /build' || route === 'POST /source' || route === 'GET /status') {
    if (!authorised(req)) return send(401, { error: 'Bearer token required' });
    if (route === 'GET /status') return send(200, { ...state, sha: SHA, sources: Object.fromEntries(Object.entries(SOURCES).map(([name, s]) => [name, { configured: Boolean(s.url), relay: s.relay }])) });
    const handler = route === 'POST /build' ? requestedBuild : selectedSource;
    return handler(req, send).catch((err) => {
      log(`${route} failed: ${err.message ?? err}`);
      send(500, { error: 'Request failed' });
    });
  }
  return send(404, { error: 'Not found' });
});
server.listen(CONTROL_PORT, '0.0.0.0', () => log(`control listening on ${CONTROL_PORT}; site on ${SITE_PORT}`));

state.selected = await loadSelected();
log(`source: ${state.selected} (${SOURCES[state.selected].relay ? 'relay' : 'legacy direct CMS'})`);

// Serve what is already there, if anything, while the start-up build runs: a restart should not take the site down.
if (existsSync(currentLink)) await startWrangler();
request();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    stopping = true;
    await stopWrangler();
    process.exit(0);
  });
}
