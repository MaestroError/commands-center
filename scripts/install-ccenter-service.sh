#!/usr/bin/env bash

set -euo pipefail

APP_NAME="commandscenter"
SERVICE_NAME="commandscenter"
INSTALLER_URL="https://raw.githubusercontent.com/MaestroError/commands-center/main/scripts/install-ccenter-service.sh"

# Installer-only configuration. These control how the installer behaves and
# have no CC_* runtime equivalent.
PACKAGE_SPEC="${CCENTER_PACKAGE_SPEC:-commandscenter}"
INSTALL_DIR="${CCENTER_INSTALL_DIR:-$HOME/.cc}"
ENV_FILE="${CCENTER_ENV_FILE:-$INSTALL_DIR/.env}"
PUBLIC_HOST="${CCENTER_PUBLIC_HOST:-127.0.0.1}"
NODE_MAJOR="${CCENTER_NODE_MAJOR:-24}"
SERVICE_USER="${CCENTER_SERVICE_USER:-$(id -un)}"
SERVICE_GROUP="${CCENTER_SERVICE_GROUP:-}"
CREATE_USER="${CCENTER_CREATE_USER:-false}"

# Runtime configuration passed through to the service as CC_* environment
# variables. CC_* names are preferred and match the .env file; the CCENTER_*
# equivalents remain as deprecated fallbacks. Exporting them means they are both
# injected into the service unit (see service_env_names) and read by ccenter
# when it generates the .env file on first start. Any other CC_* variable set in
# the environment (CC_PUBLIC_ORIGIN, CC_DATA_DIR, CC_LOG_LEVEL, ...) flows
# through automatically with no per-variable wiring.
export CC_HOST="${CC_HOST:-${CCENTER_HOST:-127.0.0.1}}"
export CC_PORT="${CC_PORT:-${CCENTER_PORT:-3000}}"
export CC_WORKSPACE_DIR="${CC_WORKSPACE_DIR:-${CCENTER_WORKSPACE_DIR:-$INSTALL_DIR/workspace}}"
if [[ -n "${CC_PUBLIC_ORIGIN:-${CCENTER_PUBLIC_ORIGIN:-}}" ]]; then
  export CC_PUBLIC_ORIGIN="${CC_PUBLIC_ORIGIN:-${CCENTER_PUBLIC_ORIGIN}}"
fi

# Convenience aliases used throughout the script.
HOST="$CC_HOST"
PORT="$CC_PORT"
WORKSPACE_DIR="$CC_WORKSPACE_DIR"
CCENTER_PATH=""
# Version of commandscenter installed before this run, captured so a failed
# upgrade can roll back to a known-good binary instead of leaving the host with
# none. Empty when there was no prior install.
PREV_VERSION=""

OS="$(uname -s)"

# Ordering matters: every feasibility check and the package install + verify run
# BEFORE the live service is touched. The currently-running service keeps serving
# the old version until a new, verified binary is in place, so a failed upgrade
# can never take a working instance down.
main() {
  require_supported_os
  warn_if_root_service_user
  ensure_service_user
  resolve_service_group
  ensure_install_dir
  ensure_ownership
  ensure_node_and_npm        # provision/upgrade to the required Node major
  preflight_checks           # feasibility gate — no mutation of the existing install
  install_commandscenter     # atomic install: snapshot, install, verify, roll back on failure
  resolve_ccenter_path
  prepare_env_file
  install_service            # (re)write the unit only after the binary is verified
  start_service              # restart the live service only now
  wait_for_env_file
  healthcheck                # confirm the app actually answers before declaring success
  generate_claim_code
  print_summary
}

require_supported_os() {
  case "$OS" in
    Linux|Darwin) ;;
    *)
      fail "Unsupported OS: $OS. This installer supports Ubuntu/Linux with systemd and macOS with launchd."
      ;;
  esac
}

