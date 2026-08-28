#!/usr/bin/env bash
set -Eeuo pipefail

# Resolve the RSSMonster root directory from this script's location.
APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$APP_DIR/server"
CLIENT_DIR="$APP_DIR/client"
INFERENCE_DIR="$APP_DIR/inference"
ENV_FILE="$SERVER_DIR/.env"
INFERENCE_ENV_FILE="$INFERENCE_DIR/.env"

PM2_WEB_APP_NAME="rssmonster-web"
PM2_WORKER_APP_NAME="rssmonster-worker"
PM2_AI_WORKER_APP_NAME="rssmonster-ai-worker"
PM2_INFERENCE_APP_NAME="rssmonster-inference"
PM2_APP_NAMES=(
  "$PM2_WEB_APP_NAME"
  "$PM2_WORKER_APP_NAME"
  "$PM2_AI_WORKER_APP_NAME"
  "$PM2_INFERENCE_APP_NAME"
)
OBSOLETE_PM2_APP_NAME="rssmonster-dev"
ECOSYSTEM_FILE="$APP_DIR/ecosystem.config.cjs"

DEPLOY_LOCK="$APP_DIR/.deploy.lock"
DEPLOY_LOG="$APP_DIR/deploy.log"
DEPLOY_ID="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
PM2_MUTATED=false

HEALTHCHECK_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-30}"
HEALTHCHECK_INTERVAL_SECONDS="${HEALTHCHECK_INTERVAL_SECONDS:-2}"
INFERENCE_HEALTHCHECK_ATTEMPTS="${INFERENCE_HEALTHCHECK_ATTEMPTS:-$HEALTHCHECK_ATTEMPTS}"
INFERENCE_HEALTHCHECK_INTERVAL_SECONDS="${INFERENCE_HEALTHCHECK_INTERVAL_SECONDS:-$HEALTHCHECK_INTERVAL_SECONDS}"

exec > >(tee -a "$DEPLOY_LOG") 2>&1

log() {
  printf '\n[%s] [deployment %s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$DEPLOY_ID" "$*"
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
  local env_file="${3:-$ENV_FILE}"
  local value

  if [[ ! -f "$env_file" ]]; then
    printf '%s' "$default_value"
    return
  fi

  value="$(sed -n -e "s/^[[:space:]]*export[[:space:]]\+$key[[:space:]]*=[[:space:]]*//p" -e "s/^[[:space:]]*$key[[:space:]]*=[[:space:]]*//p" "$env_file" | tail -n 1)"
  value="${value%$'\r'}"
  value="${value%%[[:space:]]#*}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "${value:-$default_value}"
}

inspect_pm2_snapshot() {
  local snapshot="$1"
  local mode="$2"

  PM2_SNAPSHOT="$snapshot" node - "$mode" "${PM2_APP_NAMES[@]}" <<'NODE'
const [mode, ...expectedNames] = process.argv.slice(2);
let processes;
try {
  processes = JSON.parse(process.env.PM2_SNAPSHOT || '[]');
} catch (error) {
  console.error(`Unable to parse PM2 process list: ${error.message}`);
  process.exit(2);
}
const byName = new Map(processes.map(process => [process.name, process]));
const details = expectedNames.map(name => {
  const process = byName.get(name);
  return {
    name,
    status: process?.pm2_env?.status || 'missing',
    pid: Number.isInteger(process?.pid) && process.pid > 0 ? process.pid : '-'
  };
});
if (mode === 'status' || mode === 'verify') {
  for (const detail of details) {
    console.log(`${detail.name}: status=${detail.status} pid=${detail.pid}`);
  }
  process.exit(mode === 'verify' && details.some(detail => detail.status !== 'online') ? 1 : 0);
}
if (mode === 'non-online') {
  for (const detail of details.filter(detail => detail.status !== 'online')) {
    console.log(detail.name);
  }
  process.exit(0);
}
console.error(`Unknown PM2 snapshot inspection mode: ${mode}`);
process.exit(2);
NODE
}

get_pm2_snapshot() {
  pm2 jlist
}

