// Staging site supervisor: builds the site from a content relay and serves it in workerd, in one container.
//
// It builds once at start and again on every authenticated POST /build (the CMS calls it after a publish). Each build reads one of two content sources through the same /v2 contract the production site uses: `staging` (the staging relay, the default) or `production` (the production relay, to preview the site against real content). Which one is a sticky setting: POST /source changes it, it survives a restart (DATA_DIR/source.json), and every build uses it until it is changed again. A publish on staging therefore rebuilds from whichever source is selected. Whatever calls these routes is left open: this is only the door, and it is only on the control port, which the stack keeps off the public routers.
//
// Each build lands in its own release folder, `current` is flipped to it, and `wrangler dev` is restarted on it, because wrangler reads the release when it starts. A failed build leaves the last good release serving.
//
// When a staging publish says which relay version it pushed (client_payload.relayVersion), the build first waits for the staging relay to report that version, as production's republish workflow does (.github/scripts/wait-for-relay.sh): KV can serve a stale copy for a short while after a write.
//
// Two code trees can be built: `main` (the commit this image was built from, in /app) and `release` (the newest production tag, fetched into /release when the image was built). The selection of code and of content source is sticky together (POST /select changes either or both; POST /source changes only the source). Every build reports its phase (requested, waiting-for-relay, building, publishing, restarting) and its output on `bus`, and why it started (a CMS publish, a selection, a manual request), which the viewer in front of the site shows.
//
// The site is served through a small front proxy on SITE_PORT: wrangler listens on WRANGLER_PORT (loopback only). The viewer is the front door: a browser opening any page (a top-level navigation, `Sec-Fetch-Dest: document`) gets the viewer, a page around the site that switches the code tree and content source, starts a rebuild, and shows a build's progress live (server-sent events); the viewer's frame asks for the same URL as an iframe and gets the site, unchanged, with a "rebuilding" page while wrangler is down. Feed readers, assets, curl and the like send no document header and get the site. `?__raw=1` shows a page on its own. The viewer's API (/_viewer/) calls this process directly, so the control token never reaches a browser; its POSTs accept only same-origin JSON.
//
// Prometheus metrics are served at GET /metrics on the site port (metrics.mjs): builds, their duration and failures, the relay wait, what is selected and serving, the container's memory, and the proxy's traffic.
//
// Settings (environment):
//   SITE_BUILD_TOKEN   required. The bearer token POST /build, POST /source and GET /status must present.
//   STAGING_CONTENT_URL / STAGING_CONTENT_READ_KEY   the staging relay (base URL, no /v2) and this builder's read key for it. Required unless the legacy CMS_API_URL is set.
//   PRODUCTION_CONTENT_URL / PRODUCTION_CONTENT_READ_KEY   optional. The production relay and a read key for it, so the source can be switched to production.
//   CMS_API_URL        legacy. Used for the staging source only when STAGING_CONTENT_URL is not set: the staging CMS's own API root (for example http://cms:3000/api), read with no key and with no freshness gate.
//   PUBLIC_INTAKE_SUBMIT_URL / PUBLIC_HCAPTCHA_SITEKEY   optional. Passed to the build so the /hi/{tag}/ event pages get their intake forms (docs/environment.md).
//   SITE_SHA           the commit this image was built from (set by the Dockerfile).
//   RELEASE_TAG / RELEASE_SHA   the newest production tag and its commit, when the image carries a release tree at RELEASE_DIR (default /release).
//   SITE_TIMEZONE      for the build date (default UTC).
//   DATA_DIR           where releases/, current and source.json live (default /srv/site). Must be writable.
//   SITE_PORT          where the site and the viewer are served (default 8787).
//   WRANGLER_PORT      where wrangler listens behind the proxy, on loopback (default 8788).
//   CONTROL_PORT       where the control routes and GET /healthz listen (default 8080). Never route this publicly.
//   DEBOUNCE_MS        how long to wait after a request before building, so a publish transaction has committed and close requests coalesce (default 5000).
//   KEEP_RELEASES      how many releases to keep (default 3).
//   RELAY_WAIT_MS      how long a build waits for the staging relay to reach a published version before it fails (default 180000).
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CODES, CONTROL_ROUTES, COLLECTIONS, HANDLERS, PHASES, SOURCES as SOURCE_NAMES, TRIGGERS, bound, m, onScrape, render, statusClass } from './metrics.mjs';

