#!/bin/bash
set -euo pipefail
KEY='sk-adb300497956f7f753fa3f01122cb6ff'
BASE='https://wisart.kuaileshifu.com'

# update DB
mysql website_java -e "UPDATE sys_config SET config_value='${KEY}' WHERE config_key='image.api.key';"
mysql website_java -e "UPDATE sys_config SET config_value='https://wisart.kuaileshifu.com/v1/images/generations' WHERE config_key='image.api.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='gpt-image-2' WHERE config_key='image.api.model';"
mysql website_java -e "UPDATE sys_config SET config_value='https://wisart.kuaileshifu.com/v1/images/edits' WHERE config_key='image.edit.api.baseUrl';"

echo "=== models ==="
curl -sS -m 30 -H "Authorization: Bearer ${KEY}" "${BASE}/v1/models" | head -c 2500
echo
echo
echo "=== generate ==="
code=$(curl -sS -m 180 -o /tmp/wisart-gen.json -w "%{http_code}" -X POST "${BASE}/v1/images/generations" \
  -H "Authorization: Bearer ${KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"a simple red apple on white background, product photo, clean lighting","size":"1024x1024","quality":"auto","n":1,"response_format":"url"}')
echo "http=$code"
python3 - <<'PY'
import json
d=json.load(open("/tmp/wisart-gen.json"))
if "error" in d:
    print("ERROR", d["error"])
else:
    data=d.get("data") or []
    print("created", d.get("created"), "items", len(data))
    if data:
        item=data[0]
        print("keys", list(item.keys()))
        url=item.get("url") or ""
        b64=item.get("b64_json") or ""
        print("url_prefix", url[:160])
        print("b64_len", len(b64))
        print("OK" if url or b64 else "NO_IMAGE")
    else:
        print(str(d)[:400])
PY

# restart so any cached config is refreshed if service caches; SysConfig usually reads DB each time
# still restart lightly not required if getValue reads DB live - skip full restart if possible
echo "=== db key len ==="
mysql website_java -N -e "SELECT config_key, LENGTH(config_value), LEFT(config_value,12) FROM sys_config WHERE config_key LIKE 'image.api.%' OR config_key='image.edit.api.baseUrl';"
