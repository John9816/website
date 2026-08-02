#!/bin/bash
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
# wisart chat?
for url in \
  "https://wisart.kuaileshifu.com/v1/models" \
  "https://wisart.kuaileshifu.com/v1/chat/completions" \
  "https://api.xiaomimimo.com/v1/models" \
  "https://mimo.xiaomi.com/v1/models" \
  "https://api.mimo.xiaomi.com/v1/models"
do
  code=$(curl -sS -m 12 -o /tmp/t.json -w "%{http_code}" -H "Authorization: Bearer $KEY" "$url" 2>/dev/null || echo fail)
  echo "$url -> $code"
  head -c 120 /tmp/t.json 2>/dev/null; echo
done
# try POST short chat on wisart with various models
WKEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
for model in gpt-4o-mini gpt-4o deepseek-chat mimo-v2-flash nano-banana-2-lite; do
  code=$(curl -sS -m 30 -o /tmp/wc.json -w "%{http_code}" -X POST "https://wisart.kuaileshifu.com/v1/chat/completions" \
    -H "Authorization: Bearer $WKEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"???\"}],\"max_tokens\":20}" 2>/dev/null || echo fail)
  echo "wisart chat model=$model http=$code"
  python3 -c 'import json;d=json.load(open("/tmp/wc.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");e=d.get("error");print((c or e or d) if True else "")' 2>/dev/null | head -c 160; echo
done