const APP_DIR = process.env.APP_DIR ?? '/app';
const RELEASE_DIR = process.env.RELEASE_DIR ?? '/release';
const DATA_DIR = process.env.DATA_DIR ?? '/srv/site';
const SITE_PORT = process.env.SITE_PORT ?? '8787';
const WRANGLER_PORT = process.env.WRANGLER_PORT ?? '8788';
const VIEWER_FILE = process.env.VIEWER_FILE ?? path.join(APP_DIR, 'deploy/staging-image/viewer/index.html');
const HEARTBEAT_MS = 25_000;
let viewers = 0;
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
const RELEASE_TAG = process.env.RELEASE_TAG ?? '';
const RELEASE_SHA = process.env.RELEASE_SHA ?? '';
const LOG_LINES = 200;
const WRANGLER_READY_MS = 30_000;

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

// The code trees a build can run in. `release` exists only when the image carries one.
const TREES = {
  main: { dir: APP_DIR, sha: SHA, label: `main-${SHA.slice(0, 7)}` },
  ...(RELEASE_TAG && existsSync(path.join(RELEASE_DIR, 'package.json')) ? { release: { dir: RELEASE_DIR, sha: RELEASE_SHA, label: RELEASE_TAG } } : {}),
};

const releasesDir = path.join(DATA_DIR, 'releases');
const currentLink = path.join(DATA_DIR, 'current');
const sourceFile = path.join(DATA_DIR, 'source.json');
const log = (msg) => {
  console.log(`[supervisor] ${new Date().toISOString()} ${msg}`);
  emitLog(`[supervisor] ${msg}`);
};

const isUsable = (name) => name in SOURCES && Boolean(SOURCES[name].url);
const state = { selected: 'staging', code: 'main', built: null, builtCode: null, release: null, phase: 'idle', serving: null, building: false, queued: null, lastBuild: null, lastOk: null };
// What the viewer subscribes to: `phase`, `log` and `done` events, and the recent output for a late subscriber.
export const bus = new EventEmitter();
const recentLog = [];
// Why the next build was asked for: one entry per request since the last build started.
let pendingTriggers = [];
let debounceTimer = null;
// A one-off source asked for by the latest request, or null to use the selected one.
let pendingOverride = null;
// Relay versions the staging publishes since the last build said they pushed, per collection: the build waits for the newest.
const pendingGates = new Map();
let wrangler = null;
let stopping = false;

function emitLog(line) {
  recentLog.push(line);
  if (recentLog.length > LOG_LINES) recentLog.shift();
  bus.emit('log', line);
}

function setPhase(phase) {
  state.phase = phase;
  bus.emit('phase', phase);
}

