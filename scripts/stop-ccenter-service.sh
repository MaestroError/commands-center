#!/usr/bin/env bash

set -euo pipefail

DEFAULT_ENV_FILE="$HOME/.cc/.env"
STOP_TIMEOUT_SECONDS="${CCENTER_STOP_TIMEOUT_SECONDS:-20}"
POLL_INTERVAL_SECONDS="${CCENTER_STOP_POLL_INTERVAL_SECONDS:-1}"

ENV_FILE="$DEFAULT_ENV_FILE"

main() {
  parse_args "$@"
  require_dependencies
  require_env_file

  local app_host app_port app_request_host app_health_url app_shutdown_url opencode_port secret_key
  app_host="$(read_env_value "CC_HOST" "0.0.0.0")"
  app_port="$(read_env_value "CC_PORT" "3000")"
  app_request_host="$(resolve_request_host "$app_host")"
  app_health_url="http://$app_request_host:$app_port/api/health"
  app_shutdown_url="http://$app_request_host:$app_port/api/system/shutdown"
  opencode_port="$(read_env_value "CC_OPENCODE_PORT" "4100")"
  secret_key="$(read_env_value "CC_SECRET_KEY" "")"

  info "Using env file: $ENV_FILE"

  stop_commandscenter_runtime "$app_port" "$app_health_url" "$app_shutdown_url" "$secret_key"
  stop_orphaned_opencode "$opencode_port"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --env-file)
        if [[ $# -lt 2 ]]; then
          fail "--env-file requires a path argument."
        fi

        ENV_FILE="$2"
        shift 2
        ;;
      --help|-h)
        print_help
        exit 0
        ;;
      *)
        if [[ "$ENV_FILE" != "$DEFAULT_ENV_FILE" ]]; then
          fail "Unexpected argument: $1"
        fi

        ENV_FILE="$1"
        shift
        ;;
    esac
  done
}

print_help() {
  cat <<EOF
Usage: bash scripts/stop-ccenter-service.sh [--env-file <path>]

Gracefully stops the CommandsCenter runtime described by the env file.
If no env file is supplied, the script uses: $DEFAULT_ENV_FILE
EOF
}

require_dependencies() {
  command_exists curl || fail "curl is required."
  command_exists lsof || fail "lsof is required."
}

require_env_file() {
  [[ -f "$ENV_FILE" ]] || fail "Env file not found: $ENV_FILE"
}

read_env_value() {
  local key default_value raw_value
  key="$1"
  default_value="$2"
  raw_value="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"

  if [[ -z "$raw_value" ]]; then
    printf '%s' "$default_value"
    return
  fi

  raw_value="${raw_value#*=}"
  raw_value="${raw_value%$'\r'}"

  if [[ "$raw_value" == \"*\" && "$raw_value" == *\" ]]; then
    raw_value="${raw_value:1:-1}"
  elif [[ "$raw_value" == \'*\' && "$raw_value" == *\' ]]; then
    raw_value="${raw_value:1:-1}"
  fi

  printf '%s' "$raw_value"
}

resolve_request_host() {
  local host
  host="$1"

  case "$host" in
    ""|0.0.0.0|::|[::]|localhost|127.0.0.1)
      printf '127.0.0.1'
      ;;
    *)
      printf '%s' "$host"
      ;;
  esac
}

find_listening_pids() {
  local port
  port="$1"
  lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u || true
}

port_is_listening() {
  local port
  port="$1"
  [[ -n "$(find_listening_pids "$port")" ]]
}

stop_commandscenter_runtime() {
  local app_port app_health_url app_shutdown_url secret_key app_pids
  app_port="$1"
  app_health_url="$2"
  app_shutdown_url="$3"
  secret_key="$4"
  app_pids="$(find_listening_pids "$app_port")"

  if [[ -z "$app_pids" ]]; then
    info "CommandsCenter port $app_port is not occupied."
    return
  fi

  info "CommandsCenter port $app_port is occupied by PID(s): $(join_lines "$app_pids")"

  if request_shutdown "$app_shutdown_url" "$secret_key"; then
    info "Shutdown endpoint accepted the request. Waiting for health to go down."

    if wait_for_health_shutdown "$app_port" "$app_health_url" "CommandsCenter"; then
      info "CommandsCenter stopped gracefully."
      return
    fi

    info "Shutdown endpoint did not clear port $app_port in time. Falling back to SIGTERM."
  fi

  app_pids="$(find_listening_pids "$app_port")"

  if [[ -z "$app_pids" ]]; then
    info "CommandsCenter port $app_port is no longer occupied."
    return
  fi

  terminate_by_port "$app_port" "CommandsCenter"
}

request_shutdown() {
  local shutdown_url secret_key status_code
  shutdown_url="$1"
  secret_key="$2"

  if [[ -z "$secret_key" ]]; then
    info "CC_SECRET_KEY is empty. Skipping shutdown endpoint and using SIGTERM fallback."
    return 1
  fi

  status_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -X POST "$shutdown_url" -H "x-cc-shutdown-key: $secret_key" || true)"

  if [[ "$status_code" == "202" ]]; then
    return 0
  fi

  if [[ -n "$status_code" && "$status_code" != "000" ]]; then
    info "Shutdown endpoint returned HTTP $status_code. Falling back to SIGTERM."
  else
    info "Shutdown endpoint is unavailable. Falling back to SIGTERM."
  fi

  return 1
}

wait_for_health_shutdown() {
  local port health_url label elapsed
  port="$1"
  health_url="$2"
  label="$3"
  elapsed=0

  while (( elapsed < STOP_TIMEOUT_SECONDS )); do
    if ! port_is_listening "$port"; then
      return 0
    fi

    if ! curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1 && ! port_is_listening "$port"; then
      return 0
    fi

    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  info "$label did not shut down within ${STOP_TIMEOUT_SECONDS}s."
  return 1
}

wait_for_port_to_clear() {
  local port label elapsed
  port="$1"
  label="$2"
  elapsed=0

  while (( elapsed < STOP_TIMEOUT_SECONDS )); do
    if ! port_is_listening "$port"; then
      return 0
    fi

    sleep "$POLL_INTERVAL_SECONDS"
    elapsed=$((elapsed + POLL_INTERVAL_SECONDS))
  done

  info "$label is still listening on port $port after ${STOP_TIMEOUT_SECONDS}s."
  return 1
}

terminate_by_port() {
  local port label pids
  port="$1"
  label="$2"
  pids="$(find_listening_pids "$port")"

  if [[ -z "$pids" ]]; then
    info "$label port $port is not occupied."
    return
  fi

  info "Sending SIGTERM to $label PID(s): $(join_lines "$pids")"
  kill $pids

  if wait_for_port_to_clear "$port" "$label"; then
    info "$label stopped after SIGTERM."
    return
  fi

  fail "$label is still listening on port $port after SIGTERM."
}

stop_orphaned_opencode() {
  local opencode_port opencode_pids
  opencode_port="$1"
  opencode_pids="$(find_listening_pids "$opencode_port")"

  if [[ -z "$opencode_pids" ]]; then
    info "OpenCode port $opencode_port is not occupied."
    return
  fi

  info "OpenCode port $opencode_port is occupied by PID(s): $(join_lines "$opencode_pids")"

  if wait_for_port_to_clear "$opencode_port" "OpenCode"; then
    info "OpenCode stopped during runtime drain."
    return
  fi

  terminate_by_port "$opencode_port" "OpenCode"
}

join_lines() {
  local lines
  lines="$1"
  printf '%s' "$lines" | paste -sd ', ' -
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