warn_if_root_service_user() {
  if [[ "$OS" == "Linux" && "$SERVICE_USER" == "root" ]]; then
    warn "The CommandsCenter systemd service will run as root. Set CCENTER_SERVICE_USER (and optionally CCENTER_CREATE_USER=true) to run under a dedicated service account."
  fi
}

ensure_service_user() {
  [[ "$OS" == "Linux" ]] || return 0
  [[ "$SERVICE_USER" != "$(id -un)" ]] || return 0

  if id "$SERVICE_USER" >/dev/null 2>&1; then
    return 0
  fi

  if [[ "$CREATE_USER" != "true" ]]; then
    fail "Service user '$SERVICE_USER' does not exist. Create it first, or pass CCENTER_CREATE_USER=true to have the installer create a dedicated system user."
  fi

  info "Creating dedicated system user: $SERVICE_USER"
  if [[ -n "$SERVICE_GROUP" ]]; then
    ensure_service_group_exists "$SERVICE_GROUP"
    sudo useradd --system --create-home --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin --gid "$SERVICE_GROUP" "$SERVICE_USER"
    return
  fi

  sudo useradd --system --user-group --create-home --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
}

ensure_service_group_exists() {
  local group
  group="$1"

  if getent group "$group" >/dev/null 2>&1; then
    return 0
  fi

  info "Creating dedicated system group: $group"
  sudo groupadd --system "$group"
}

resolve_service_group() {
  [[ "$OS" == "Linux" ]] || return 0

  if [[ -n "$SERVICE_GROUP" ]]; then
    if ! getent group "$SERVICE_GROUP" >/dev/null 2>&1; then
      fail "Service group '$SERVICE_GROUP' does not exist. Create it first, or pass CCENTER_CREATE_USER=true with a missing CCENTER_SERVICE_USER to have the installer create it."
    fi
    return 0
  fi

  SERVICE_GROUP="$(id -gn "$SERVICE_USER")"
}

ensure_install_dir() {
  sudo_if_needed mkdir -p "$INSTALL_DIR" "$WORKSPACE_DIR"
}

# Run a command with sudo when Linux service setup targets a different user.
sudo_if_needed() {
  if [[ "$OS" == "Linux" && "$SERVICE_USER" != "$(id -un)" ]]; then
    sudo "$@"
    return
  fi

  "$@"
}

ensure_ownership() {
  [[ "$OS" == "Linux" ]] || return 0
  [[ "$SERVICE_USER" != "$(id -un)" ]] || return 0

  info "Setting ownership of runtime directories to $SERVICE_USER:$SERVICE_GROUP"
  sudo chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR"
  sudo chown -R "$SERVICE_USER:$SERVICE_GROUP" "$WORKSPACE_DIR"
  sudo chown "$SERVICE_USER:$SERVICE_GROUP" "$(dirname "$ENV_FILE")" 2>/dev/null || true
}

ensure_node_and_npm() {
  if command_exists node && command_exists npm && node_major_ok; then
    return
  fi

  if [[ "$OS" == "Linux" ]]; then
    install_node_linux
  else
    install_node_macos
  fi

  if ! command_exists node || ! command_exists npm || ! node_major_ok; then
    fail "Node.js $NODE_MAJOR+ is required, but the active node on PATH is still: $(node -v 2>/dev/null || printf 'not found'). Update PATH or install Node.js $NODE_MAJOR+ manually, then rerun."
  fi
}

node_major_ok() {
  local major
  major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')"
  [[ "$major" -ge "$NODE_MAJOR" ]]
}

install_node_linux() {
  if ! command_exists apt-get; then
    fail "Node.js $NODE_MAJOR+ is required and automatic install currently expects apt-get on Linux. Install Node.js $NODE_MAJOR+ manually, then rerun."
  fi

  info "Installing Node.js $NODE_MAJOR on Ubuntu/Linux."
  sudo apt-get update
  sudo apt-get install -y ca-certificates curl gnupg
  sudo install -d -m 0755 /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  printf 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' "$NODE_MAJOR" | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y nodejs build-essential
}

