#!/usr/bin/env bash
set -euo pipefail
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
for i in 1 2; do
  echo "=== revise pass $i ==="
  code=$(curl -sS -m 600 -o /tmp/rev.json -w '%{http_code}' \
    -X POST "http://127.0.0.1:8090/api/admin/content/articles/49/revise" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json')
  echo "code=$code"
  python3 - <<'PY'
import json
d=json.load(open('/tmp/rev.json'))
data=d.get('data') or {}
print('id', data.get('id'), 'score', data.get('qualityScore'), 'title', (data.get('title') or '')[:40])
print('err', (data.get('errorMessage') or '')[:200])
risks=data.get('riskTips') or []
print('risks', risks[:6] if isinstance(risks,list) else str(risks)[:300])
md=data.get('contentMarkdown') or ''
print('clen', len(md))
PY
done
mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen,image_mode,LEFT(title,50) title FROM content_article WHERE id=49\G"
mysql website_java -N -e "SELECT LEFT(risk_tips_json,500), LEFT(error_message,200) FROM content_article WHERE id=49;"
