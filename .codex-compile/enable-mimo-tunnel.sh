#!/bin/bash
set -e
echo "==== tunnel probe ===="
curl -sS -m 25 -o /tmp/mimo-models.json -w "http=%{http_code}\n" -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" http://127.0.0.1:18787/v1/models
head -c 220 /tmp/mimo-models.json; echo
mysql website_java -e "UPDATE sys_config SET config_value='http://127.0.0.1:18787/v1', updated_at=NOW() WHERE config_key='ai.chat.baseUrl';"
mysql -N website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key IN ('ai.chat.baseUrl','ai.chat.defaultModel','ai.chat.apiKey');"
# short chat test
code=$(curl -sS -m 60 -o /tmp/chat.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"?????????????"}],"max_tokens":80}')
echo "chat http=$code"
python3 -c 'import json;d=json.load(open("/tmp/chat.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");print((c or d)[:300])'
