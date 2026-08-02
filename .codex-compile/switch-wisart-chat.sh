#!/bin/bash
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key';")
for model in gpt-5.5 gpt-5.6-terra; do
  echo "=== $model ==="
  code=$(curl -sS -m 120 -o /tmp/wc.json -w "%{http_code}" -X POST https://wisart.kuaileshifu.com/v1/chat/completions \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"用中文写80字职场开篇，主题AI提效。只输出正文。\"}],\"max_tokens\":300}")
  echo http=$code
  python3 -c 'import json;d=json.load(open("/tmp/wc.json"));m=(d.get("choices") or [{}])[0].get("message") or {};c=m.get("content");print("len",len(c) if isinstance(c,str) else None);print((c or str(d))[:350])'
done
# point chat to wisart permanently
mysql website_java -e "UPDATE sys_config SET config_value='https://wisart.kuaileshifu.com/v1', updated_at=NOW() WHERE config_key='ai.chat.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='$KEY', updated_at=NOW() WHERE config_key='ai.chat.apiKey';"
mysql website_java -e "UPDATE sys_config SET config_value='gpt-5.5', updated_at=NOW() WHERE config_key='ai.chat.defaultModel';"
mysql website_java -e "UPDATE sys_config SET config_value='gpt-5.5,gpt-5.6-terra', updated_at=NOW() WHERE config_key='ai.chat.models';"
mysql -N website_java -e "SELECT config_key, LEFT(config_value,80) FROM sys_config WHERE config_key LIKE 'ai.chat.%' ORDER BY config_key;"