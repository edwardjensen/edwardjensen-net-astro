// Prometheus metrics for the staging builder, in the text exposition format, with no dependencies. Every metric object lives here and the supervisor imports it; nothing else creates its own.
//
// Conventions: the `ejnet_staging_` prefix, `_total` on counters, `_seconds` / `_bytes` for units, an `_info` gauge fixed at 1 for the build, `background_task_up{task}` for things that run on their own, and label values bounded by this file, never by a request: the lists below are the only values a label can take, and anything else is folded into `other`. Counters over a known set of label values are created at zero so the series exists before the first event, and gauges that describe the present are refreshed at scrape time by the collector the supervisor registers (`onScrape`).
const PREFIX = 'ejnet_staging_';

// The only values a label may take.
export const TRIGGERS = ['cms', 'selection', 'viewer', 'manual', 'startup', 'retry'];
export const COLLECTIONS = ['posts', 'working-notes', 'photography', 'historic-posts', 'pages', 'hi-events'];
export const PHASES = ['idle', 'requested', 'waiting-for-relay', 'building', 'publishing', 'restarting'];
export const SOURCES = ['staging', 'production'];
export const CODES = ['main', 'release'];
export const FAILURE_REASONS = ['relay_timeout', 'build_failed', 'other'];
export const HANDLERS = ['site', 'viewer', 'api_status', 'api_events', 'api_select', 'api_rebuild', 'metrics', 'other'];
export const CONTROL_ROUTES = ['build', 'source', 'select', 'status', 'healthz', 'other'];
const STATUS_CLASSES = ['2xx', '3xx', '4xx', '5xx'];

export const bound = (value, allowed) => (allowed.includes(value) ? value : 'other');
export const statusClass = (code) => `${Math.floor(code / 100)}xx`;

const escapeValue = (v) => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const labelText = (labels) => {
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${escapeValue(v)}"`);
  return pairs.length ? `{${pairs.join(',')}}` : '';
};
// A series key that is stable whatever order the labels were given in.
const keyOf = (labels) => JSON.stringify(Object.entries(labels).sort(([a], [b]) => (a < b ? -1 : 1)));
const family = [];

function define(type, name, help) {
  const f = { type, name: PREFIX + name, help, series: new Map() };
  family.push(f);
  return f;
}

function counter(name, help, seed = []) {
  const f = define('counter', name, help);
  const api = {
    inc(labels = {}, by = 1) {
      const key = keyOf(labels);
      const entry = f.series.get(key) ?? { labels, value: 0 };
      entry.value += by;
      f.series.set(key, entry);
    },
  };
  for (const labels of seed) api.inc(labels, 0);
  return api;
}

function gauge(name, help) {
  const f = define('gauge', name, help);
  return {
    set(labels, value) {
      f.series.set(keyOf(labels), { labels, value });
    },
    // For gauges that describe the present: drop the old series before writing the new ones.
    clear: () => f.series.clear(),
    inc(labels = {}, by = 1) {
      const key = keyOf(labels);
      const entry = f.series.get(key) ?? { labels, value: 0 };
      entry.value += by;
      f.series.set(key, entry);
    },
  };
}

function histogram(name, help, buckets, seed = []) {
  const f = define('histogram', name, help);
  f.buckets = buckets;
  const api = {
    observe(labels, seconds) {
      const key = keyOf(labels);
      const entry = f.series.get(key) ?? { labels, counts: buckets.map(() => 0), sum: 0, count: 0 };
      buckets.forEach((le, i) => {
        if (seconds <= le) entry.counts[i] += 1;
      });
      entry.sum += seconds;
      entry.count += 1;
      f.series.set(key, entry);
    },
  };
  for (const labels of seed) f.series.set(keyOf(labels), { labels, counts: buckets.map(() => 0), sum: 0, count: 0 });
  return api;
}

const product = (...lists) => lists.reduce((rows, list) => rows.flatMap((row) => list.map((item) => [...row, item])), [[]]);

// Builds take seconds to a few minutes; the relay wait is capped at three minutes.
const BUILD_BUCKETS = [5, 10, 20, 30, 60, 120, 300, 600];
const WAIT_BUCKETS = [1, 5, 10, 30, 60, 120, 180];

