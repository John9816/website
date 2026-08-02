#!/bin/bash
ss -lntp | grep 18787 || echo NO_TUNNEL
TOKEN=$(cat /tmp/admin.token)
curl -sS -m 15 -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8090/api/admin/content/automation/run/content-generate-444f80037fd547ce9cd75a897f3a6b09 \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);x=d.get("data")or{};print(x.get("status"),x.get("stage"),x.get("stageLabel"),str(x.get("error") or "")[:200]); print("articleId", (x.get("result") or x.get("article") or {}).get("id") if isinstance(x.get("result") or x.get("article"), dict) else x.get("result"))'
mysql -N website_java -e "SELECT id,status,model,quality_score,LEFT(IFNULL(error_message,''),120) FROM content_article ORDER BY id DESC LIMIT 3;"
mysql -N website_java -e "SELECT id, LEFT(risk_tips_json,250) FROM content_article ORDER BY id DESC LIMIT 1;"