// Tee a stream to the container's own output and to the viewer, a line at a time.
function tee(stream, sink) {
  let rest = '';
  stream.on('data', (chunk) => {
    sink.write(chunk);
    const lines = (rest + chunk).split('\n');
    rest = lines.pop();
    for (const line of lines) if (line.trim()) emitLog(line.replace(/\x1b\[[0-9;]*m/g, ''));
  });
  stream.on('end', () => rest.trim() && emitLog(rest));
}

function run(cmd, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    tee(child.stdout, process.stdout);
    tee(child.stderr, process.stderr);
    child.on('error', reject);
    child.on('exit', (code, signal) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code ?? signal}`))));
  });
}

// The selected source outlives a restart. An unreadable or unusable value falls back to staging.
async function loadSelected() {
  const chosen = { selected: 'staging', code: 'main' };
  try {
    const { source, code } = JSON.parse(await readFile(sourceFile, 'utf8'));
    if (isUsable(source)) chosen.selected = source;
    else log(`stored source ${JSON.stringify(source)} is not usable; using staging`);
    // A file from before code trees has no `code`.
    if (code && code in TREES) chosen.code = code;
    else if (code) log(`stored code ${JSON.stringify(code)} is not available; using main`);
  } catch (err) {
    if (err.code !== 'ENOENT') log(`could not read ${sourceFile} (${err.message}); using staging and main`);
  }
  return chosen;
}

async function saveSelected() {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${sourceFile}.tmp`;
  await writeFile(tmp, `${JSON.stringify({ source: state.selected, code: state.code, changedAt: new Date().toISOString() })}\n`);
  await rename(tmp, sourceFile);
}

async function writeBuildInfo(stamp, source, tree) {
  const version = tree.label;
  const buildDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIMEZONE });
  const info = {
    commit: tree.sha,
    buildId: stamp,
    buildDate,
    version,
    buildName: 'Staging builder',
    siteTitle: `Edward Jensen [STAGING · ${version} · ${source}]`,
  };
  const body = `// Auto-generated by the staging builder. Do not edit manually.\nexport const buildInfo = ${JSON.stringify(info, null, 2)} as const;\n`;
  await writeFile(path.join(tree.dir, 'src/data/buildinfo.ts'), body);
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

