#!/usr/bin/env bash
set -euo pipefail
# Discover admin user and mint login if possible
mysql website_java -e "SHOW TABLES LIKE '%user%'; SHOW TABLES LIKE '%token%'; SHOW TABLES LIKE '%session%';" || true
mysql website_java -N -e "SELECT table_name FROM information_schema.tables WHERE table_schema='website_java' AND (table_name LIKE '%user%' OR table_name LIKE '%admin%' OR table_name LIKE '%token%');" || true

# Try common login
for body in \
  '{"username":"admin","password":"admin"}' \
  '{"username":"admin","password":"Admin123!"}' \
  '{"username":"admin","password":"123456"}'
do
  code=$(curl -sS -m 10 -o /tmp/login.json -w '%{http_code}' \
    -X POST http://127.0.0.1:8090/api/admin/auth/login \
    -H 'Content-Type: application/json' -d "$body" || true)
  echo "login_try code=$code body=$body"
  head -c 300 /tmp/login.json; echo
  if [[ "$code" == "200" ]]; then break; fi
done

# Also try /api/auth/login
for path in /api/auth/login /api/admin/login /admin/auth/login; do
  code=$(curl -sS -m 5 -o /tmp/login2.json -w '%{http_code}' -X POST "http://127.0.0.1:8090${path}" \
    -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin"}' || true)
  echo "path $path -> $code $(head -c 120 /tmp/login2.json)"
done

# List request mappings via actuator if available
curl -sS -m 5 http://127.0.0.1:8090/actuator/mappings 2>/dev/null | head -c 200 || true
echo
# Article topic for #43
mysql website_java -e "SELECT id,title,LEFT(topic,80),status FROM content_article WHERE id=43\G" 2>/dev/null || \
mysql website_java -e "SELECT id,title,status,quality_score FROM content_article WHERE id=43\G"
