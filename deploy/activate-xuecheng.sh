#!/usr/bin/env bash
# Activate a staged frontend release, preserving the running backend and Nginx.
set -Eeuo pipefail
RELEASE_ID="${1:?Usage: activate-xuecheng.sh RELEASE_ID}"
case "$RELEASE_ID" in *[!A-Za-z0-9._-]*|.|..) exit 2 ;; esac
[ "$(id -u)" -eq 0 ]
APP_ROOT=/opt/website
RELEASE="$APP_ROOT/releases/$RELEASE_ID"
OLD="$(readlink -f "$APP_ROOT/current")"
BACKUP="$APP_ROOT/backups/$RELEASE_ID"
DROPIN=/etc/systemd/system/website-ecs.service.d/xuecheng.conf
EDITOR_ENV="$APP_ROOT/xuecheng.env"
[ -f "$RELEASE/frontend/dist/index.html" ]
[ -f "$RELEASE/meta/release.env" ]
[ -f "$OLD/backend/website.jar" ]
[ ! -e "$RELEASE/backend" ]
[ ! -e "$BACKUP" ]
exec 9>"$APP_ROOT/.deploy.lock"
flock -n 9
node --check "$RELEASE/frontend/server/ecs-server.mjs"
node --check "$RELEASE/frontend/server/xuecheng/index.mjs"
install -d -m 700 "$BACKUP"
cp "$OLD/meta/release.env" "$BACKUP/previous-release.env"
systemctl cat website-ecs > "$BACKUP/website-ecs.service.txt"
printf '%s\n' "$OLD" > "$BACKUP/previous-release.path"
[ ! -f "$DROPIN" ] || cp "$DROPIN" "$BACKUP/xuecheng.conf"
[ ! -f "$EDITOR_ENV" ] || cp "$EDITOR_ENV" "$BACKUP/xuecheng.env"

candidate_pid=''
switched=false
config_changed=false
cleanup() {
  status=$?
  trap - EXIT
  if [ -n "$candidate_pid" ]; then
    kill "$candidate_pid" 2>/dev/null || true
    wait "$candidate_pid" 2>/dev/null || true
  fi
  if [ "$status" -ne 0 ]; then
    if [ "$config_changed" = true ]; then
      if [ -f "$BACKUP/xuecheng.conf" ]; then cp "$BACKUP/xuecheng.conf" "$DROPIN"; else rm -f "$DROPIN"; fi
      if [ -f "$BACKUP/xuecheng.env" ]; then cp "$BACKUP/xuecheng.env" "$EDITOR_ENV"; else rm -f "$EDITOR_ENV"; fi
      systemctl daemon-reload
    fi
    if [ "$switched" = true ]; then
      ln -sfn "$OLD" "$APP_ROOT/current.next"
      mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
      systemctl restart website-ecs
      echo "Activation failed; restored $OLD" >&2
    fi
  fi
  exit "$status"
}
trap cleanup EXIT

cp -a "$OLD/backend" "$RELEASE/backend"
cp -a "$OLD/ops" "$RELEASE/ops"
cp "$RELEASE/xuecheng-ops/"* "$RELEASE/ops/"
# Existing browser tabs may still request a previous release's hashed chunks.
cp -an "$OLD/frontend/dist/assets/." "$RELEASE/frontend/dist/assets/"
cmp "$OLD/backend/website.jar" "$RELEASE/backend/website.jar"
install -d -m 700 "$APP_ROOT/shared/xuecheng"
# Keep the MCP home separate: nobody must not traverse private document storage.
install -d -o nobody -g nogroup -m 700 /var/lib/website-xuecheng-mcp
install -d -m 755 /etc/systemd/system/website-ecs.service.d
config_changed=true
umask 077
cat > "$EDITOR_ENV" <<EOF
EDITOR_DATA_DIR=/opt/website/shared/xuecheng
EDITOR_MCP_HOME=/var/lib/website-xuecheng-mcp
EDITOR_MCP_UID=$(id -u nobody)
EDITOR_MCP_GID=$(id -g nobody)
EOF
cat > "$DROPIN" <<EOF
[Service]
EnvironmentFile=/opt/website/xuecheng.env
EOF

# Start the actual artifact on an unused loopback port before changing current.
if [ -n "$(ss -ltnH 'sport = :3002')" ]; then
  echo 'Candidate port 3002 is occupied' >&2
  exit 1
fi
HOST=127.0.0.1 PORT=3002 BACKEND_URL=http://127.0.0.1:8090 \
  DIST_DIR="$RELEASE/frontend/dist" EDITOR_DATA_DIR="$APP_ROOT/shared/xuecheng" \
  node "$RELEASE/frontend/server/ecs-server.mjs" > "$BACKUP/candidate.log" 2>&1 &
candidate_pid=$!
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:3002/healthz >/dev/null 2>&1; then break; fi
  kill -0 "$candidate_pid"
  [ "$attempt" -lt 20 ]
  sleep 1
done
curl -fsS --max-time 10 http://127.0.0.1:3002/editor/ >/dev/null
curl -fsS --max-time 10 http://127.0.0.1:3002/api/public/nav >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3002/editor/api/docs)" = 401 ]
kill "$candidate_pid"
wait "$candidate_pid"
candidate_pid=''
[ "$(readlink -f "$APP_ROOT/current")" = "$OLD" ]

{
  awk '/^BACKEND_SHA=/' "$OLD/meta/release.env"
  printf 'BACKEND_JAR_SHA256=%s\n' "$(sha256sum "$RELEASE/backend/website.jar" | cut -d' ' -f1)"
  printf 'BACKEND_REUSED_FROM=%s\nPREVIOUS_RELEASE=%s\n' "$OLD" "$OLD"
  printf 'EDITOR_DATA_DIR=%s\n' "$APP_ROOT/shared/xuecheng"
} >> "$RELEASE/meta/release.env"
systemctl daemon-reload
ln -sfn "$OLD" "$APP_ROOT/previous"
ln -sfn "$RELEASE" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
switched=true
systemctl restart website-ecs
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 2 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then break; fi
  [ "$attempt" -lt 20 ]
  sleep 1
done
curl -fsS --max-time 10 http://127.0.0.1:8090/health >/dev/null
curl -fsS --max-time 10 http://127.0.0.1:3000/api/public/nav >/dev/null
[ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/editor/api/docs)" = 401 ]
systemctl is-active --quiet website-ecs website-api nginx
printf 'ACTIVATED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$RELEASE/meta/release.env"
echo "Activated $RELEASE"
echo "Rollback: $OLD"
