#!/bin/bash
set -e
# ensure cf pin healthy
bash /usr/local/bin/update-cf || true
code=$(curl -4 -sS -m 120 -o /tmp/fufu_ok.out -w "%{http_code}" -X POST https://fufu.iqach.top/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"用中文写80字公众号开篇，主题：普通人用AI提效。只输出正文。"}],"max_tokens":400}')
echo content_http=$code
python3 -c 'import json;d=json.load(open("/tmp/fufu_ok.out"));m=(d.get("choices") or [{}])[0].get("message") or {};c=m.get("content");print("len",len(c) if isinstance(c,str) else None);print((c or str(d))[:300])'
# login + generate async
LOGIN=$(curl -sS -m 15 -X POST http://127.0.0.1:8090/api/auth/login -H "Content-Type: application/json" -d '{"username":"codex_verify_0718","password":"CodexVerify0718!"}')
TOKEN=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["data"]["token"])' "$LOGIN")
echo "$TOKEN" > /tmp/admin.token
RESP=$(curl -sS -m 30 -X POST http://127.0.0.1:8090/api/admin/content/articles/generate-async \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"topic":"普通人用AI提效，先改这三处习惯","category":"职场成长"}')
echo "job=$RESP"
JOB=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1])["data"]["jobId"])' "$RESP")
for i in $(seq 1 50); do
  R=$(curl -sS -m 20 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8090/api/admin/content/automation/run/$JOB")
  ST=$(python3 -c 'import json,sys;x=json.loads(sys.argv[1]).get("data")or{};print(x.get("status"),x.get("stage"),x.get("stageLabel")or"",str(x.get("error")or"")[:100])' "$R")
  echo "[$i] $ST"
  case "$ST" in
    SUCCESS*|SUCCEEDED*|FAILED*|ERROR*|COMPLETED*) break ;;
  esac
  sleep 15
done
mysql -N website_java -e "SELECT id,status,model,quality_score,LEFT(IFNULL(error_message,''),120),LEFT(title,40) FROM content_article ORDER BY id DESC LIMIT 2;"
mysql -N website_java -e "SELECT id, (risk_tips_json LIKE '%fallback was used%' OR risk_tips_json LIKE '%本地模板%') AS fb, CHAR_LENGTH(content_markdown) FROM content_article ORDER BY id DESC LIMIT 1;"
mysql -N website_java -e "SELECT LEFT(content_markdown,220) FROM content_article ORDER BY id DESC LIMIT 1;"
mysql -N website_java -e "SELECT LEFT(risk_tips_json,280) FROM content_article ORDER BY id DESC LIMIT 1;"