install_node_macos() {
  if ! command_exists brew; then
    fail "Node.js $NODE_MAJOR+ is required. Install Homebrew from https://brew.sh or install Node.js manually, then rerun."
  fi

  info "Installing Node.js with Homebrew."
  if brew list node >/dev/null 2>&1; then
    brew upgrade node || true
  else
    brew install node
  fi
}

# Print the major version Node requires for the install target, parsed from the
# published package's engines.node (e.g. ">=24.0.0" -> "24"). Empty when it
# cannot be resolved (offline, registry error, or no engines field).
target_required_node_major() {
  local spec engines major
  spec="$PACKAGE_SPEC"
  # A bare name means "latest"; npm view resolves the dist-tag for us.
  engines="$(npm view "$spec" engines.node 2>/dev/null || true)"
  [[ -n "$engines" ]] || return 0
  major="$(printf '%s' "$engines" | grep -oE '[0-9]+' | head -n1 || true)"
  printf '%s' "$major"
}

# Print the currently-installed global commandscenter version, or empty when not
# installed. Used to snapshot a rollback target before mutating anything.
installed_ccenter_version() {
  npm ls -g --depth=0 commandscenter --json 2>/dev/null \
    | node -e '
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(raw);
    const version = parsed?.dependencies?.commandscenter?.version;
    if (typeof version === "string" && version.length > 0) process.stdout.write(version);
  } catch {
    /* no installed version */
  }
});
' 2>/dev/null || true
}

# Feasibility gate. Runs before any destructive action and must not modify the
# existing install. Refuses clearly when the upgrade cannot succeed, leaving the
# running service and its binary untouched.
preflight_checks() {
  local local_major required_major
  local_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || printf '0')"

  # Cross-check the install target's real published requirement against the
  # local runtime. ensure_node_and_npm already enforced NODE_MAJOR; this catches
  # a target that needs an even newer Node than we provisioned.
  required_major="$(target_required_node_major)"
  if [[ -n "$required_major" && "$local_major" -lt "$required_major" ]]; then
    fail "$PACKAGE_SPEC requires Node >=$required_major, but this host runs Node v$(node -v 2>/dev/null | sed 's/^v//'). Upgrade Node to $required_major (set CCENTER_NODE_MAJOR=$required_major to let this installer do it on Linux), then re-run. Your current install was left untouched."
  fi

  # The native dependency (better-sqlite3) compiles via node-gyp when no prebuilt
  # ABI matches. Without a toolchain that install step fails mid-way and can leave
  # the host with no binary, so ensure it is present up front on Linux.
  ensure_build_toolchain

  # Snapshot the rollback target before we change anything.
  PREV_VERSION="$(installed_ccenter_version)"
  if [[ -n "$PREV_VERSION" ]]; then
    info "Current install: commandscenter@$PREV_VERSION (rollback target if the upgrade fails)"
  fi
}

# Ensure a C toolchain + python3 exist on Linux so a node-gyp fallback build can
# succeed. Best-effort: only acts when apt-get is available and something is
# missing.
ensure_build_toolchain() {
  [[ "$OS" == "Linux" ]] || return 0
  if command_exists cc && command_exists make && command_exists python3; then
    return 0
  fi
  if ! command_exists apt-get; then
    warn "Build tools (cc/make/python3) are missing and apt-get is unavailable. If a native dependency needs compiling, the install may fail; install build-essential and python3 manually."
    return 0
  fi
  info "Installing build toolchain (build-essential, python3) for native dependencies."
  sudo apt-get update
  sudo apt-get install -y build-essential python3
}

# Atomic install: snapshot is already captured by preflight. Install the target,
# verify the binary runs, and on any failure roll back to the previous version so
# the host is never left without a working ccenter.
install_commandscenter() {
  info "Installing $APP_NAME package: $PACKAGE_SPEC"

  if ! npm install -g --prefer-online "$PACKAGE_SPEC"; then
    rollback_install "npm install failed"
  fi

  if ! verify_ccenter_binary; then
    rollback_install "the installed binary did not verify"
  fi

  info "Installed and verified: $(ccenter --version 2>/dev/null || printf 'commandscenter')"
}

