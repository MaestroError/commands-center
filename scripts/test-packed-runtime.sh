#!/usr/bin/env bash
# Pass the absolute path to a packed commandscenter tarball.
set -euo pipefail
archive="${1:?supply an absolute tarball path}"
work=$(mktemp -d)
pid=""
cleanup() {
  if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  rm -rf "$work"
}
trap cleanup EXIT
cd "$work"
npm init -y >/dev/null
npm install --engine-strict --no-audit --no-fund "$archive"
node --input-type=commonjs <<'JS'
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const cli = createRequire(require.resolve("commandscenter/package.json"));
const db = new (cli("better-sqlite3"))(":memory:");
if (db.prepare("select 1 as ok").get().ok !== 1) throw Error("SQLite query failed");
db.close();
execFileSync(cli("@vscode/ripgrep").rgPath, ["--version"], { stdio: "inherit" });
const terminal = cli("node-pty").spawn("/bin/sh", ["-c", "printf native-pty-ok"]);
let output = "";
terminal.onData(data => { output += data; });
const timeout = setTimeout(() => { terminal.kill(); throw Error("PTY timed out"); }, 10000);
terminal.onExit(() => {
  clearTimeout(timeout);
  if (!output.includes("native-pty-ok")) throw Error("PTY output missing");
});
JS
export CC_WORKSPACE_DIR="$work/workspace" CC_DATA_DIR="$work/data" CC_HOST=127.0.0.1
export CC_PORT="${CC_PORT:-47389}"
for run in 1 2; do
  ./node_modules/.bin/ccenter start --cc-env-file "$work/service.env" >server.log 2>&1 &
  pid=$!
  ready=false
  for ((i = 0; i < 60; i++)); do
    if node -e 'fetch("http://127.0.0.1:"+process.env.CC_PORT+"/api/health").then(r=>r.json()).then(h=>process.exit(h.opencode?.url==="embedded://local"?0:1)).catch(()=>process.exit(1))'; then
      ready=true; break
    fi
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if [[ "$ready" != true ]]; then tail -30 server.log; exit 1; fi
  kill -TERM "$pid"
  wait "$pid"
  pid=""
  echo "Embedded startup and shutdown $run passed"
done
