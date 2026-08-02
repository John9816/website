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

echo "=== force image_mode=generate ==="
mysql website_java -e "UPDATE content_article SET image_mode='generate' WHERE id=$AID;"

echo "=== refresh visuals (AI cover + inline) ==="
code=$(curl -sS -m 600 -o /tmp/vis.json -w '%{http_code}' \
  -X POST "$BASE/articles/$AID/visuals" -H "$AUTH" -H 'Content-Type: application/json')
echo vis_code=$code
python3 - <<'PY'
import json
d=json.load(open('/tmp/vis.json'))
if d.get('code') not in (0, None) and 'data' not in d:
    print(json.dumps(d, ensure_ascii=False)[:800])
a=d.get('data') or {}
print('score', a.get('qualityScore'), 'status', a.get('status'), 'mode', a.get('imageMode'))
print('cover', (a.get('coverImageUrl') or '')[:100])
imgs=a.get('inlineImages') or []
print('inline', len(imgs))
for i, im in enumerate(imgs):
    print(i, (im or {}).get('status'), (im or {}).get('sourceType'), ((im or {}).get('sourceUrl') or (im or {}).get('url') or '')[:70])
print('err', (a.get('errorMessage') or '')[:200])
PY

echo "=== re-push wechat draft if gate ok ==="
code=$(curl -sS -m 180 -o /tmp/wx.json -w '%{http_code}' \
  -X POST "$BASE/articles/$AID/wechat-draft" -H "$AUTH" -H 'Content-Type: application/json')
echo wx_code=$code
python3 - <<'PY'
import json
print(json.dumps(json.load(open('/tmp/wx.json')), ensure_ascii=False)[:1200])
PY
mysql website_java -e "SELECT id,status,quality_score,image_mode,LEFT(IFNULL(wechat_media_id,''),28) wx FROM content_article WHERE id=$AID\G"
