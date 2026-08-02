#!/usr/bin/env bash
set -uo pipefail
AID="${1:?article id}"
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
AUTH="Authorization: Bearer ${TOKEN}"
BASE=http://127.0.0.1:8090/api/admin/content

for pass in 1 2 3; do
  echo "=== revise pass $pass ==="
  code=$(curl -sS -m 600 -o /tmp/rev.json -w '%{http_code}' \
    -X POST "$BASE/articles/$AID/revise" -H "$AUTH" -H 'Content-Type: application/json' || true)
  echo "code=$code"
  python3 - <<'PY'
import json
d=json.load(open('/tmp/rev.json'))
a=d.get('data') or {}
print('score', a.get('qualityScore'), 'status', a.get('status'), 'title', (a.get('title') or '')[:50])
print('err', (a.get('errorMessage') or '')[:220])
print('clen', len(a.get('contentMarkdown') or ''))
print('wx', a.get('wechatMediaId'))
md=a.get('contentMarkdown') or ''
print('h2', md.count('\n## '))
# first paras
parts=[p.strip() for p in md.split('\n\n') if p.strip()][:4]
for p in parts:
    print('P:', p.replace('\n',' ')[:100])
PY
  SCORE=$(python3 - <<'PY'
import json
print((json.load(open('/tmp/rev.json')).get('data') or {}).get('qualityScore') or 0)
PY
)
  if [[ "${SCORE:-0}" -ge 88 ]]; then
    echo "score ok"
    break
  fi
done

echo "=== wechat-draft ==="
code=$(curl -sS -m 180 -o /tmp/wx.json -w '%{http_code}' \
  -X POST "$BASE/articles/$AID/wechat-draft" -H "$AUTH" -H 'Content-Type: application/json' || true)
echo "wechat code=$code"
python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/wx.json')), ensure_ascii=False)[:2000])
PY
curl -sS -m 30 -H "$AUTH" "$BASE/articles/$AID" -o /tmp/art.json
python3 - <<'PY'
import json
a=(json.load(open('/tmp/art.json')).get('data') or {})
print('FINAL id', a.get('id'), 'status', a.get('status'), 'score', a.get('qualityScore'))
print('title', (a.get('title') or '')[:70])
print('wx', a.get('wechatMediaId'))
print('err', (a.get('errorMessage') or '')[:220])
PY
mysql website_java -e "SELECT id,status,quality_score,LEFT(title,40) t,LEFT(IFNULL(wechat_media_id,''),40) wx FROM content_article WHERE id=$AID\\G"