# Confirm ccenter resolves to an executable and actually runs.
verify_ccenter_binary() {
  local path
  # Drop any cached command location so a freshly (re)installed binary at a new
  # npm prefix is resolved, not a stale path.
  hash -r 2>/dev/null || true
  path="$(command -v ccenter || true)"
  [[ -n "$path" && -x "$path" ]] || return 1
  ccenter --version >/dev/null 2>&1
}

# Restore the previously-installed version (if any) and abort. Called when an
# upgrade fails so a working instance is never lost. Does not touch the running
# service — main() has not reached install_service/start_service yet.
rollback_install() {
  local reason restored
  reason="$1"

  if [[ -z "$PREV_VERSION" ]]; then
    fail "Install of $PACKAGE_SPEC failed ($reason) and there was no previous version to restore. The service was not modified. Check the npm output above, then re-run."
  fi

  warn "Install of $PACKAGE_SPEC failed ($reason). Rolling back to commandscenter@$PREV_VERSION."
  if npm install -g --prefer-online "commandscenter@$PREV_VERSION" && verify_ccenter_binary; then
    restored="restored"
  else
    restored="COULD NOT be restored automatically — reinstall commandscenter@$PREV_VERSION manually"
  fi

  fail "Upgrade to $PACKAGE_SPEC failed ($reason). Previous version commandscenter@$PREV_VERSION was $restored and the running service was left untouched. Review the npm output above before retrying."
}

resolve_ccenter_path() {
  CCENTER_PATH="$(command -v ccenter || true)"

  if [[ -z "$CCENTER_PATH" || ! -x "$CCENTER_PATH" ]]; then
    fail "Unable to resolve an executable ccenter binary after installing $PACKAGE_SPEC. Check npm global bin configuration and rerun."
  fi

  if [[ "$OS" == "Linux" && "$SERVICE_USER" != "$(id -un)" ]]; then
    if ! sudo -u "$SERVICE_USER" test -x "$CCENTER_PATH"; then
      fail "The resolved ccenter binary is not executable by service user $SERVICE_USER: $CCENTER_PATH. Install commandscenter into a globally accessible npm prefix, then rerun."
    fi
  fi
}

prepare_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    info "Using existing env file: $ENV_FILE"
    return
  fi

  info "Env file will be generated by ccenter on first service start: $ENV_FILE"
}

install_service() {
  if [[ "$OS" == "Linux" ]]; then
    install_systemd_service
    return
  fi

  install_launchd_service
}

# Print the names of CC_* environment variables that should be injected into the
# service, one per line. Secrets and internal runtime markers are excluded;
# ccenter generates CC_SECRET_KEY itself on first start.
service_env_names() {
  local name
  for name in $(compgen -v); do
    case "$name" in
      CC_SECRET_KEY | CC_FIRST_RUN_* | CC_NPM_GLOBAL_ROOT) continue ;;
      CC_*) ;;
      *) continue ;;
    esac

    [[ -n "${!name:-}" ]] || continue
    printf '%s\n' "$name"
  done
}

systemd_environment_line() {
  local name value
  name="$1"
  value="${!name}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//%/%%}"

  printf 'Environment="%s=%s"\n' "$name" "$value"
}

install_systemd_service() {
  if ! command_exists systemctl; then
    fail "systemd is required for automatic Linux background service setup."
  fi

  local service_file env_lines name
  service_file="/etc/systemd/system/$SERVICE_NAME.service"

  env_lines=""
  while IFS= read -r name; do
    env_lines+="$(systemd_environment_line "$name")"$'\n'
  done < <(service_env_names)

  sudo tee "$service_file" >/dev/null <<EOF
[Unit]
Description=CommandsCenter
After=network.target
# Backstop the restart loop: after 5 failures within 60s systemd gives up and
# leaves the unit in 'failed' instead of restarting forever, so a broken binary
# surfaces as a clear failure rather than a silent crash loop.
StartLimitIntervalSec=60
StartLimitBurst=5

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_GROUP
WorkingDirectory=$INSTALL_DIR
# Fail fast with an obvious reason in the journal if the binary is missing
# (e.g. a relocated npm prefix) instead of an opaque 203/EXEC.
ExecStartPre=/usr/bin/test -x $CCENTER_PATH
${env_lines}ExecStart=$CCENTER_PATH start --host $HOST --port $PORT --cc-env-file $ENV_FILE
Restart=on-failure
RestartSec=5
SuccessExitStatus=75
RestartForceExitStatus=75
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
}