log_pm2_state() {
  local label="$1"
  local snapshot
  echo
  echo "$(date -Iseconds) [deployment $DEPLOY_ID] PM2 state: $label"
  if ! snapshot="$(get_pm2_snapshot)"; then
    echo "Unable to read PM2 process list."
    return 1
  fi
  inspect_pm2_snapshot "$snapshot" status
}

verify_pm2_apps_online() {
  local snapshot
  if ! snapshot="$(get_pm2_snapshot)"; then
    echo "Unable to read PM2 process list."
    return 1
  fi
  if inspect_pm2_snapshot "$snapshot" verify; then
    return 0
  fi
  echo "One or more required PM2 applications are missing or not online."
  return 1
}

is_pm2_app_online() {
  local expected_app="$1"
  local snapshot
  snapshot="$(get_pm2_snapshot)" || return 1
  PM2_SNAPSHOT="$snapshot" node - "$expected_app" <<'NODE'
const expectedName = process.argv[2];
const processes = JSON.parse(process.env.PM2_SNAPSHOT || '[]');
const matchedProcess = processes.find(candidate => candidate.name === expectedName);
process.exit(matchedProcess?.pm2_env?.status === 'online' ? 0 : 1);
NODE
}

pm2_app_exists() {
  local expected_app="$1"
  local snapshot
  snapshot="$(get_pm2_snapshot)" || return 1
  PM2_SNAPSHOT="$snapshot" node - "$expected_app" <<'NODE'
const expectedName = process.argv[2];
const processes = JSON.parse(process.env.PM2_SNAPSHOT || '[]');
process.exit(processes.some(candidate => candidate.name === expectedName) ? 0 : 1);
NODE
}

run_pm2_mutation() {
  local description="$1"
  local duration="$2"
  shift 2
  log_pm2_state "before $description"
  echo "$(date -Iseconds) [deployment $DEPLOY_ID] PM2 mutation started: $description"
  # The command may partially mutate PM2 before returning an error.
  PM2_MUTATED=true
  run_with_timeout "$duration" "$@"
  echo "$(date -Iseconds) [deployment $DEPLOY_ID] PM2 mutation completed: $description"
  log_pm2_state "after $description"
}

recover_pm2_apps() {
  local snapshot
  local app_name
  local recovery_failed=false

  echo
  echo "Attempting best-effort PM2 recovery without restarting healthy applications."
  if ! snapshot="$(get_pm2_snapshot)"; then
    echo "Unable to inspect PM2 state for recovery."
    return 1
  fi

  while IFS= read -r app_name; do
    [[ -n "$app_name" ]] || continue
    if is_pm2_app_online "$app_name"; then
      echo "PM2 application recovered before intervention; leaving it running: $app_name"
      continue
    fi
    log_pm2_state "before recovery of $app_name" || true
    echo "$(date -Iseconds) [deployment $DEPLOY_ID] Recovering PM2 application: $app_name"
    if ! run_with_timeout 20m pm2 startOrReload "$ECOSYSTEM_FILE" --only "$app_name" --env production --update-env; then
      echo "PM2 recovery command failed for: $app_name"
      recovery_failed=true
    fi
    log_pm2_state "after recovery of $app_name" || true
  done < <(inspect_pm2_snapshot "$snapshot" non-online)

  if [[ "$recovery_failed" == true ]] || ! verify_pm2_apps_online; then
    echo "PM2 recovery did not restore every required application."
    return 1
  fi
  echo "All required PM2 applications are online after recovery."
  if ! run_with_timeout 1m pm2 save; then
    echo "PM2 recovery succeeded, but saving the PM2 process list failed."
  fi
}