export const m = {
  info: gauge('info', 'The image this builder runs: the main commit, the release tag it carries and the Node version. Always 1.'),
  buildRequests: counter('build_requests_total', 'Requests for a rebuild, by why they were made. Requests close together share one build, so this can exceed builds.', TRIGGERS.map((trigger) => ({ trigger }))),
  cmsPushes: counter('cms_pushes_total', 'Publishes the CMS announced on the control port, by collection.', [...COLLECTIONS, 'other'].map((collection) => ({ collection }))),
  builds: counter('builds_total', 'Builds finished, by the code tree and content source they used and how they ended.', product(CODES, SOURCES, ['ok', 'failed']).map(([code, source, result]) => ({ code, source, result }))),
  buildFailures: counter('build_failures_total', 'Failed builds by cause. The last good release keeps serving after each.', FAILURE_REASONS.map((reason) => ({ reason }))),
  buildDuration: histogram('build_duration_seconds', 'How long a build took, from the end of the debounce to the site answering again, for builds that succeeded.', BUILD_BUCKETS, product(CODES, SOURCES).map(([code, source]) => ({ code, source }))),
  relayWait: histogram('relay_wait_seconds', 'How long a build waited for the staging relay to reach the version a publish pushed (the freshness gate).', WAIT_BUCKETS, [{}]),
  wranglerExits: counter('wrangler_unexpected_exits_total', 'Times the server that runs the site exited on its own rather than being restarted for a new release.', [{}]),
  proxyRequests: counter('proxy_requests_total', 'Requests to the site port, by what handled them and the class of the answer.', product(HANDLERS, STATUS_CLASSES).map(([handler, code]) => ({ handler, code }))),
  proxyUnavailable: counter('proxy_unavailable_total', 'Requests answered with the rebuilding page because the site server was down.', [{}]),
  controlRequests: counter('control_requests_total', 'Requests to the control port, by route and the class of the answer.', product(CONTROL_ROUTES, STATUS_CLASSES).map(([route, code]) => ({ route, code }))),
  buildPhase: gauge('build_phase', 'The phase the builder is in: 1 for the current one, 0 for the rest.'),
  queued: gauge('build_queued', '1 when a request that arrived during a build is waiting for the next one.'),
  selectedCode: gauge('selected_code', 'The code tree selected for builds (sticky): 1 for the selection.'),
  selectedSource: gauge('selected_source', 'The content source selected for builds (sticky): 1 for the selection.'),
  servingCode: gauge('serving_code', 'The code tree the serving release was built from: 1 for it.'),
  servingSource: gauge('serving_source', 'The content source the serving release was built from: 1 for it.'),
  releaseBuilt: gauge('release_built_timestamp_seconds', 'When the release that is serving was built.'),
  lastBuildSuccess: gauge('last_build_success', '1 if the last build succeeded, 0 if it failed. Absent until one has finished.'),
  lastBuildFinished: gauge('last_build_finished_timestamp_seconds', 'When the last build finished, succeeded or not.'),
  lastBuildSuccessTime: gauge('last_build_success_timestamp_seconds', 'When the last successful build finished.'),
  siteUp: gauge('site_up', '1 if the site server answers on its port, as probed at scrape time.'),
  taskUp: gauge('background_task_up', '1 while a background task is running.'),
  viewers: gauge('viewers', 'Browsers connected to the viewer\'s event stream. A count only.'),
  memoryPeak: gauge('container_memory_peak_bytes', 'The most memory the container has used, from its cgroup (builds are the peaks). Absent where the cgroup does not report it.'),
  memoryLimit: gauge('container_memory_limit_bytes', 'The container\'s memory limit, from its cgroup. Absent when there is none.'),
  memoryCurrent: gauge('container_memory_bytes', 'The memory the container uses now, from its cgroup.'),
};

// Standard process metrics, under the names Prometheus clients use.
const startedAt = Date.now() / 1000;
function processLines() {
  const cpu = process.cpuUsage();
  return [
    ['process_cpu_seconds_total', 'counter', 'Total user and system CPU time spent in seconds.', (cpu.user + cpu.system) / 1e6],
    ['process_resident_memory_bytes', 'gauge', 'Resident memory size in bytes.', process.memoryUsage().rss],
    ['process_start_time_seconds', 'gauge', 'Start time of the process since the Unix epoch in seconds.', startedAt],
  ].flatMap(([name, type, help, value]) => [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name} ${value}`]);
}

const number = (v) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(6))));

let collector = async () => {};
// The supervisor registers what refreshes the present-tense gauges; it runs at each scrape.
export const onScrape = (fn) => {
  collector = fn;
};

export async function render() {
  await collector();
  const out = [];
  for (const f of family) {
    if (!f.series.size && f.type !== 'histogram') continue;
    out.push(`# HELP ${f.name} ${f.help}`, `# TYPE ${f.name} ${f.type}`);
    for (const { labels, value, counts, sum, count } of f.series.values()) {
      if (f.type === 'histogram') {
        f.buckets.forEach((le, i) => out.push(`${f.name}_bucket${labelText({ ...labels, le })} ${counts[i]}`));
        out.push(`${f.name}_bucket${labelText({ ...labels, le: '+Inf' })} ${count}`, `${f.name}_sum${labelText(labels)} ${number(sum)}`, `${f.name}_count${labelText(labels)} ${count}`);
      } else {
        out.push(`${f.name}${labelText(labels)} ${number(value)}`);
      }
    }
  }
  return `${[...out, ...processLines()].join('\n')}\n`;
}
