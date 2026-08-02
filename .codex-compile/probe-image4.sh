#!/bin/bash
set -u
KEY=$(mysql website_java -N -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key' LIMIT 1;")
# broader model probe - faster timeout
for model in midjourney mj mj-fast sora-image cogview-3 cogview-4 qwen-image wanx-v1 stable-diffusion-xl sdxl playground-v2.5 ideogram-v2 kling-image seedream-3.0 seedream gpt-4o gpt-4o-mini; do
  code=$(curl -sS -m 12 -o /tmp/m.json -w "%{http_code}" -X POST "https://jiuuij.de5.net/v1/images/generations" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"prompt\":\"a red apple\",\"n\":1}")
  msg=$(python3 -c "import json;d=json.load(open('/tmp/m.json'));e=d.get('error',{});print((e.get('message') if isinstance(e,dict) else str(d))[:120])" 2>/dev/null || echo x)
  echo "$model => $code $msg"
  if [ "$code" = "200" ]; then echo FOUND; cat /tmp/m.json | head -c 300; echo; break; fi
done