on_error() {
  local exit_code="${1:-$?}"
  local failure_context="${2:-at line ${BASH_LINENO[0]:-unknown}}"
  trap - ERR INT TERM
  set +e
  log "Deployment failed with exit code $exit_code $failure_context"

  if command -v pm2 >/dev/null 2>&1; then
    log_pm2_state "failure diagnostics" || true
    echo
    echo "Current PM2 status:"
    pm2 describe "$PM2_WEB_APP_NAME" || true
    pm2 describe "$PM2_WORKER_APP_NAME" || true
    pm2 describe "$PM2_AI_WORKER_APP_NAME" || true
    pm2 describe "$PM2_INFERENCE_APP_NAME" || true
    echo
    echo "Recent PM2 logs:"
    pm2 logs "$PM2_WEB_APP_NAME" --lines 50 --nostream || true
    pm2 logs "$PM2_WORKER_APP_NAME" --lines 50 --nostream || true
    pm2 logs "$PM2_AI_WORKER_APP_NAME" --lines 50 --nostream || true
    pm2 logs "$PM2_INFERENCE_APP_NAME" --lines 50 --nostream || true

    if [[ "$PM2_MUTATED" == true ]]; then
      recover_pm2_apps || true
    fi
  fi
  exit "$exit_code"
}

on_signal() {
  local signal_name="$1"
  local exit_code="$2"
  on_error "$exit_code" "after receiving $signal_name"
}

inference_changed_between() {
  local old_revision="$1"
  local new_revision="$2"
  local diff_exit_code

  if [[ -z "$old_revision" || -z "$new_revision" ]]; then
    echo "Unable to identify both deployment revisions; inference will be reloaded."
    return 0
  fi
  if ! git cat-file -e "$old_revision^{commit}" 2>/dev/null ||
    ! git cat-file -e "$new_revision^{commit}" 2>/dev/null; then
    echo "A deployment revision is not available locally; inference will be reloaded."
    return 0
  fi
  if git diff --quiet "$old_revision" "$new_revision" -- inference/ ecosystem.config.cjs; then
    return 1
  else
    diff_exit_code=$?
  fi
  if ((diff_exit_code == 1)); then
    return 0
  fi
  echo "Unable to compare inference revisions safely; inference will be reloaded."
  return 0
}

trap 'on_error $?' ERR
trap 'on_signal INT 130' INT
trap 'on_signal TERM 143' TERM

require_command flock
# Keep the lock file itself for observability; flock releases the lock when this process exits.
exec {DEPLOY_LOCK_FD}>"$DEPLOY_LOCK"
if ! flock -n "$DEPLOY_LOCK_FD"; then
  echo "Another deployment is already active."
  echo "Lock file: $DEPLOY_LOCK"
  exit 1
fi

log "Deployment started"
echo "Deployment ID: $DEPLOY_ID"
echo "Deployment PID: $$"
echo "Application directory: $APP_DIR"

require_command git
require_command npm
require_command node
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

if [[ ! -f "$INFERENCE_ENV_FILE" ]]; then
  echo "Inference environment file does not exist: $INFERENCE_ENV_FILE"
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
if [[ ! "$SERVER_PORT" =~ ^[0-9]+$ ]] || ((SERVER_PORT < 1 || SERVER_PORT > 65535)); then
  echo "Invalid PORT value in $ENV_FILE: $SERVER_PORT"
  exit 1
fi

# A server may bind to all interfaces, but curl needs a concrete address.
case "$SERVER_HOST" in
  0.0.0.0 | "::" | "[::]") HEALTHCHECK_HOST="127.0.0.1" ;;
  *) HEALTHCHECK_HOST="$SERVER_HOST" ;;
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

INFERENCE_HOST="$(read_env_value INFERENCE_HOST "" "$INFERENCE_ENV_FILE")"
INFERENCE_PORT="$(read_env_value INFERENCE_PORT "" "$INFERENCE_ENV_FILE")"
INFERENCE_EMBEDDING_PROVIDER="$(read_env_value EMBEDDING_PROVIDER "" "$INFERENCE_ENV_FILE")"
if [[ -z "$INFERENCE_HOST" ]]; then
  echo "INFERENCE_HOST is not configured in $INFERENCE_ENV_FILE"
  exit 1
fi
if [[ -z "$INFERENCE_PORT" ]]; then
  echo "INFERENCE_PORT is not configured in $INFERENCE_ENV_FILE"
  exit 1
