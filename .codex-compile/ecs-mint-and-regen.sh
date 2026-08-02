#!/usr/bin/env bash
set -euo pipefail
SECRET_B64='G9JVnspxa0ONohqR2jhWgiSb/4jdDaW4mJUUUNWHO7fyZB3AwfJt5Kj81Q8vcajr'
TOKEN=$(python3 - <<PY
import base64, hmac, hashlib, json, time, struct
secret = base64.b64decode("$SECRET_B64")
def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
header = b64url(json.dumps({"alg":"HS256","typ":"JWT"}, separators=(",",":")).encode())
now = int(time.time())
payload = b64url(json.dumps({
  "sub":"1",
  "username":"admin",
  "role":"ADMIN",
  "authVersion":0,
  "iat": now,
  "exp": now + 3600*12
}, separators=(",",":")).encode())
sig = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
print(f"{header}.{payload}.{b64url(sig)}")
PY
)
echo "token_len=${#TOKEN}"
# sanity: list articles
code=$(curl -sS -m 15 -o /tmp/arts.json -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" \
  'http://127.0.0.1:8090/api/admin/content/articles?page=0&size=5')
echo "list_code=$code"
head -c 250 /tmp/arts.json; echo

# get article 43 title/topic for regenerate
mysql -N website_java -e "SELECT title FROM content_article WHERE id=43;" > /tmp/topic43.txt
TOPIC=$(cat /tmp/topic43.txt)
# strip template suffix if present
TOPIC=${TOPIC% ，先别急着站队}
TOPIC=${TOPIC%先别急着站队}
TOPIC=$(python3 - <<'PY'
t=open('/tmp/topic43.txt','r',encoding='utf-8').read().strip()
for s in ['，先别急着站队','先别急着站队']:
    if t.endswith(s):
        t=t[:-len(s)]
print(t)
PY
)
echo "topic=$TOPIC"

BODY=$(python3 - <<PY
import json
print(json.dumps({
  "topic": """$TOPIC""",
  "category": "growth",
  "length": "standard",
  "generateCover": True,
  "researchEnabled": False,
  "autoWechatDraft": False,
  "model": "mimo-v2-flash"
}, ensure_ascii=False))
PY
)
echo "body=$BODY"

# mark start time for risk tips comparison
BEFORE=$(mysql -N website_java -e "SELECT updated_at FROM content_article WHERE id=43;")
echo "before_updated=$BEFORE"

code=$(curl -sS -m 30 -o /tmp/job.json -w '%{http_code}' \
  -X POST 'http://127.0.0.1:8090/api/admin/content/articles/generate-async' \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$BODY")
echo "job_code=$code"
cat /tmp/job.json; echo

JOB=$(python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/job.json'))
  data=d.get('data') or d
  print(data.get('id') or data.get('jobId') or '')
except Exception as e:
  print('')
PY
)
echo "job_id=$JOB"

for i in $(seq 1 60); do
  if [[ -n "$JOB" ]]; then
    curl -sS -m 10 -o /tmp/jobst.json \
      -H "Authorization: Bearer ${TOKEN}" \
      "http://127.0.0.1:8090/api/admin/content/automation/run/${JOB}" || true
    echo "poll $i $(head -c 180 /tmp/jobst.json)"
    st=$(python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/jobst.json'))
  data=d.get('data') or d
  print(data.get('status') or '')
except: print('')
PY
)
    if [[ "$st" == "SUCCESS" || "$st" == "FAILED" || "$st" == "DONE" || "$st" == "COMPLETED" ]]; then
      break
    fi
  fi
  mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen, LEFT(risk_tips_json,220) risk FROM content_article ORDER BY id DESC LIMIT 3;"
  sleep 10
done

mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen, LEFT(title,50) title, LEFT(risk_tips_json,450) risk FROM content_article ORDER BY id DESC LIMIT 3\G"
