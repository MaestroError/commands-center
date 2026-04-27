import { build } from "esbuild";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliDir = resolve(root, "packages/cli");
const frontendDir = resolve(root, "packages/frontend");
const backendDir = resolve(root, "packages/backend");

console.log("Building frontend...");
execSync("pnpm --filter @cc/frontend build", { cwd: root, stdio: "inherit" });

console.log("Bundling CLI...");
await build({
  entryPoints: [resolve(cliDir, "src/bin.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: resolve(cliDir, "dist/bin.mjs"),
  external: ["better-sqlite3", "pino-pretty", "fsevents"],
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  sourcemap: true,
  minify: false,
  logLevel: "info",
});

console.log("Copying frontend assets...");
const publicDir = resolve(cliDir, "dist/public");
mkdirSync(publicDir, { recursive: true });
cpSync(resolve(frontendDir, "dist"), publicDir, { recursive: true });

console.log("Copying backend resources...");
const resourcesDir = resolve(cliDir, "dist/resources");
mkdirSync(resourcesDir, { recursive: true });
cpSync(resolve(backendDir, "resources"), resourcesDir, { recursive: true });

console.log("Copying database migrations...");
const migrationsDir = resolve(cliDir, "dist/migrations");
mkdirSync(migrationsDir, { recursive: true });
cpSync(resolve(backendDir, "src/db/migrations"), migrationsDir, { recursive: true });

console.log("CLI build complete → packages/cli/dist/");
