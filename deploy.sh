#!/usr/bin/env bash
set -Eeuo pipefail

# Resolve the RSSMonster root directory from this script's location.
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$APP_DIR/server"
CLIENT_DIR="$APP_DIR/client"
INFERENCE_DIR="$APP_DIR/inference"
ENV_FILE="$SERVER_DIR/.env"

PM2_WEB_APP_NAME="rssmonster-web"
PM2_WORKER_APP_NAME="rssmonster-worker"
PM2_INFERENCE_APP_NAME="rssmonster-inference"
OBSOLETE_PM2_APP_NAME="rssmonster-dev"
ECOSYSTEM_FILE="$APP_DIR/ecosystem.config.cjs"

DEPLOY_LOCK="$APP_DIR/.deploy.lock"
DEPLOY_LOG="$APP_DIR/deploy.log"

HEALTHCHECK_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-30}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"

exec > >(tee -a "$DEPLOY_LOG") 2>&1

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

on_error() {
  local exit_code=$?
  local line_number="${BASH_LINENO[0]:-unknown}"

  echo
  echo "Deployment failed with exit code $exit_code at line $line_number."

  if command -v pm2 >/dev/null 2>&1; then
    echo
    echo "Current PM2 status:"
    pm2 describe "$PM2_WEB_APP_NAME" || true
    pm2 describe "$PM2_WORKER_APP_NAME" || true
    pm2 describe "$PM2_INFERENCE_APP_NAME" || true

    echo
    echo "Recent PM2 logs:"
    pm2 logs "$PM2_WEB_APP_NAME" --lines 50 --nostream || true
    pm2 logs "$PM2_WORKER_APP_NAME" --lines 50 --nostream || true
    pm2 logs "$PM2_INFERENCE_APP_NAME" --lines 50 --nostream || true
  fi

  exit "$exit_code"
}

cleanup() {
  rm -f "$DEPLOY_LOCK"
}

run_with_timeout() {
  local duration="$1"
  shift

  echo "+ $*"

  if command -v timeout >/dev/null 2>&1; then
    timeout --foreground "$duration" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout --foreground "$duration" "$@"
  else
    "$@"
  fi
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is not available: $command_name"
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  local default_value="${2:-}"
  local value

  value="$(
    sed -n \
      -e "s/^[[:space:]]*export[[:space:]]\+$key[[:space:]]*=[[:space:]]*//p" \
      -e "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*//p" \
      "$ENV_FILE" |
      tail -n 1
  )"

  value="${value%$'\r'}"
  value="${value%%[[:space:]]#*}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "${value:-$default_value}"
}

trap on_error ERR
trap cleanup EXIT INT TERM

if [[ -e "$DEPLOY_LOCK" ]]; then
  echo "Another deployment appears to be running."
  echo "Lock file: $DEPLOY_LOCK"
  echo
  echo "Remove the lock only when you are certain no deployment is active:"
  echo "rm -f \"$DEPLOY_LOCK\""
  exit 1
fi

touch "$DEPLOY_LOCK"

log "Deploying RSSMonster"
echo "Application directory: $APP_DIR"

require_command git
require_command npm
require_command pm2
require_command curl
require_command sed

for directory in "$APP_DIR" "$SERVER_DIR" "$CLIENT_DIR" "$INFERENCE_DIR"; do
  if [[ ! -d "$directory" ]]; then
    echo "Required directory does not exist: $directory"
    exit 1
  fi
done

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "Application directory is not a Git repository: $APP_DIR"
  exit 1
fi

if [[ ! -f "$SERVER_DIR/package.json" ]]; then
  echo "Server package.json does not exist: $SERVER_DIR/package.json"
  exit 1
fi

if [[ ! -f "$CLIENT_DIR/package.json" ]]; then
  echo "Client package.json does not exist: $CLIENT_DIR/package.json"
  exit 1
fi

if [[ ! -f "$INFERENCE_DIR/package.json" ]]; then
  echo "Inference package.json does not exist: $INFERENCE_DIR/package.json"
  exit 1
fi

if [[ ! -f "$ECOSYSTEM_FILE" ]]; then
  echo "PM2 ecosystem file does not exist: $ECOSYSTEM_FILE"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Server environment file does not exist: $ENV_FILE"
  exit 1
fi

if pm2 describe "$OBSOLETE_PM2_APP_NAME" >/dev/null 2>&1; then
  echo "Obsolete PM2 process is still installed: $OBSOLETE_PM2_APP_NAME"
  echo "Remove it once before deploying the web and worker processes:"
  echo "pm2 delete $OBSOLETE_PM2_APP_NAME && pm2 save"
  exit 1
fi

SERVER_HOST="$(read_env_value HOST "127.0.0.1")"
SERVER_PORT="$(read_env_value PORT)"
SERVER_ENABLE_HTTPS="$(read_env_value ENABLE_HTTPS "false")"

if [[ -z "$SERVER_PORT" ]]; then
  echo "PORT is not configured in $ENV_FILE"
  exit 1
fi

if [[ ! "$SERVER_PORT" =~ ^[0-9]+$ ]] ||
  ((SERVER_PORT < 1 || SERVER_PORT > 65535)); then
  echo "Invalid PORT value in $ENV_FILE: $SERVER_PORT"
  exit 1
fi

# A server may bind to all interfaces, but curl needs a concrete address.
case "$SERVER_HOST" in
  0.0.0.0 | "::" | "[::]")
    HEALTHCHECK_HOST="127.0.0.1"
    ;;
  *)
    HEALTHCHECK_HOST="$SERVER_HOST"
    ;;
