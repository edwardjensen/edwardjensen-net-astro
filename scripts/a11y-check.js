#!/usr/bin/env node
// Accessibility check script using pa11y
// Runs WCAG 2.1 AA checks against the dev server (or specified base URL)
// Any violation exits with code 1 (zero-threshold enforcement)
// If no server is running at BASE_URL, astro dev is started automatically.

import pa11y from "pa11y";
import { spawn } from "child_process";
import urlList from "../src/data/a11y-urls.json" with { type: "json" };

const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4321";
const REPORT = process.argv.includes("--report");

// URLs to check — edit src/data/a11y-urls.json to add or remove paths.
const URLS = urlList;

const pa11yOptions = {
  standard: "WCAG2AA",
  chromeLaunchConfig: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
};

async function waitForServer(url, maxAttempts = 30, delayMs = 1000) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// Check if a server is already running; if not, start astro dev.
let devServer = null;
let serverRunning = false;
try {
  const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
  if (res.status < 500) serverRunning = true;
} catch {
  // not running
}

if (!serverRunning) {
  console.log(`No server at ${BASE_URL}. Starting astro dev...\n`);
  devServer = spawn("node_modules/.bin/astro", ["dev"], {
    stdio: "ignore",
  });
  devServer.on("error", (err) => {
    console.error(`Failed to start astro dev: ${err.message}`);
    process.exit(1);
  });
  const ready = await waitForServer(BASE_URL);
  if (!ready) {
    devServer.kill();
    console.error("Dev server did not become ready within 30 seconds.");
    process.exit(1);
  }
}

let failed = false;

console.log(`\nRunning accessibility checks against ${BASE_URL}\n`);

for (const path of URLS) {
  const url = `${BASE_URL}${path}`;
  try {
    const result = await pa11y(url, pa11yOptions);
    if (result.issues.length > 0) {
      console.error(`\n✗ ${url} — ${result.issues.length} issue(s):`);
      for (const issue of result.issues) {
        console.error(`  [${issue.type.toUpperCase()}] ${issue.message}`);
        console.error(`  Selector: ${issue.selector}`);
      }
      if (REPORT) {
        console.log(JSON.stringify(result, null, 2));
      }
      failed = true;
    } else {
      console.log(`  ✓ ${url}`);
    }
  } catch (err) {
    console.error(`\n✗ ${url} — Error running check: ${err.message}`);
    failed = true;
  }
}

if (devServer) {
  devServer.kill();
}

if (failed) {
  console.error("\nAccessibility checks failed.\n");
  process.exit(1);
} else {
  console.log("\nAll accessibility checks passed.\n");
}
