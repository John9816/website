#!/bin/bash
TOKEN=$(cat /tmp/admin.token)
JOB=content-generate-444f80037fd547ce9cd75a897f3a6b09
for i in $(seq 1 24); do
  RESP=$(curl -sS -m 20 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8090/api/admin/content/automation/run/$JOB")
  python3 - <<PY
import json
d=json.loads('''$RESP'''.replace("'''","'"))
PY
  STATUS=$(python3 -c 'import json,sys; d=json.loads(sys.argv[1]); x=d.get("data") or {}; print(x.get("status"), x.get("stage"), x.get("stageLabel") or "", str(x.get("error") or "")[:160])' "$RESP")
  echo "[$i] $STATUS"
  case "$STATUS" in
    SUCCEEDED*|FAILED*|COMPLETED*|SUCCESS*|ERROR*)
      echo "$RESP" > /tmp/job-final.json
      python3 -c 'import json;d=json.load(open("/tmp/job-final.json"));x=d.get("data")or{};print(json.dumps({k:x.get(k) for k in x if k!="result"}, ensure_ascii=False)[:500]); r=x.get("result");
print("result", type(r).__name__, (json.dumps(r,ensure_ascii=False)[:600] if r is not None else None))'
      break
      ;;
  esac
  sleep 15
done
mysql -N website_java -e "SELECT id,status,model,quality_score,LEFT(IFNULL(error_message,''),140) FROM content_article ORDER BY id DESC LIMIT 3;"
mysql -N website_java -e "SELECT id, LEFT(risk_tips_json,300) FROM content_article ORDER BY id DESC LIMIT 1;"