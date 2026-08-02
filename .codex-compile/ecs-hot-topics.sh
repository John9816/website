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
code=$(curl -sS -m 90 -o /tmp/hot.json -w '%{http_code}' \
  -H "Authorization: Bearer ${TOKEN}" \
  "http://127.0.0.1:8090/api/admin/content/hot?limit=12&category=%E7%A7%91%E6%8A%80%20/%20%E4%BA%92%E8%81%94%E7%BD%91")
echo "code=$code"
python3 - <<'PY'
import json
d=json.load(open('/tmp/hot.json'))
data=d.get('data') or {}
items=data.get('items') or []
print('sources', [s.get('name') for s in (data.get('sources') or [])][:8])
print('count', len(items))
for i, it in enumerate(items[:12], 1):
    print(f"{i}. [{it.get('sourceName') or it.get('source')}] {(it.get('title') or '')[:60]}")
PY
