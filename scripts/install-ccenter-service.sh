#!/usr/bin/env bash

set -euo pipefail

APP_NAME="commandscenter"
SERVICE_NAME="commandscenter"
PACKAGE_SPEC="${CCENTER_PACKAGE_SPEC:-commandscenter}"
INSTALL_DIR="${CCENTER_INSTALL_DIR:-$HOME/.cc}"
WORKSPACE_DIR="${CCENTER_WORKSPACE_DIR:-$INSTALL_DIR/workspace}"
ENV_FILE="${CCENTER_ENV_FILE:-$INSTALL_DIR/.env}"
HOST="${CCENTER_HOST:-127.0.0.1}"
PORT="${CCENTER_PORT:-3000}"
PUBLIC_HOST="${CCENTER_PUBLIC_HOST:-127.0.0.1}"
NODE_MAJOR="${CCENTER_NODE_MAJOR:-22}"

OS="$(uname -s)"

main() {
  require_supported_os
  ensure_install_dir
  ensure_node_and_npm
  install_commandscenter
  ensure_env_file
  install_service
  start_service
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

ensure_install_dir() {
  mkdir -p "$INSTALL_DIR" "$WORKSPACE_DIR"
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

install_commandscenter() {
  info "Installing $APP_NAME package: $PACKAGE_SPEC"
  npm install -g "$PACKAGE_SPEC"
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    info "Using existing env file: $ENV_FILE"
    return
  fi

  local secret
  secret="$(generate_secret)"

  cat >"$ENV_FILE" <<EOF
NODE_ENV=production
CC_HOST=$HOST
CC_PORT=$PORT
CC_WORKSPACE_DIR=$WORKSPACE_DIR
CC_SECRET_KEY=$secret
CC_UPDATE_CHECK=true
CC_AUTO_UPDATE=false
EOF

  chmod 600 "$ENV_FILE"
  info "Created env file: $ENV_FILE"
}

install_service() {
  if [[ "$OS" == "Linux" ]]; then
    install_systemd_service
    return
  fi

  install_launchd_service
}

install_systemd_service() {
  if ! command_exists systemctl; then
    fail "systemd is required for automatic Linux background service setup."
  fi

  local service_file
  service_file="/etc/systemd/system/$SERVICE_NAME.service"

  sudo tee "$service_file" >/dev/null <<EOF
[Unit]
Description=CommandsCenter
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v ccenter) start --env-file $ENV_FILE
Restart=on-failure
RestartSec=5
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
}

install_launchd_service() {
  local plist_dir plist_file ccenter_path
  plist_dir="$HOME/Library/LaunchAgents"
  plist_file="$plist_dir/com.commandscenter.app.plist"
  ccenter_path="$(command -v ccenter)"

  mkdir -p "$plist_dir"

  cat >"$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.commandscenter.app</string>
  <key>WorkingDirectory</key>
  <string>$INSTALL_DIR</string>
  <key>ProgramArguments</key>
  <array>
    <string>$ccenter_path</string>
    <string>start</string>
    <string>--env-file</string>
    <string>$ENV_FILE</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$INSTALL_DIR/commandscenter.out.log</string>
  <key>StandardErrorPath</key>
  <string>$INSTALL_DIR/commandscenter.err.log</string>
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

print_summary() {
  local base_url
  base_url="http://$PUBLIC_HOST:$PORT"

  printf '\nCommandsCenter is installed and running.\n'
  printf '\nURLs:\n'
  printf '  App:     %s\n' "$base_url"
  printf '  Health:  %s/api/health\n' "$base_url"
  printf '  Version: %s/api/system/version\n' "$base_url"
  printf '\nLocations:\n'
  printf '  Install dir:   %s\n' "$INSTALL_DIR"
  printf '  Env file:      %s\n' "$ENV_FILE"
  printf '  Workspace dir: %s\n' "$WORKSPACE_DIR"
  printf '\nService:\n'

  if [[ "$OS" == "Linux" ]]; then
    printf '  Status: sudo systemctl status %s\n' "$SERVICE_NAME"
    printf '  Logs:   journalctl -u %s -f\n' "$SERVICE_NAME"
    return
  fi

  printf '  Status: launchctl print gui/$(id -u)/com.commandscenter.app\n'
  printf '  Logs:   tail -f %s/commandscenter.out.log %s/commandscenter.err.log\n' "$INSTALL_DIR" "$INSTALL_DIR"
}

generate_secret() {
  if command_exists openssl; then
    openssl rand -hex 32
    return
  fi

  node -e 'console.log(crypto.randomBytes(32).toString("hex"))'
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

info() {
  printf '==> %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

main "$@"
