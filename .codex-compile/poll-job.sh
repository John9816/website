#!/bin/bash
TOKEN=$(cat /tmp/admin.token)
JOB=content-generate-444f80037fd547ce9cd75a897f3a6b09
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
  RESP=$(curl -sS -m 15 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8090/api/admin/content/automation/run/$JOB")
  STATUS=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); data=d.get("data") or {}; print(data.get("status"), data.get("stage"), data.get("stageLabel"), data.get("error") or "")' "$RESP")
  echo "[$i] $STATUS"
  echo "$STATUS" | grep -Eq 'SUCCEEDED|FAILED|COMPLETED|success|failed|ERROR' && echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); import pprint; data=d.get("data") or {}; print("keys",data.keys()); r=data.get("result") or data.get("article") or {}; print("result_type",type(r).__name__); print(str(r)[:800] if not isinstance(r,dict) else {k:r.get(k) for k in list(r)[:20]})' && break
  sleep 10
done
mysql -N website_java -e "SELECT id, status, model, quality_score, LEFT(IFNULL(error_message,''),120), LEFT(risk_tips_json,200) FROM content_article ORDER BY id DESC LIMIT 3;"