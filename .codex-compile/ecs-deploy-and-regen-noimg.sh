#!/usr/bin/env bash
set -euo pipefail
cd /opt/website-java-api
if [[ -f website.jar.new ]]; then
  ts=$(date +%Y%m%d_%H%M%S)
  cp -a website.jar "website.jar.bak_${ts}"
  mv website.jar.new website.jar
  systemctl restart website-java-api
  sleep 10
fi
systemctl is-active website-java-api
/usr/local/bin/update-cf || true

# prefer models that work on fufu; allow 2 directed revisions for longer drafts
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2.5' WHERE config_key='ai.chat.defaultModel';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2.5,mimo-v2-flash,mimo-v2.5-pro' WHERE config_key='ai.chat.models';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2.5' WHERE config_key='content.writer.fallbackModels';"
mysql website_java -e "UPDATE sys_config SET config_value='2' WHERE config_key='content.review.maxRevisions';"
mysql website_java -e "SELECT config_key,config_value FROM sys_config WHERE config_key IN ('content.review.maxRevisions','ai.chat.defaultModel');"

SECRET_B64='G9JVnspxa0ONohqR2jhWgiSb/4jdDaW4mJUUUNWHO7fyZB3AwfJt5Kj81Q8vcajr'
TOKEN=$(python3 - <<PY
import base64, hmac, hashlib, json, time
secret = base64.b64decode("$SECRET_B64")
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
header = b64url(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",",":")).encode())
now = int(time.time())
payload = b64url(json.dumps({
  "sub":"1","username":"admin","role":"ADMIN","authVersion":0,
  "iat": now, "exp": now + 3600*12
}, separators=(",",":")).encode())
sig = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
print(f"{header}.{payload}.{b64url(sig)}")
PY
)

BODY=$(python3 - <<'PY'
import json
print(json.dumps({
  "topic": "普通人用AI提效，先改这三处习惯",
  "category": "growth",
  "length": "standard",
  "generateCover": False,
  "imageMode": "none",
  "researchEnabled": False,
  "autoWechatDraft": False,
  "model": "mimo-v2.5"
}, ensure_ascii=False))
PY
)
echo "BODY=$BODY"
code=$(curl -sS -m 30 -o /tmp/job.json -w '%{http_code}' \
  -X POST 'http://127.0.0.1:8090/api/admin/content/articles/generate-async' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$BODY")
echo "job_code=$code"
cat /tmp/job.json; echo
JOB=$(python3 - <<'PY'
import json
d=json.load(open('/tmp/job.json'))
data=d.get('data') or {}
print(data.get('jobId') or data.get('id') or '')
PY
)
echo "JOB=$JOB"

for i in $(seq 1 72); do
  curl -sS -m 15 -o /tmp/jobst.json \
    -H "Authorization: Bearer ${TOKEN}" \
    "http://127.0.0.1:8090/api/admin/content/automation/run/${JOB}" || true
  st=$(python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/jobst.json'))
  data=d.get('data') or {}
  print(data.get('status') or '', data.get('stage') or '', data.get('stageLabel') or '')
except Exception as e:
  print('parse_err', e)
PY
)
  echo "poll $i $st"
  if echo "$st" | grep -Eq 'SUCCESS|FAILED|DONE|COMPLETED'; then
    cat /tmp/jobst.json | head -c 800; echo
    break
  fi
  sleep 10
done

mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen,image_mode,LEFT(cover_image_url,40) cover,LEFT(title,50) title,updated_at FROM content_article ORDER BY id DESC LIMIT 3;"
echo "=== risk latest ==="
mysql website_java -N -e "SELECT id, LEFT(risk_tips_json,600) FROM content_article ORDER BY id DESC LIMIT 1;"
echo "=== template? ==="
mysql website_java -N -e "SELECT id, IF(risk_tips_json LIKE '%local template%','TEMPLATE','NO_TEMPLATE'), IF(risk_tips_json LIKE '%跳过封面%','SKIP_IMG','MAYBE_IMG') FROM content_article ORDER BY id DESC LIMIT 1;"
