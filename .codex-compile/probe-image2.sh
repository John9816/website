#!/bin/bash
set -u
echo "=== all image-related configs ==="
mysql website_java -e "SELECT config_key, LENGTH(config_value) len, LEFT(config_value,140) val FROM sys_config WHERE config_key LIKE '%image%' OR config_key LIKE '%ai.%' OR config_key LIKE '%oreate%' OR config_key LIKE '%openai%' OR config_key LIKE '%llm%' ORDER BY config_key;"
echo "=== try chat completions image style ==="
KEY=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
# try user-provided short key too
KEY2="sk-67d441553"
for pair in "https://jiuuij.de5.net/v1/images/generations|$KEY" "https://jiuuij.de5.net/v1/images/generations|$KEY2" "https://jiuuij.de5.net/v1/chat/completions|$KEY" "https://api.openai.com/v1/images/generations|$KEY"; do
  url="${pair%%|*}"
  k="${pair##*|}"
  code=$(curl -sS -m 25 -o /tmp/p.json -w "%{http_code}" -X POST "$url" -H "Authorization: Bearer $k" -H "Content-Type: application/json" \
    -d '{"model":"gpt-image-1","prompt":"red apple","n":1,"size":"1024x1024","messages":[{"role":"user","content":"draw a red apple"}]}' 2>/dev/null || echo fail)
  msg=$(python3 -c "import json;d=json.load(open('/tmp/p.json'));print(str(d)[:200])" 2>/dev/null || head -c 200 /tmp/p.json)
  echo "url=$url keylen=${#k} => $code | $msg"
done
# balance/user info if new-api
echo "=== new-api user ==="
curl -sS -m 15 -H "Authorization: Bearer $KEY" "https://jiuuij.de5.net/api/user/self" | head -c 800; echo
curl -sS -m 15 -H "Authorization: Bearer $KEY" "https://jiuuij.de5.net/v1/dashboard/billing/subscription" | head -c 400; echo
curl -sS -m 15 -H "Authorization: Bearer $KEY" "https://jiuuij.de5.net/v1/dashboard/billing/credit_grants" | head -c 400; echo
