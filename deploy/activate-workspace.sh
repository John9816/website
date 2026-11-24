#!/usr/bin/env bash
# Activate frontend and backend together, keeping existing service config and data.
set -Eeuo pipefail
RELEASE_ID="${1:?Usage: activate-workspace.sh RELEASE_ID}"
case "$RELEASE_ID" in *[!A-Za-z0-9._-]*|.|..) exit 2 ;; esac
[ "$(id -u)" -eq 0 ]
APP_ROOT=/opt/website
RELEASE="$APP_ROOT/releases/$RELEASE_ID"
OLD="$(readlink -f "$APP_ROOT/current")"
BACKUP="$APP_ROOT/backups/$RELEASE_ID"
[ -f "$RELEASE/frontend/dist/index.html" ]
[ -f "$RELEASE/backend/website.jar" ]
[ -f "$RELEASE/meta/release.env" ]
[ ! -e "$BACKUP" ]
exec 9>"$APP_ROOT/.deploy.lock"
flock -n 9
node --check "$RELEASE/frontend/server/ecs-server.mjs"
node --check "$RELEASE/frontend/server/xuecheng/index.mjs"
install -d -m 700 "$BACKUP"
printf '%s\n' "$OLD" > "$BACKUP/previous-release.path"
cp "$OLD/meta/release.env" "$BACKUP/previous-release.env"
cp -a "$OLD/ops" "$RELEASE/ops"
cp "$RELEASE/workspace-ops/"* "$RELEASE/ops/"
ln -s /opt/website/shared/uploads "$RELEASE/backend/uploads"
# Keep hashed chunks for already-open browser tabs.
cp -an "$OLD/frontend/dist/assets/." "$RELEASE/frontend/dist/assets/"
candidate_pid=''
switched=false
cleanup() {
  status=$?
  trap - EXIT
  if [ -n "$candidate_pid" ]; then
    kill "$candidate_pid" 2>/dev/null || true
    wait "$candidate_pid" 2>/dev/null || true
  fi
  if [ "$status" -ne 0 ] && [ "$switched" = true ]; then
    ln -sfn "$OLD" "$APP_ROOT/current.next"
    mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    systemctl restart website-api website-ecs
    echo "Activation failed; restored $OLD" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
wait_health() {
  for attempt in $(seq 1 60); do
    if curl -fsS --max-time 2 "$1" >/dev/null 2>&1; then return; fi
    sleep 1
  done
  return 1
}
[ -z "$(ss -ltnH 'sport = :3002')" ]
HOST=127.0.0.1 PORT=3002 BACKEND_URL=http://127.0.0.1:8090 \
  DIST_DIR="$RELEASE/frontend/dist" EDITOR_DATA_DIR="$APP_ROOT/shared/xuecheng" \
  node "$RELEASE/frontend/server/ecs-server.mjs" > "$BACKUP/candidate.log" 2>&1 &
candidate_pid=$!
wait_health http://127.0.0.1:3002/healthz
curl -fsS --max-time 10 http://127.0.0.1:3002/editor/ >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/kb/share/retired)" = 410 ]
kill "$candidate_pid"
wait "$candidate_pid" || true
candidate_pid=''
[ "$(readlink -f "$APP_ROOT/current")" = "$OLD" ]
printf 'PREVIOUS_RELEASE=%s\n' "$OLD" >> "$RELEASE/meta/release.env"
ln -sfn "$OLD" "$APP_ROOT/previous"
ln -sfn "$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
switched=true
systemctl restart website-api
wait_health http://127.0.0.1:8090/health
systemctl restart website-ecs
wait_health http://127.0.0.1:3000/healthz
curl -fsS --max-time 10 http://127.0.0.1:3000/api/public/nav >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/api/public/kb/share/retired)" = 410 ]
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/api/user/kb/docs)" = 410 ]
[ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/editor/api/docs)" = 401 ]
systemctl is-active --quiet website-api website-ecs nginx
printf 'ACTIVATED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$RELEASE/meta/release.env"
echo "Activated $RELEASE"
echo "Rollback: $OLD"
