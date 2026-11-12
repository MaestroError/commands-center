#!/usr/bin/env node
// Guards against the Node-version drift that caused a production outage: the
// runtime we publish/test/build on (engines, Dockerfile, CI) must match the one
// the installer provisions. `.nvmrc` is the single source of truth; every other
// consumer is asserted against it. If any diverge, CI fails with the offenders
// named.
//
// Run: node scripts/check-node-version-consistency.mjs

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(repoRoot, rel), "utf8");

const version = read(".nvmrc").trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(".nvmrc must contain an exact Node version");
const major = version.split(".")[0];
const problems = [];
function check(file, actual, expected) {
  if (actual !== expected) problems.push(`${file}: expected ${expected}, found ${actual}`);
}

for (const file of ["package.json", "packages/cli/package.json"]) {
  check(file, JSON.parse(read(file)).engines?.node, `>=${version}`);
}
for (const file of ["Dockerfile", "Dockerfile.full"]) {
  check(file, read(file).match(/^FROM node:([^-]+)/m)?.[1], version);
}
for (const name of readdirSync(resolve(repoRoot, ".github/workflows"))) {
  if (!/\.ya?ml$/.test(name)) continue;
  const file = `.github/workflows/${name}`;
  for (const match of read(file).matchAll(/node-version:\s*['"]?([^\s'"]+)/g))
    check(file, match[1], version);
}
const installer = "scripts/install-ccenter-service.sh";
check(installer, read(installer).match(/MIN_NODE_VERSION="([^"]+)"/)?.[1], version);
check(installer, read(installer).match(/CCENTER_NODE_MAJOR:-(\d+)/)?.[1], major);
check(
  ".env.prod.example",
  read(".env.prod.example").match(/^CCENTER_NODE_MAJOR=(\d+)$/m)?.[1],
  major,
);
check(
  "packages/cli/build.ts",
  read("packages/cli/build.ts").match(/target: "node(\d+)"/)?.[1],
  major,
);
if (problems.length) throw new Error(`Node version drift:\n${problems.join("\n")}`);
console.log(`Node version consistency OK: ${version}`);
