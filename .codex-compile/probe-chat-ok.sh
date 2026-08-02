#!/bin/bash
MIMO_KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
WKEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")

echo "==== official mimo ===="
for model in mimo-v2.5-pro mimo-v2-flash mimo-v2.5; do
  code=$(curl -sS -m 45 -o /tmp/mimo.json -w "%{http_code}" -X POST "https://api.xiaomimimo.com/v1/chat/completions" \
    -H "Authorization: Bearer $MIMO_KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"???????????\"}],\"max_tokens\":60}")
  echo "mimo $model http=$code"
  python3 -c 'import json;d=json.load(open("/tmp/mimo.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");e=d.get("error");print("content",(c or "")[:180]);print("err",e)' 2>/dev/null
done

echo "==== wisart text ===="
for model in gpt-5.5 gpt-5.6-terra; do
  code=$(curl -sS -m 90 -o /tmp/w.json -w "%{http_code}" -X POST "https://wisart.kuaileshifu.com/v1/chat/completions" \
    -H "Authorization: Bearer $WKEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"?????????????\"}],\"max_tokens\":80}")
  echo "wisart $model http=$code"
  python3 -c 'import json;d=json.load(open("/tmp/w.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");e=d.get("error");print("content",(c or "")[:200]);print("err",e)' 2>/dev/null
done