async function build(source, code) {
  const tree = TREES[code];
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const name = `${stamp}-${tree.sha.slice(0, 7)}`;
  const staging = path.join(releasesDir, `.${name}.tmp`);
  const startedAt = Date.now();
  log(`build ${name} starting (${code} code, ${source} content)`);
  setPhase('building');
  await writeBuildInfo(stamp, source, tree);
  await rm(path.join(tree.dir, 'dist'), { recursive: true, force: true });
  await run('npm', ['run', 'build'], {
    cwd: tree.dir,
    env: { ...process.env, CONTENT_RELAY_URL: SOURCES[source].url, CONTENT_RELAY_READ_KEY: SOURCES[source].key },
  });
  setPhase('publishing');
  await mkdir(releasesDir, { recursive: true });
  await rm(staging, { recursive: true, force: true });
  await cp(path.join(tree.dir, 'dist'), staging, { recursive: true });
  // What the viewer shows about the release that is serving, and which tree's wrangler must run it.
  await writeFile(path.join(staging, 'release.json'), `${JSON.stringify({ code, label: tree.label, sha: tree.sha, source, builtAt: new Date().toISOString(), durationMs: Date.now() - startedAt })}\n`);
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

// The tree that built the current release, from its release.json (the newest in a folder that predates it is main).
async function currentInfo() {
  try {
    return JSON.parse(await readFile(path.join(currentLink, 'release.json'), 'utf8'));
  } catch {
    return null;
  }
}

async function startWrangler() {
  if (stopping) return;
  const config = path.join(currentLink, 'server/wrangler.json');
  const info = await currentInfo();
  const tree = TREES[info?.code] ?? TREES.main;
  wrangler = spawn(
    path.join(tree.dir, 'node_modules/.bin/wrangler'),
    ['dev', `--config=${config}`, '--local', '--ip=127.0.0.1', `--port=${WRANGLER_PORT}`, `--persist-to=${path.join(DATA_DIR, 'wrangler-state')}`, '--show-interactive-dev-session=false', '--live-reload=false', '--log-level=warn'],
    { cwd: path.join(currentLink, 'server'), stdio: 'inherit', env: { ...process.env, WRANGLER_SEND_METRICS: 'false', CI: 'true' } },
  );
  const mine = wrangler;
  mine.on('exit', (code, signal) => {
    if (wrangler === mine) wrangler = null;
    if (!stopping && signal !== 'SIGTERM') m.wranglerExits.inc();
    if (!stopping && signal !== 'SIGTERM') log(`wrangler exited ${code ?? signal}; the next build restarts it`);
  });
}

// Resolves once the site answers on its port (any response will do), so a viewer that reloads on `done` never meets a dead server.
async function waitForSite() {
  const deadline = Date.now() + WRANGLER_READY_MS;
  while (Date.now() < deadline) {
    try {
      await fetch(`http://127.0.0.1:${WRANGLER_PORT}/`, { signal: AbortSignal.timeout(2_000) });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  log(`the site did not answer on ${WRANGLER_PORT} within ${WRANGLER_READY_MS / 1000}s`);
  return false;
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
    // Nothing is lost: the override, the relay gates and the triggers stay pending, and a build follows this one.
    state.queued = { override: pendingOverride };
    return;
  }
  const override = pendingOverride;
  const source = override ?? state.selected;
  const code = state.code;
  const triggers = pendingTriggers.length ? pendingTriggers : [{ kind: 'manual' }];
  pendingTriggers = [];
  // Take the versions published so far: ones that arrive during this build belong to the next one.
  const gates = new Map(pendingGates);
  pendingGates.clear();
  state.building = true;
  state.lastBuild = { startedAt: new Date().toISOString(), source, code, override, trigger: triggers[0], triggers, ok: null };
  const startedAt = Date.now();
  try {
    // Only the staging relay is waited for: a staging publish says nothing about the production relay's versions.
    if (source === 'staging' && SOURCES.staging.relay && gates.size) {
      state.lastBuild.waitedFor = Object.fromEntries(gates);
      setPhase('waiting-for-relay');
      const waitStarted = Date.now();
      try {
        await waitForRelay('staging', gates);
      } finally {
        m.relayWait.observe({}, (Date.now() - waitStarted) / 1000);
      }
    }
    state.release = await build(source, code);
    state.built = source;
    state.builtCode = code;
    state.serving = await currentInfo();
    setPhase('restarting');
    await stopWrangler();
    await startWrangler();
    await waitForSite();
    state.lastBuild.ok = true;
    state.lastOk = new Date().toISOString();
    m.builds.inc({ code, source, result: 'ok' });
    m.buildDuration.observe({ code, source }, (Date.now() - startedAt) / 1000);
  } catch (err) {
    state.lastBuild.ok = false;
    state.lastBuild.error = String(err.message ?? err);
    m.builds.inc({ code, source, result: 'failed' });
    m.buildFailures.inc({ reason: /did not reach/.test(state.lastBuild.error) ? 'relay_timeout' : /exited/.test(state.lastBuild.error) ? 'build_failed' : 'other' });
    log(`build failed: ${state.lastBuild.error}; ${existsSync(currentLink) ? 'the last good release keeps serving' : 'nothing is serving yet, retrying'}`);
    // With nothing to serve yet, keep trying: a relay that was not reachable when this started will be soon.
    if (!existsSync(currentLink)) setTimeout(() => request(state.lastBuild?.override ?? null, { kind: 'retry' }), RETRY_FIRST_BUILD_MS).unref();
  } finally {
    state.lastBuild.finishedAt = new Date().toISOString();
    state.lastBuild.durationMs = Date.now() - startedAt;
    state.building = false;
    setPhase('idle');
    bus.emit('done', { ok: state.lastBuild.ok, error: state.lastBuild.error ?? null });
    if (state.queued) {
      const next = state.queued;
      state.queued = null;
      request(next.override);
    }
  }
}

// Requests close together share one build; the wait also lets the publish that asked commit first.
function request(override = null, trigger = null) {
  pendingOverride = override;
  if (trigger) {
    pendingTriggers.push(trigger);
    m.buildRequests.inc({ trigger: bound(trigger.kind, TRIGGERS) });
  }
  if (state.phase === 'idle') setPhase('requested');
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
  if (body.client_payload) m.cmsPushes.inc({ collection: bound(collection, COLLECTIONS) });
  if (typeof collection === 'string' && typeof version === 'string' && (pendingGates.get(collection) ?? '') < version) pendingGates.set(collection, version);
  log(`build requested (${override ? `one-off ${override}` : `selected ${state.selected}`}${collection ? `, ${collection} ${version ?? 'no version'}` : ''})`);
  // A body with a client_payload is the CMS announcing a publish; a bare request is someone asking for a rebuild.
  const trigger = body.client_payload ? { kind: 'cms', collection: collection ?? null, action: body.action ?? null } : { kind: body.trigger === 'viewer' ? 'viewer' : 'manual' };
  request(override, trigger);
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
  await saveSelected();
  log(`source is now ${body.source}`);
  request(null, { kind: 'selection', source: body.source });
  return send(202, { accepted: true, source: body.source, building: state.building });
}

const codeProblem = (code) => (!(code in TREES) ? `code must be one of: ${Object.keys(TREES).join(', ')}` : null);

// Applies a new selection of code and/or source (either may be omitted), keeps it, and builds from it.
export async function select({ code, source }) {
  if (code !== undefined && codeProblem(code)) return { error: codeProblem(code) };
  if (source !== undefined && sourceProblem(source)) return { error: sourceProblem(source) };
  if (code !== undefined) state.code = code;
  if (source !== undefined) state.selected = source;
  await saveSelected();
  log(`selection is now ${state.code} code, ${state.selected} content`);
  request(null, { kind: 'selection', code: state.code, source: state.selected });
  return { accepted: true, code: state.code, source: state.selected, building: state.building };
}

// POST /select: {code?, source?}.
async function selectedBoth(req, send) {
  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(400, { error: 'Body must be JSON like {"code":"release","source":"production"}' });
  }
  const result = await select(body);
  return result.error ? send(400, result) : send(202, result);
}

// The same snapshot for the control port and the viewer. `serving` is read from the release folder itself, so it is right after a restart too.
export function status() {
  return {
    ...state,
    sha: SHA,
    pending: pendingTriggers,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([name, s]) => [name, { configured: Boolean(s.url), relay: s.relay }])),
    trees: Object.fromEntries(Object.entries(TREES).map(([name, t]) => [name, { label: t.label, sha: t.sha }])),
  };
}

