#!/bin/bash
set -u
CHAT_KEY=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
CHAT_BASE=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.baseUrl' LIMIT 1;")
echo "chat base=$CHAT_BASE keylen=${#CHAT_KEY}"
echo "=== chat models ==="
curl -sS -m 20 -H "Authorization: Bearer $CHAT_KEY" "$CHAT_BASE/models" | head -c 2500; echo
echo "=== try image on chat host ==="
for model in dall-e-3 gpt-image-1 flux-schnell mimo-v2.5-pro; do
  code=$(curl -sS -m 30 -o /tmp/c.json -w "%{http_code}" -X POST "$CHAT_BASE/images/generations" -H "Authorization: Bearer $CHAT_KEY" -H "Content-Type: application/json" -d "{\"model\":\"$model\",\"prompt\":\"a red apple\",\"n\":1,\"size\":\"1024x1024\"}")
  msg=$(python3 -c "import json;d=json.load(open('/tmp/c.json'));print(str(d)[:180])" 2>/dev/null || head -c 180 /tmp/c.json)
  echo "images $model => $code $msg"
done
# try jiuuij with different groups via header if new-api supports
IMG_KEY=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
for group in default ?? ?? image chat; do
  code=$(curl -sS -m 20 -o /tmp/g.json -w "%{http_code}" -X POST "https://jiuuij.de5.net/v1/images/generations" -H "Authorization: Bearer $IMG_KEY" -H "Content-Type: application/json" -H "x-api-key: $IMG_KEY" -H "New-Api-User: 1" \
    -d "{\"model\":\"dall-e-3\",\"prompt\":\"red apple\",\"n\":1,\"group\":\"$group\"}")
  msg=$(python3 -c "import json;d=json.load(open('/tmp/g.json'));print(str(d)[:160])" 2>/dev/null || head -c 160 /tmp/g.json)
  echo "group=$group => $code $msg"
done
