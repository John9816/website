#!/bin/bash
mysql -N website_java -e "SELECT config_key, LEFT(config_value,120) FROM sys_config WHERE config_key LIKE 'ai.chat%' OR config_key LIKE 'content.writer%' OR config_key LIKE 'content.review%' ORDER BY config_key;"
echo "==== probe chat ===="
BASE=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
MODEL=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.defaultModel' LIMIT 1;")
echo "BASE=$BASE MODEL=$MODEL KEYLEN=${#KEY}"
# normalize base for /chat/completions
if echo "$BASE" | grep -q 'chat/completions'; then
  URL="$BASE"
else
  URL="${BASE%/}/chat/completions"
  if ! echo "$URL" | grep -q '/v1/'; then
    URL="${BASE%/}/v1/chat/completions"
  fi
fi
echo "URL=$URL"
code=$(curl -sS -m 90 -o /tmp/chatprobe.json -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"?????????????????\"}],\"max_tokens\":80}")
echo "http=$code"
python3 -c 'import json;d=json.load(open("/tmp/chatprobe.json"));print("keys",list(d.keys())[:8]);c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");print("content",(c or "")[:200]);e=d.get("error");print("err",e)' 2>/dev/null || head -c 300 /tmp/chatprobe.json
echo
# also try flash
for m in mimo-v2-flash mimo-v2.5 deepseek-v3; do
  code=$(curl -sS -m 60 -o /tmp/chat2.json -w "%{http_code}" -X POST "$URL" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$m\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}],\"max_tokens\":20}")
  echo "model=$m http=$code"
  python3 -c 'import json;d=json.load(open("/tmp/chat2.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");e=d.get("error");print(" ok" if c else " err", (c or str(e))[:120])' 2>/dev/null
done