const server = createServer((req, res) => {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const route = `${req.method} ${req.url?.split('?')[0]}`;
  res.on('close', () => m.controlRequests.inc({ route: bound(route.split('/')[1], CONTROL_ROUTES), code: statusClass(res.statusCode) }));
  if (route === 'GET /healthz') return send(200, { ok: true });
  if (route === 'POST /build' || route === 'POST /source' || route === 'POST /select' || route === 'GET /status') {
    if (!authorised(req)) return send(401, { error: 'Bearer token required' });
    if (route === 'GET /status') return send(200, status());
    const handler = route === 'POST /build' ? requestedBuild : route === 'POST /select' ? selectedBoth : selectedSource;
    return handler(req, send).catch((err) => {
      log(`${route} failed: ${err.message ?? err}`);
      send(500, { error: 'Request failed' });
    });
  }
  return send(404, { error: 'Not found' });
});
server.listen(CONTROL_PORT, '0.0.0.0', () => log(`control listening on ${CONTROL_PORT}`));

// The viewer's POSTs: JSON only, and from this same origin, so another web page cannot make a visitor's browser start a rebuild or change the selection.
function sameOriginJson(req) {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return false;
  try {
    return new URL(req.headers.origin ?? '').host === req.headers.host;
  } catch {
    return false;
  }
}

const REBUILDING_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Rebuilding</title><body style="font:16px system-ui;margin:3rem 1rem;text-align:center"><p>The staging site is rebuilding. This page will refresh.</p>';

