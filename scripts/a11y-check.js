#!/usr/bin/env node
// Accessibility check script using pa11y
// Runs WCAG 2.1 AA checks against the dev server (or specified base URL)
// Any violation exits with code 1 (zero-threshold enforcement)

import pa11y from "pa11y";

const BASE_URL = process.env.A11Y_BASE_URL ?? "http://localhost:4321";
const REPORT = process.argv.includes("--report");

// Phase 1: only the placeholder index exists.
// Add URLs here as page types are implemented in Phase 2+.
const URLS = ["/"];

const pa11yOptions = {
  standard: "WCAG2AA",
  chromeLaunchConfig: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
};

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

if (failed) {
  console.error("\nAccessibility checks failed.\n");
  process.exit(1);
} else {
  console.log("\nAll accessibility checks passed.\n");
}