xml_escape() {
  local value
  value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"

  printf '%s' "$value"
}

install_launchd_service() {
  local plist_dir plist_file ccenter_dir node_path node_dir launchd_path env_entries name
  local escaped_ccenter_path escaped_env_file escaped_host escaped_install_dir escaped_launchd_path escaped_port
  plist_dir="$HOME/Library/LaunchAgents"
  plist_file="$plist_dir/com.commandscenter.app.plist"
  ccenter_dir="$(dirname "$CCENTER_PATH")"
  node_path="$(command -v node)"
  node_dir="$(dirname "$node_path")"
  launchd_path="$node_dir:$ccenter_dir:/usr/bin:/bin:/usr/sbin:/sbin"
  escaped_ccenter_path="$(xml_escape "$CCENTER_PATH")"
  escaped_env_file="$(xml_escape "$ENV_FILE")"
  escaped_host="$(xml_escape "$HOST")"
  escaped_install_dir="$(xml_escape "$INSTALL_DIR")"
  escaped_launchd_path="$(xml_escape "$launchd_path")"
  escaped_port="$(xml_escape "$PORT")"

  env_entries=""
  while IFS= read -r name; do
    env_entries+="    <key>${name}</key>"$'\n'"    <string>$(xml_escape "${!name}")</string>"$'\n'
  done < <(service_env_names)

  mkdir -p "$plist_dir"

  cat >"$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.commandscenter.app</string>
  <key>WorkingDirectory</key>
  <string>$escaped_install_dir</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$escaped_launchd_path</string>
${env_entries}  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>$escaped_ccenter_path</string>
    <string>start</string>
    <string>--host</string>
    <string>$escaped_host</string>
    <string>--port</string>
    <string>$escaped_port</string>
    <string>--cc-env-file</string>
    <string>$escaped_env_file</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$escaped_install_dir/commandscenter.out.log</string>
  <key>StandardErrorPath</key>
  <string>$escaped_install_dir/commandscenter.err.log</string>
</dict>
</plist>
EOF
}

start_service() {
  if [[ "$OS" == "Linux" ]]; then
    sudo systemctl restart "$SERVICE_NAME"
    return
  fi

  local plist_file
  plist_file="$HOME/Library/LaunchAgents/com.commandscenter.app.plist"
  launchctl unload "$plist_file" >/dev/null 2>&1 || true
  launchctl load "$plist_file"
  launchctl start com.commandscenter.app >/dev/null 2>&1 || true
}

wait_for_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    return
  fi

  info "Waiting for ccenter to create env file: $ENV_FILE"

  for _ in {1..60}; do
    if [[ -f "$ENV_FILE" ]]; then
      return
    fi

    sleep 1
  done

  fail "Timed out waiting for ccenter to create env file: $ENV_FILE. Check service logs, then rerun the installer."
}

# Build a connectable health URL from $HOST. A wildcard bind address is not
# connectable, so map it to the matching loopback (0.0.0.0 -> 127.0.0.1,
# :: -> [::1]); any other IPv6 literal is bracketed as HTTP URLs require; IPv4
# and hostnames are used as-is. Used for both probing and operator-facing
# messages.
health_url() {
  local host
  host="$HOST"
  case "$host" in
    0.0.0.0) host="127.0.0.1" ;;
    "::" | "[::]") host="[::1]" ;;
    *:*)
      # Bracket an IPv6 literal (e.g. ::1, 2001:db8::1) unless already bracketed.
      [[ "$host" == \[*\] ]] || host="[$host]"
      ;;
  esac
  printf 'http://%s:%s/api/health' "$host" "$PORT"
}