function proxyToSite(req, res) {
  const upstream = httpRequest({ host: '127.0.0.1', port: WRANGLER_PORT, method: req.method, path: req.url, headers: req.headers }, (answer) => {
    // The same URL is the viewer for a page load and the site for the viewer's frame, so caches must tell them apart.
    res.writeHead(answer.statusCode, { ...answer.headers, vary: [answer.headers.vary, 'Sec-Fetch-Dest'].filter(Boolean).join(', ') });
    answer.pipe(res);
  });
  upstream.on('error', () => {
    m.proxyUnavailable.inc();
    if (res.headersSent) return res.destroy();
    res.writeHead(503, { 'content-type': 'text/html; charset=utf-8', 'retry-after': '3' });
    res.end(REBUILDING_PAGE);
  });
  req.pipe(upstream);
}

// A stream of the viewer's events: the current status and recent output on connect, then a status on every phase change, each output line, and the end of each build.
function streamEvents(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no' });
  const write = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  write('snapshot', { status: status(), log: recentLog });
  const onPhase = () => write('status', status());
  const onLog = (line) => write('log', line);
  const onDone = (result) => write('done', { ...result, status: status() });
  bus.on('phase', onPhase).on('log', onLog).on('done', onDone);
  viewers += 1;
  const beat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(beat);
    viewers -= 1;
    bus.off('phase', onPhase).off('log', onLog).off('done', onDone);
  });
}

async function viewerApi(req, res, route) {
  const send = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (route === 'GET /_viewer/status') return send(200, status());
  if (route === 'GET /_viewer/events') return streamEvents(req, res);
  if (route !== 'POST /_viewer/select' && route !== 'POST /_viewer/rebuild') return send(404, { error: 'Not found' });
  if (!sameOriginJson(req)) return send(403, { error: 'Same-origin JSON requests only' });
  let body;
  try {
    body = await readJson(req);
  } catch {
    return send(400, { error: 'Body must be JSON' });
  }
  if (route === 'POST /_viewer/rebuild') {
    log('rebuild requested from the viewer');
    request(null, { kind: 'viewer' });
    return send(202, { accepted: true });
  }
  const result = await select({ code: body.code, source: body.source });
  return result.error ? send(400, result) : send(202, result);
}

// The front door: the viewer, its API, and the site behind them.
// A browser opening a page on its own, as opposed to the viewer's frame, a feed reader, an asset or curl.
const opensPage = (req) => ['GET', 'HEAD'].includes(req.method) && req.headers['sec-fetch-dest'] === 'document' && /text\/html/.test(req.headers.accept ?? '') && !/[?&]__raw=1(&|$)/.test(req.url ?? '');

const handlerOf = (req, pathname) => {
  if (pathname === '/metrics') return 'metrics';
  if (pathname.startsWith('/_viewer/')) return bound(`api_${pathname.slice('/_viewer/'.length)}`, HANDLERS);
  return opensPage(req) ? 'viewer' : 'site';
};