fi
if [[ -z "$INFERENCE_EMBEDDING_PROVIDER" ]]; then
  echo "EMBEDDING_PROVIDER is not configured in $INFERENCE_ENV_FILE"
  exit 1
fi
if [[ ! "$INFERENCE_PORT" =~ ^[0-9]+$ ]] ||
  ((INFERENCE_PORT < 1 || INFERENCE_PORT > 65535)); then
  echo "Invalid INFERENCE_PORT value in $INFERENCE_ENV_FILE: $INFERENCE_PORT"
  exit 1
fi
case "$INFERENCE_HOST" in
  0.0.0.0 | "::" | "[::]") INFERENCE_HEALTHCHECK_HOST="127.0.0.1" ;;
  *) INFERENCE_HEALTHCHECK_HOST="$INFERENCE_HOST" ;;
esac
if [[ "$INFERENCE_HEALTHCHECK_HOST" == *:* &&
  "$INFERENCE_HEALTHCHECK_HOST" != \[*\] ]]; then
  INFERENCE_HEALTHCHECK_HOST="[$INFERENCE_HEALTHCHECK_HOST]"
fi
INFERENCE_HEALTHCHECK_URL="${INFERENCE_HEALTHCHECK_URL:-http://$INFERENCE_HEALTHCHECK_HOST:$INFERENCE_PORT/ready}"

echo "Server environment: $ENV_FILE"
echo "Server host: $SERVER_HOST"
echo "Server port: $SERVER_PORT"
echo "Health check: $HEALTHCHECK_URL"
echo "Inference environment: $INFERENCE_ENV_FILE"
echo "Inference host: $INFERENCE_HOST"
echo "Inference port: $INFERENCE_PORT"
echo "Inference health check: $INFERENCE_HEALTHCHECK_URL"

cd "$APP_DIR"
CURRENT_BRANCH="$(git branch --show-current)"
OLD_REVISION="$(git rev-parse --verify HEAD 2>/dev/null || true)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Unable to determine the current Git branch."
  exit 1
fi
echo "Current branch: $CURRENT_BRANCH"
echo "Starting Git revision: ${OLD_REVISION:-unknown}"

log "Resetting local changes"
run_with_timeout 1m git reset --hard HEAD
run_with_timeout 1m git clean -fd -e .env -e .deploy.lock -e server/.env -e client/.env -e inference/.env -e deploy.log

log "Fetching latest changes"
run_with_timeout 2m git fetch --prune origin
if ! git show-ref --verify --quiet "refs/remotes/origin/$CURRENT_BRANCH"; then
  echo "Remote branch does not exist: origin/$CURRENT_BRANCH"
  exit 1
fi
TARGET_REVISION="$(git rev-parse --verify "origin/$CURRENT_BRANCH^{commit}")"
echo "Target Git revision: $TARGET_REVISION"

log "Updating branch $CURRENT_BRANCH"
run_with_timeout 2m git reset --hard "origin/$CURRENT_BRANCH"
NEW_REVISION="$(git rev-parse --verify HEAD)"
if ! pm2_app_exists "$PM2_INFERENCE_APP_NAME"; then
  INFERENCE_CHANGED=true
  echo "Inference is not configured in PM2; dependencies will be installed and inference will be started."
elif inference_changed_between "$OLD_REVISION" "$NEW_REVISION"; then
  INFERENCE_CHANGED=true
  echo "Inference-relevant changes detected; inference will be reloaded."
else
  INFERENCE_CHANGED=false
  echo "Inference unchanged; its running process will be preserved."
fi

log "Installing server dependencies"
cd "$SERVER_DIR"
run_with_timeout 10m npm ci --no-audit --no-fund
log "Running database migrations"
run_with_timeout 10m npm run db
log "Installing client dependencies"
cd "$CLIENT_DIR"
run_with_timeout 10m npm ci --no-audit --no-fund
if [[ "$INFERENCE_CHANGED" == true ]]; then
  log "Installing inference dependencies"
  cd "$INFERENCE_DIR"
  run_with_timeout 10m npm ci --no-audit --no-fund