# Poll the health endpoint up to ${1:-60}s. Returns 0 once healthy, 1 on timeout.
probe_health() {
  local url attempts
  url="$(health_url)"
  attempts="${1:-60}"

  for ((i = 0; i < attempts; i++)); do
    if curl -fsS -o /dev/null --max-time 3 "$url"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Confirm the service actually answers before reporting success. The binary is
# already verified at this point, so this catches runtime failures (bad env, port
# conflict, a genuine runtime incompatibility) that a binary check cannot. If the
# new version starts but never becomes healthy, roll the running service back to
# the previous version so a working instance is not left down.
healthcheck() {
  local url
  url="$(health_url)"

  if ! command_exists curl; then
    warn "curl not found; skipping HTTP healthcheck. Verify manually: $url"
    return 0
  fi

  info "Waiting for the service to become healthy: $url"
  if probe_health 60; then
    info "Service is healthy."
    return 0
  fi

  dump_service_logs
  rollback_running_service "$url"
}

# Reached only when the freshly-installed version restarted but failed its
# healthcheck. Reinstall the previous version, rewrite the unit for its binary,
# restart, and verify health — so the instance ends on a known-good version
# rather than a broken new one. Aborts with a clear status either way.
rollback_running_service() {
  local url restored_health
  url="$1"

  if [[ -z "$PREV_VERSION" ]]; then
    fail "Service did not become healthy at $url within 60s, and there is no previous version to roll back to. The new binary installed but the app is unhealthy — review the logs above (env, port $PORT conflict, or startup error), then rerun."
  fi

  warn "New version is unhealthy. Rolling the service back to commandscenter@$PREV_VERSION."
  if ! npm install -g --prefer-online "commandscenter@$PREV_VERSION" || ! verify_ccenter_binary; then
    fail "Service did not become healthy at $url, and the automatic rollback to commandscenter@$PREV_VERSION also failed to install. The instance may be down — reinstall commandscenter@$PREV_VERSION manually and restart $SERVICE_NAME."
  fi

  resolve_ccenter_path   # re-point CCENTER_PATH at the restored binary
  install_service        # rewrite the unit for the restored binary/path
  start_service          # restart onto the previous version

  if probe_health 60; then
    restored_health="and the previous version is healthy again"
  else
    restored_health="but the previous version is ALSO not healthy — check $SERVICE_NAME logs"
  fi

  fail "Upgrade to $PACKAGE_SPEC failed its healthcheck at $url. Rolled the service back to commandscenter@$PREV_VERSION $restored_health. Review the logs above before retrying the upgrade."
}

# Surface recent service logs to the operator on a healthcheck failure.
dump_service_logs() {
  warn "Recent service logs:"
  if [[ "$OS" == "Linux" ]]; then
    sudo journalctl -u "$SERVICE_NAME" -n 50 --no-pager >&2 2>/dev/null || true
  else
    tail -n 50 "$INSTALL_DIR/commandscenter.err.log" >&2 2>/dev/null || true
  fi
}

generate_claim_code() {
  local claim_json

  if ! claim_json="$(run_claim_command)"; then
    fail "Unable to generate owner claim code. Check ccenter availability, env file permissions, and workspace ownership, then rerun the installer."
  fi

  if ! CLAIM_OUTPUT="$(printf '%s' "$claim_json" | node -e '
const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));

    if (
      (parsed.purpose !== "claim" && parsed.purpose !== "reclaim") ||
      typeof parsed.code !== "string" ||
      parsed.code.length === 0 ||
      typeof parsed.warning !== "string"
    ) {
      process.exit(1);
    }

    process.stdout.write(`${parsed.purpose.toUpperCase()} code: ${parsed.code}\n${parsed.warning}`);
  } catch {
    process.exit(1);
  }
});
')"; then
    fail "ccenter claim completed without returning valid claim JSON. Check the service logs and run ccenter claim --cc-env-file \"$ENV_FILE\" --format json --yes manually."
  fi
}

