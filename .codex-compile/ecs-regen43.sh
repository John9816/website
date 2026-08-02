#!/usr/bin/env bash
set -euo pipefail
/usr/local/bin/update-cf || true
sleep 5
# wait for port
for i in $(seq 1 30); do
  if curl -sS -m 2 -o /dev/null -w '' http://127.0.0.1:8090/ 2>/dev/null || ss -lntp | grep -q ':8090'; then
    code=$(curl -sS -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:8090/ || true)
    echo "ready attempt $i code=$code"
    break
  fi
  sleep 1
done
ss -lntp | grep 8090 || true
journalctl -u website-java-api -n 5 --no-pager | tail -5

# find admin token or use internal endpoint
# try regenerate via content factory API with a stored token if any
TOKEN=$(mysql -N website_java -e "SELECT token FROM admin_session ORDER BY id DESC LIMIT 1;" 2>/dev/null || true)
if [[ -z "${TOKEN:-}" ]]; then
  TOKEN=$(mysql -N website_java -e "SELECT value FROM sys_config WHERE config_key='admin.apiToken' LIMIT 1;" 2>/dev/null || true)
fi
echo "token_present=$([ -n "${TOKEN:-}" ] && echo yes || echo no)"

# Look for how regenerate is called - use regenerate endpoint
# Common pattern: POST /api/admin/content/articles/43/regenerate
BODY='{"length":"standard","generateCover":true}'
for path in \
  "/api/admin/content/articles/43/regenerate" \
  "/api/admin/content-factory/articles/43/regenerate" \
  "/admin/api/content/articles/43/regenerate"
do
  code=$(curl -sS -m 10 -o /tmp/regen-try.json -w '%{http_code}' \
    -X POST "http://127.0.0.1:8090${path}" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TOKEN:-}" \
    -H "X-Admin-Token: ${TOKEN:-}" \
    -d "$BODY" || true)
  echo "try $path -> $code"
  head -c 200 /tmp/regen-try.json; echo
  if [[ "$code" == "200" || "$code" == "202" ]]; then
    break
  fi
done

# Poll article state for up to 8 minutes
for i in $(seq 1 48); do
  mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen, LEFT(risk_tips_json,280) risk FROM content_article WHERE id=43;"
  risk=$(mysql -N website_java -e "SELECT risk_tips_json FROM content_article WHERE id=43;")
  if echo "$risk" | grep -q 'local template fallback'; then
    echo "still_template iter=$i"
  elif echo "$risk" | grep -q 'AI writer failed'; then
    echo "still_failed iter=$i"
  else
    # if no fallback markers, check length
    clen=$(mysql -N website_java -e "SELECT CHAR_LENGTH(content_markdown) FROM content_article WHERE id=43;")
    if [[ "${clen:-0}" -gt 1500 ]]; then
      echo "possible_success clen=$clen"
      break
    fi
  fi
  sleep 10
done
mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen, LEFT(title,60) title, LEFT(risk_tips_json,500) risk FROM content_article WHERE id=43\G"
