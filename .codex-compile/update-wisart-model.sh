#!/bin/bash
set -e
mysql website_java -e "UPDATE sys_config SET config_value='nano-banana-2-lite', updated_at=NOW() WHERE config_key='image.api.model';"
mysql -N website_java -e "SELECT config_key, LEFT(config_value,90) FROM sys_config WHERE config_key LIKE 'image.%' ORDER BY config_key;"
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
BASE=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.baseUrl' LIMIT 1;")
MODEL=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.model' LIMIT 1;")
echo "BASE=$BASE"
echo "MODEL=$MODEL"
echo "KEYLEN=${#KEY}"
code=$(curl -sS -m 120 -o /tmp/smokegen.json -w "%{http_code}" -X POST "$BASE" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"minimal flat illustration of a laptop on desk, clean white background\",\"size\":\"1024x1024\",\"n\":1,\"response_format\":\"url\"}")
echo "smoke http=$code"
python3 -c 'import json;d=json.load(open("/tmp/smokegen.json"));data=d.get("data") or [];print("items",len(data));print("url",(data[0].get("url") or "")[:160] if data else json.dumps(d,ensure_ascii=False)[:300])'
