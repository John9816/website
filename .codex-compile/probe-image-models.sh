#!/bin/bash
set -u
KEY=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
BASE=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.baseUrl' LIMIT 1;")
echo "base=$BASE"
echo "keylen=${#KEY}"
# try models list
echo "=== models ==="
curl -sS -m 25 -H "Authorization: Bearer $KEY" "https://jiuuij.de5.net/v1/models" | head -c 4000
echo
echo "=== probe models ==="
for model in gpt-image-2 gpt-image-1 gpt-image-1.5 dall-e-3 dall-e-2 flux-schnell flux-dev flux-pro flux black-forest-labs/FLUX.1-schnell black-forest-labs/FLUX.1-dev imagen-3.0-generate-002 gpt-4o-image; do
  code=$(curl -sS -m 40 -o /tmp/imgprobe.json -w "%{http_code}" -X POST "https://jiuuij.de5.net/v1/images/generations" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"prompt\":\"a simple red apple on white background\",\"n\":1,\"size\":\"1024x1024\"}")
  msg=$(python3 -c "import json;d=json.load(open('/tmp/imgprobe.json'));print(str(d.get('error',d.get('message',d)))[:160])" 2>/dev/null || head -c 160 /tmp/imgprobe.json)
  hasdata=$(python3 -c "import json;d=json.load(open('/tmp/imgprobe.json'));print('yes' if d.get('data') else 'no')" 2>/dev/null || echo no)
  echo "$model => http=$code data=$hasdata msg=$msg"
done
