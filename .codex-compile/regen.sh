#!/bin/bash
set -e
# verify tunnel first
curl -sS -m 15 -o /dev/null -w "models=%{http_code}\n" -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" http://127.0.0.1:18787/v1/models
TOKEN=$(cat /tmp/admin.token)
# refresh token if needed
if [ ${#TOKEN} -lt 20 ]; then
  LOGIN=$(curl -sS -m 15 -X POST http://127.0.0.1:8090/api/auth/login -H "Content-Type: application/json" -d '{"username":"codex_verify_0718","password":"CodexVerify0718!"}')
  TOKEN=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["data"]["token"])' "$LOGIN")
  echo "$TOKEN" > /tmp/admin.token
fi
RESP=$(curl -sS -m 30 -X POST http://127.0.0.1:8090/api/admin/content/articles/generate-async \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"topic":"普通人用AI提效，先改这三处习惯","category":"职场成长"}')
echo "job=$RESP"
JOB=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["data"]["jobId"])' "$RESP")
echo "JOB=$JOB"
for i in $(seq 1 40); do
  R=$(curl -sS -m 20 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8090/api/admin/content/automation/run/$JOB")
  ST=$(python3 -c 'import json,sys;x=json.loads(sys.argv[1]).get("data")or{};print(x.get("status"),x.get("stage"),x.get("stageLabel")or"",str(x.get("error")or"")[:120])' "$R")
  echo "[$i] $ST"
  case "$ST" in
    SUCCESS*|SUCCEEDED*|FAILED*|ERROR*|COMPLETED*)
      echo "$R" > /tmp/job2-final.json
      break
      ;;
  esac
  # keep tunnel warm
  curl -sS -m 5 -o /dev/null http://127.0.0.1:18787/v1/models -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" || echo tunnel_down
  sleep 12
done
mysql -N website_java -e "SELECT id,status,model,quality_score,LEFT(IFNULL(error_message,''),140),LEFT(title,50) FROM content_article ORDER BY id DESC LIMIT 2;"
echo RISK
mysql -N website_java -e "SELECT id, (risk_tips_json LIKE '%local template%' OR risk_tips_json LIKE '%本地模板%' OR risk_tips_json LIKE '%fallback%') AS is_fallback, LEFT(risk_tips_json,280) FROM content_article ORDER BY id DESC LIMIT 1;"
mysql -N website_java -e "SELECT id, CHAR_LENGTH(content_markdown) FROM content_article ORDER BY id DESC LIMIT 1;"