run_claim_command() {
  if [[ "$OS" == "Linux" && "$SERVICE_USER" != "$(id -un)" ]]; then
    sudo -u "$SERVICE_USER" env CC_WORKSPACE_DIR="$WORKSPACE_DIR" "$CCENTER_PATH" claim --cc-env-file "$ENV_FILE" --format json --yes
    return
  fi

  env CC_WORKSPACE_DIR="$WORKSPACE_DIR" "$CCENTER_PATH" claim --cc-env-file "$ENV_FILE" --format json --yes
}

print_summary() {
  local base_url health_url
  if [[ -n "${CC_PUBLIC_ORIGIN:-}" ]]; then
    base_url="$CC_PUBLIC_ORIGIN"
    health_url="http://$PUBLIC_HOST:$PORT"
  else
    base_url="http://$PUBLIC_HOST:$PORT"
    health_url="$base_url"
  fi

  printf '\nCommandsCenter is installed and running.\n'
  printf '\nURLs:\n'
  printf '  App:     %s\n' "$base_url"
  printf '  Claim:   %s/claim\n' "$base_url"
  printf '  Health:  %s/api/health\n' "$health_url"
  printf '  Version: %s/api/system/version\n' "$health_url"
  printf '\nLocations:\n'
  printf '  Install dir:   %s\n' "$INSTALL_DIR"
  printf '  Env file:      %s\n' "$ENV_FILE"
  printf '  Workspace dir: %s\n' "$WORKSPACE_DIR"
  printf '\nOwner claim:\n'
  printf '%s\n' "$CLAIM_OUTPUT"
  printf '  Keep this code and enter it on the claim screen to unlock this instance.\n'
  printf '\nService:\n'

  if [[ "$OS" == "Linux" ]]; then
    printf '  User:   %s:%s\n' "$SERVICE_USER" "$SERVICE_GROUP"
    printf '  Status: sudo systemctl status %s\n' "$SERVICE_NAME"
    printf '  Logs:   journalctl -u %s -f\n' "$SERVICE_NAME"
  else
    printf '  Status: launchctl print gui/$(id -u)/com.commandscenter.app\n'
    printf '  Logs:   tail -f %s/commandscenter.out.log %s/commandscenter.err.log\n' "$INSTALL_DIR" "$INSTALL_DIR"
  fi

  printf '\nNext steps:\n'
  if [[ -n "${CC_PUBLIC_ORIGIN:-}" ]]; then
    printf '  1. Point a reverse proxy with HTTPS at %s and ensure your DNS resolves to this server.\n' "$base_url"
    printf '     CC_PUBLIC_ORIGIN is already set to %s, so claim at %s/claim once the proxy is live.\n' "$CC_PUBLIC_ORIGIN" "$base_url"
  else
    printf '  1. To expose this instance through a domain or reverse proxy, set CC_PUBLIC_ORIGIN in %s:\n' "$ENV_FILE"
    printf '       CC_PUBLIC_ORIGIN=https://your.domain.com\n'
    printf '     then restart the service, or rerun this installer with CC_PUBLIC_ORIGIN already set.\n'
    printf '     Without it, login through a domain is rejected with "Request origin is not allowed."\n'
  fi
  if [[ "$OS" == "Linux" && "$SERVICE_USER" == "root" ]]; then
    printf '  2. The service is running as root. For better security, rerun with a dedicated user:\n'
    printf '       curl -fsSL %s \\\n' "$INSTALLER_URL"
    printf '         | CCENTER_INSTALL_DIR=/opt/commandscenter \\\n'
    printf '           CCENTER_SERVICE_USER=commandscenter CCENTER_CREATE_USER=true bash\n'
  fi
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

info() {
  printf '==> %s\n' "$1"
}

warn() {
  printf 'Warning: %s\n' "$1" >&2
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

main "$@"
