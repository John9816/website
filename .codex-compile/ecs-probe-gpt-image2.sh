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
  "iat": now, "exp": now + 3600
}, separators=(",",":")).encode())
sig = hmac.new(secret, f"{header}.{payload}".encode(), hashlib.sha256).digest()
print(f"{header}.{payload}.{b64url(sig)}")
PY
)
# minimal generate smoke (1 image) via admin if available; else direct status
code=$(curl -sS -m 120 -o /tmp/img.json -w '%{http_code}' \
  -X POST http://127.0.0.1:8090/api/admin/images/generate \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"simple flat icon, blue circle on white background, no text","n":1,"size":"1024x1024"}' || true)
echo "http=$code"
python3 - <<'PY'
import json
try:
  d=json.load(open('/tmp/img.json'))
except Exception as e:
  print('parse fail', e); raise SystemExit
print('code', d.get('code'), 'msg', (d.get('message') or '')[:200])
data=d.get('data') or {}
# shapes vary
if isinstance(data, dict):
  print('model', data.get('model'))
  items=data.get('data') or data.get('images') or []
  print('items', len(items) if isinstance(items, list) else type(items))
  if isinstance(items, list) and items:
    it=items[0] if isinstance(items[0], dict) else {}
    print('url', str(it.get('url') or it.get('b64_json') or '')[:80])
else:
  print(str(data)[:300])
PY
mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.model';"
