#!/usr/bin/env bash
set -uo pipefail
AID=50
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

echo "=== revise ==="
code=$(curl -sS -m 600 -o /tmp/rev.json -w '%{http_code}' -X POST "$BASE/articles/$AID/revise" -H "$AUTH" -H 'Content-Type: application/json')
echo code=$code
python3 - <<'PY'
import json
a=json.load(open('/tmp/rev.json')).get('data') or {}
print('score', a.get('qualityScore'), 'status', a.get('status'))
print('title', (a.get('title') or '')[:60])
print('err', (a.get('errorMessage') or '')[:220])
print('imageMode', a.get('imageMode'), 'cover', bool(a.get('coverImageUrl')))
imgs=a.get('inlineImages') or []
print('inline', len(imgs), [ (i or {}).get('status') for i in imgs[:4] ])
md=a.get('contentMarkdown') or ''
print('h2', sum(1 for line in md.splitlines() if line.startswith('## ') and not line.startswith('###')))
print('lead', md.split('\n\n')[1][:120] if len(md.split('\n\n'))>1 else '')
PY

SCORE=$(python3 -c "import json;print((json.load(open('/tmp/rev.json')).get('data') or {}).get('qualityScore') or 0)")
if [[ "${SCORE:-0}" -lt 88 ]]; then
  echo "=== refresh visuals (fetch, no generative if possible) ==="
  code=$(curl -sS -m 300 -o /tmp/vis.json -w '%{http_code}' -X POST "$BASE/articles/$AID/visuals" -H "$AUTH" -H 'Content-Type: application/json')
  echo vis_code=$code
  python3 - <<'PY'
import json
a=json.load(open('/tmp/vis.json')).get('data') or {}
print('score', a.get('qualityScore'), 'err', (a.get('errorMessage') or '')[:200])
imgs=a.get('inlineImages') or []
print('inline', len(imgs), [ (i or {}).get('status') for i in imgs[:4] ])
print('cover', bool(a.get('coverImageUrl')))
PY
  echo "=== revise again ==="
  code=$(curl -sS -m 600 -o /tmp/rev.json -w '%{http_code}' -X POST "$BASE/articles/$AID/revise" -H "$AUTH" -H 'Content-Type: application/json')
  echo code=$code
  python3 - <<'PY'
import json
a=json.load(open('/tmp/rev.json')).get('data') or {}
print('score', a.get('qualityScore'), 'err', (a.get('errorMessage') or '')[:220])
PY
fi

echo "=== wechat-draft ==="
code=$(curl -sS -m 180 -o /tmp/wx.json -w '%{http_code}' -X POST "$BASE/articles/$AID/wechat-draft" -H "$AUTH" -H 'Content-Type: application/json')
echo wx_code=$code
python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/wx.json')), ensure_ascii=False)[:1800])
PY
curl -sS -m 20 -H "$AUTH" "$BASE/articles/$AID" -o /tmp/art.json
python3 - <<'PY'
import json
a=json.load(open('/tmp/art.json')).get('data') or {}
print('FINAL', a.get('id'), a.get('status'), a.get('qualityScore'), a.get('wechatMediaId'))
print('title', (a.get('title') or '')[:70])
print('err', (a.get('errorMessage') or '')[:200])
PY
mysql website_java -e "SELECT id,status,quality_score,LEFT(title,40) t,LEFT(IFNULL(wechat_media_id,''),36) wx FROM content_article WHERE id=50\G"