esac

if [[ "$HEALTHCHECK_HOST" == *:* && "$HEALTHCHECK_HOST" != \[*\] ]]; then
  HEALTHCHECK_HOST="[$HEALTHCHECK_HOST]"
fi

HEALTHCHECK_CURL_OPTIONS=()

if [[ -z "${HEALTHCHECK_URL:-}" ]]; then
  if [[ "$SERVER_ENABLE_HTTPS" == "true" ]]; then
    HEALTHCHECK_URL="https://$HEALTHCHECK_HOST:$SERVER_PORT/api/health"
    # The loopback address does not match the public certificate hostname.
    HEALTHCHECK_CURL_OPTIONS+=(--insecure)
  else
    HEALTHCHECK_URL="http://$HEALTHCHECK_HOST:$SERVER_PORT/api/health"
  fi
fi

echo "Server environment: $ENV_FILE"
echo "Server host: $SERVER_HOST"
echo "Server port: $SERVER_PORT"
echo "Health check: $HEALTHCHECK_URL"

cd "$APP_DIR"

CURRENT_BRANCH="$(git branch --show-current)"

if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Unable to determine the current Git branch."
  exit 1
fi

log "Resetting local changes"
run_with_timeout 1m git reset --hard HEAD

run_with_timeout 1m git clean -fd \
  -e .env \
  -e server/.env \
  -e client/.env \
  -e inference/.env \
  -e deploy.log

log "Fetching latest changes"
run_with_timeout 2m git fetch --prune origin

if ! git show-ref --verify --quiet "refs/remotes/origin/$CURRENT_BRANCH"; then
  echo "Remote branch does not exist: origin/$CURRENT_BRANCH"
  exit 1
fi

log "Updating branch $CURRENT_BRANCH"
run_with_timeout 2m git reset --hard "origin/$CURRENT_BRANCH"

log "Installing server dependencies"
cd "$SERVER_DIR"
run_with_timeout 10m npm ci --no-audit --no-fund

log "Running database migrations"
run_with_timeout 10m npm run db

log "Installing client dependencies"
cd "$CLIENT_DIR"
run_with_timeout 10m npm ci --no-audit --no-fund

log "Installing inference dependencies"
cd "$INFERENCE_DIR"
run_with_timeout 10m npm ci --no-audit --no-fund

log "Building client"
cd "$CLIENT_DIR"
run_with_timeout 15m npm run build

if [[ ! -d "$CLIENT_DIR/dist" ]]; then
  echo "Client build directory was not created: $CLIENT_DIR/dist"
  exit 1
fi

log "Copying client build to server"
rm -rf "$SERVER_DIR/dist"
cp -R "$CLIENT_DIR/dist" "$SERVER_DIR/dist"

log "Starting or reloading PM2 processes"
cd "$APP_DIR"
mkdir -p logs

run_with_timeout 20m \
  pm2 startOrReload "$ECOSYSTEM_FILE" \
  --env production \
  --update-env

for app_name in "$PM2_WEB_APP_NAME" "$PM2_WORKER_APP_NAME" "$PM2_INFERENCE_APP_NAME"; do
  PM2_PID="$(pm2 pid "$app_name" 2>/dev/null || true)"

  if [[ ! "$PM2_PID" =~ ^[1-9][0-9]*$ ]]; then
    echo "PM2 process is not running: $app_name"
    pm2 describe "$app_name" || true
    exit 1
  fi
done

log "Waiting for RSSMonster health check"

HEALTHCHECK_PASSED=false

for ((attempt = 1; attempt <= HEALTHCHECK_ATTEMPTS; attempt++)); do
  if curl \
    --silent \
    --show-error \
    --fail \
    --max-time 5 \
    "${HEALTHCHECK_CURL_OPTIONS[@]}" \
    "$HEALTHCHECK_URL" >/dev/null; then
    HEALTHCHECK_PASSED=true
    break
  fi

  PM2_PID="$(pm2 pid "$PM2_WEB_APP_NAME" 2>/dev/null || true)"

  if [[ ! "$PM2_PID" =~ ^[1-9][0-9]*$ ]]; then
    echo "PM2 process is not running."
    break
  fi

  echo "Health check attempt $attempt/$HEALTHCHECK_ATTEMPTS failed."
  sleep "$HEALTHCHECK_INTERVAL_SECONDS"
done

if [[ "$HEALTHCHECK_PASSED" != true ]]; then
  echo
  echo "RSSMonster did not pass its health check:"
  echo "$HEALTHCHECK_URL"

  pm2 describe "$PM2_WEB_APP_NAME" || true
  pm2 logs "$PM2_WEB_APP_NAME" --lines 100 --nostream || true
  exit 1
fi

for app_name in "$PM2_WEB_APP_NAME" "$PM2_WORKER_APP_NAME" "$PM2_INFERENCE_APP_NAME"; do
  PM2_PID="$(pm2 pid "$app_name" 2>/dev/null || true)"

  if [[ ! "$PM2_PID" =~ ^[1-9][0-9]*$ ]]; then
    echo "PM2 process stopped before deployment verification completed: $app_name"
    pm2 describe "$app_name" || true
    exit 1
  fi
done

log "Saving PM2 process list"
run_with_timeout 1m pm2 save

log "PM2 status"
pm2 status "$PM2_WEB_APP_NAME" "$PM2_WORKER_APP_NAME" "$PM2_INFERENCE_APP_NAME"

log "Deployment completed successfully"
