#!/usr/bin/env node
// Guards against the Node-version drift that caused a production outage: the
// runtime we publish/test/build on (engines, Dockerfile, CI) must match the one
// the installer provisions. `.nvmrc` is the single source of truth; every other
// consumer is asserted against it. If any diverge, CI fails with the offenders
// named.
//
// Run: node scripts/check-node-version-consistency.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(repoRoot, rel), "utf8");

// Canonical major lives in .nvmrc (e.g. "24" or "24.1.0" -> 24).
const expectedMajor = Number.parseInt(read(".nvmrc").trim(), 10);
if (!Number.isInteger(expectedMajor)) {
  console.error(`Error: .nvmrc does not contain a valid Node major: "${read(".nvmrc").trim()}"`);
  process.exit(1);
}

const problems = [];

// Compares an extracted major against the canonical one.
function expect(label, file, actualMajor) {
  if (actualMajor === null || Number.isNaN(actualMajor)) {
    problems.push(`${label} (${file}): could not determine a Node major`);
    return;
  }
  if (actualMajor !== expectedMajor) {
    problems.push(`${label} (${file}): Node ${actualMajor}, expected ${expectedMajor}`);
  }
}

// engines.node like ">=24.0.0" -> 24
function enginesMajor(rel) {
  const pkg = JSON.parse(read(rel));
  const spec = pkg.engines?.node;
  if (typeof spec !== "string") return null;
  const m = spec.match(/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

// All matches of a regex's first capture group must agree; returns that major
// or null. `label` is used to report internal disagreement (e.g. CI jobs that
// differ from each other).
function singleMajorFromMatches(label, file, content, regex) {
  const majors = [...content.matchAll(regex)].map((m) => Number.parseInt(m[1], 10));
  if (majors.length === 0) return null;
  const unique = [...new Set(majors)];
  if (unique.length > 1) {
    problems.push(`${label} (${file}): mixed Node majors ${unique.join(", ")} — must all match`);
    return null;
  }
  return unique[0];
}

expect("root engines.node", "package.json", enginesMajor("package.json"));
expect("cli engines.node", "packages/cli/package.json", enginesMajor("packages/cli/package.json"));

// Dockerfile: FROM node:24-bookworm-slim
expect(
  "Dockerfile base image",
  "Dockerfile",
  singleMajorFromMatches(
    "Dockerfile base image",
    "Dockerfile",
    read("Dockerfile"),
    /^FROM\s+node:(\d+)/gm,
  ),
);

// Workflows: `node-version: 24`
for (const wf of [".github/workflows/ci.yml", ".github/workflows/publish.yml"]) {
  expect(
    `workflow ${wf}`,
    wf,
    singleMajorFromMatches(`workflow ${wf}`, wf, read(wf), /node-version:\s*['"]?(\d+)/g),
  );
}

// Installer default: NODE_MAJOR="${CCENTER_NODE_MAJOR:-24}"
expect(
  "installer NODE_MAJOR default",
  "scripts/install-ccenter-service.sh",
  singleMajorFromMatches(
    "installer NODE_MAJOR default",
    "scripts/install-ccenter-service.sh",
    read("scripts/install-ccenter-service.sh"),
    /NODE_MAJOR="\$\{CCENTER_NODE_MAJOR:-(\d+)\}"/g,
  ),
);

if (problems.length > 0) {
  console.error(`Node version drift detected (canonical major from .nvmrc = ${expectedMajor}):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    "\nAll consumers must agree. Update the offending file(s) or .nvmrc so the Node major matches everywhere.",
  );
  process.exit(1);
}

console.log(`Node version consistency OK — all consumers target Node ${expectedMajor}.`);