else
  log "Inference unchanged; skipping dependency installation"
fi

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

cd "$APP_DIR"
mkdir -p logs
log "Clearing PM2 logs"
run_with_timeout 1m pm2 flush
log "PM2 reload started for web, crawl worker, and AI worker"
run_pm2_mutation "reload web, crawl worker, and AI worker" 20m pm2 startOrReload "$ECOSYSTEM_FILE" --only "$PM2_WEB_APP_NAME,$PM2_WORKER_APP_NAME,$PM2_AI_WORKER_APP_NAME" --env production --update-env
log "PM2 reload completed for web, crawl worker, and AI worker"

if [[ "$INFERENCE_CHANGED" == true ]]; then
  log "PM2 reload started for inference"
  run_pm2_mutation "reload inference" 20m pm2 startOrReload "$ECOSYSTEM_FILE" --only "$PM2_INFERENCE_APP_NAME" --env production --update-env
  log "PM2 reload completed for inference"
elif ! is_pm2_app_online "$PM2_INFERENCE_APP_NAME"; then
  log "Inference is unchanged but not online; starting it from the ecosystem configuration"
  run_pm2_mutation "start missing or stopped inference" 20m pm2 startOrReload "$ECOSYSTEM_FILE" --only "$PM2_INFERENCE_APP_NAME" --env production --update-env
else
  log "Inference is unchanged and online; leaving it running"
fi

if ! verify_pm2_apps_online; then
  exit 1
fi

log "Health verification started for RSSMonster web"
HEALTHCHECK_PASSED=false
for ((attempt = 1; attempt <= HEALTHCHECK_ATTEMPTS; attempt++)); do
  if curl --silent --show-error --fail --max-time 5 "${HEALTHCHECK_CURL_OPTIONS[@]}" "$HEALTHCHECK_URL" >/dev/null; then
    HEALTHCHECK_PASSED=true
    break
  fi
  if ! is_pm2_app_online "$PM2_WEB_APP_NAME"; then
    echo "PM2 web process is not online."
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
log "Health verification completed for RSSMonster web"

log "Health verification started for inference"
INFERENCE_HEALTHCHECK_PASSED=false
for ((attempt = 1; attempt <= INFERENCE_HEALTHCHECK_ATTEMPTS; attempt++)); do
  INFERENCE_HEALTH_RESPONSE="$(
    curl --silent --show-error --fail --max-time 5 "$INFERENCE_HEALTHCHECK_URL" 2>/dev/null || true
  )"
  if INFERENCE_HEALTH_RESPONSE="$INFERENCE_HEALTH_RESPONSE" node <<'NODE'
const response = JSON.parse(process.env.INFERENCE_HEALTH_RESPONSE || '{}');
process.exit(
  response.status === 'ready' && response.state === 'ready' && response.acceptingWork === true
    ? 0
    : 1
);
NODE
  then
    INFERENCE_HEALTHCHECK_PASSED=true
    break
  fi
  if ! is_pm2_app_online "$PM2_INFERENCE_APP_NAME"; then
    echo "PM2 inference process is not online."
    break
  fi
  echo "Inference health check attempt $attempt/$INFERENCE_HEALTHCHECK_ATTEMPTS failed."
  sleep "$INFERENCE_HEALTHCHECK_INTERVAL_SECONDS"
done
if [[ "$INFERENCE_HEALTHCHECK_PASSED" != true ]]; then
  echo
  echo "Inference did not pass its health check:"
  echo "$INFERENCE_HEALTHCHECK_URL"
  pm2 describe "$PM2_INFERENCE_APP_NAME" || true
  pm2 logs "$PM2_INFERENCE_APP_NAME" --lines 100 --nostream || true
  exit 1
fi
log "Health verification completed for inference"

if ! verify_pm2_apps_online; then
  echo "A PM2 process stopped before deployment verification completed."
  exit 1
fi
log "Saving PM2 process list"
run_with_timeout 1m pm2 save
log_pm2_state "deployment completed"
log "Deployment completed successfully"
