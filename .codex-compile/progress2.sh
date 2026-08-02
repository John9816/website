#!/bin/bash
mysql -N website_java -e "SELECT id,status,model,quality_score,updated_at,LEFT(title,50) FROM content_article ORDER BY id DESC LIMIT 3;"
echo "---"
TOKEN=$(cat /tmp/admin.token 2>/dev/null)
if [ -n "$TOKEN" ]; then
  # try last known job ids from logs if any
  for JOB in content-generate-998d6e974bf74f35bee46b0aa4888b63 content-generate-fca02d0aeffb49cfa6a4c71375bdbc39; do
    R=$(curl -sS -m 8 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8090/api/admin/content/automation/run/$JOB" 2>/dev/null)
    python3 -c 'import json,sys;d=json.loads(sys.argv[1]);x=d.get("data")or{};print(sys.argv[2],x.get("status"),x.get("stage"),x.get("stageLabel"))' "$R" "$JOB" 2>/dev/null
  done
fi
# check if any content-agent job threads
ps -ef | grep -E 'content-agent|website.jar' | grep -v grep | head -5
curl -sS -m 8 -o /dev/null -w "tunnel_models=%{http_code}\n" -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" http://127.0.0.1:18787/v1/models