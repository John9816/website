#!/bin/bash
set -u
BASE="https://wisart.kuaileshifu.com"
echo "=== models with keys ==="
KEY_OLD=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
KEY_USER="sk-67d441553"
for KEY in "$KEY_USER" "$KEY_OLD"; do
  echo "--- keylen=${#KEY} ---"
  curl -sS -m 20 -H "Authorization: Bearer $KEY" "$BASE/v1/models" | head -c 2000; echo
  code=$(curl -sS -m 90 -o /tmp/wisart-gen.json -w "%{http_code}" -X POST "$BASE/v1/images/generations" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"model":"gpt-image-2","prompt":"a simple red apple on white background, product photo","size":"1024x1024","quality":"auto","n":1,"response_format":"url"}')
  echo "gen http=$code"
  python3 - <<'PY'
import json
try:
  d=json.load(open("/tmp/wisart-gen.json"))
except Exception as e:
  print("parse fail", e); open("/tmp/wisart-gen.json").read()[:300]; raise SystemExit
print(str(d)[:500])
data=d.get("data") or []
print("items", len(data))
if data:
  item=data[0]
  print("keys", list(item.keys()))
  print("url", (item.get("url") or "")[:120])
  print("b64len", len(item.get("b64_json") or ""))
PY
done