const front = createServer((req, res) => {
  const pathname = req.url?.split('?')[0] ?? '/';
  res.on('close', () => m.proxyRequests.inc({ handler: handlerOf(req, pathname), code: statusClass(res.statusCode) }));
  if (pathname === '/metrics' && req.method === 'GET') {
    return render().then(
      (text) => {
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store' });
        res.end(text);
      },
      (err) => {
        log(`metrics failed: ${err.message ?? err}`);
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('metrics unavailable\n');
      },
    );
  }
  if (pathname.startsWith('/_viewer/')) {
    return viewerApi(req, res, `${req.method} ${pathname}`).catch((err) => {
      log(`viewer ${req.method} ${pathname} failed: ${err.message ?? err}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request failed' }));
    });
  }
  if (opensPage(req)) {
    return readFile(VIEWER_FILE).then(
      (html) => {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', vary: 'Sec-Fetch-Dest' });
        res.end(req.method === 'HEAD' ? undefined : html);
      },
      () => {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end('The viewer page is missing from this image.');
      },
    );
  }
  return proxyToSite(req, res);
});
front.listen(Number(SITE_PORT), '0.0.0.0', () => log(`site and viewer on ${SITE_PORT}; wrangler behind it on ${WRANGLER_PORT}`));

// What the metrics read at each scrape: the present-tense gauges, refreshed from state, the site's port and the container's cgroup.
const oneHot = (gauge, label, names, current) => {
  gauge.clear();
  for (const name of names) gauge.set({ [label]: name }, name === current ? 1 : 0);
};
let siteProbe = { at: 0, up: 0 };
const cgroup = async (file) => {
  try {
    const raw = (await readFile(`/sys/fs/cgroup/${file}`, 'utf8')).trim();
    return raw === 'max' ? null : Number(raw);
  } catch {
    return null;
  }
};
m.info.set({ version: TREES.main.label, commit: SHA.slice(0, 7), release_tag: RELEASE_TAG, release_commit: RELEASE_SHA.slice(0, 7), node: process.version }, 1);
onScrape(async () => {
  oneHot(m.buildPhase, 'phase', PHASES, state.phase);
  m.queued.set({}, state.queued ? 1 : 0);
  oneHot(m.selectedCode, 'code', CODES, state.code);
  oneHot(m.selectedSource, 'source', SOURCE_NAMES, state.selected);
  oneHot(m.servingCode, 'code', CODES, state.serving?.code);
  oneHot(m.servingSource, 'source', SOURCE_NAMES, state.serving?.source);
  m.releaseBuilt.clear();
  if (state.serving?.builtAt) m.releaseBuilt.set({}, Date.parse(state.serving.builtAt) / 1000);
  m.lastBuildSuccess.clear();
  m.lastBuildFinished.clear();
  m.lastBuildSuccessTime.clear();
  if (state.lastBuild?.finishedAt) {
    m.lastBuildSuccess.set({}, state.lastBuild.ok ? 1 : 0);
    m.lastBuildFinished.set({}, Date.parse(state.lastBuild.finishedAt) / 1000);
  }
  if (state.lastOk) m.lastBuildSuccessTime.set({}, Date.parse(state.lastOk) / 1000);
  m.viewers.set({}, viewers);
  m.taskUp.set({ task: 'wrangler' }, wrangler ? 1 : 0);
  m.taskUp.set({ task: 'supervisor' }, 1);
  // The probe is cached for a few seconds so a burst of scrapes makes one request.
  if (Date.now() - siteProbe.at > 5_000) {
    siteProbe = { at: Date.now(), up: await fetch(`http://127.0.0.1:${WRANGLER_PORT}/`, { signal: AbortSignal.timeout(2_000) }).then(() => 1, () => 0) };
  }
  m.siteUp.set({}, siteProbe.up);
  for (const [gauge, file] of [[m.memoryPeak, 'memory.peak'], [m.memoryLimit, 'memory.max'], [m.memoryCurrent, 'memory.current']]) {
    gauge.clear();
    const value = await cgroup(file);
    if (value !== null) gauge.set({}, value);
  }
});

Object.assign(state, await loadSelected());
log(`source: ${state.selected} (${SOURCES[state.selected].relay ? 'relay' : 'legacy direct CMS'}), code: ${state.code}`);
// What is already serving, so a restart reports it before the start-up build finishes.
{
  const info = await currentInfo();
  if (info) Object.assign(state, { serving: info, built: info.source, builtCode: info.code, release: path.basename(await readlink(currentLink).catch(() => '')) || null });
}

// Serve what is already there, if anything, while the start-up build runs: a restart should not take the site down.
if (existsSync(currentLink)) await startWrangler();
request(null, { kind: 'startup' });

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    stopping = true;
    front.close();
    await stopWrangler();
    process.exit(0);
  });
}
