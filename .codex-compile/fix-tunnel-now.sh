#!/bin/bash
set -e
echo "ss:"; ss -lntp | grep 18787 || true
code=$(curl -sS -m 25 -o /tmp/mimo-models.json -w "%{http_code}" -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" http://127.0.0.1:18787/v1/models || echo 000)
echo "models_http=$code"
head -c 180 /tmp/mimo-models.json 2>/dev/null; echo
mysql website_java -e "UPDATE sys_config SET config_value='http://127.0.0.1:18787/v1', updated_at=NOW() WHERE config_key='ai.chat.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash', updated_at=NOW() WHERE config_key='ai.chat.defaultModel';"
mysql -N website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key IN ('ai.chat.baseUrl','ai.chat.defaultModel','ai.chat.apiKey');"
code=$(curl -sS -m 90 -o /tmp/chat.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" -H "Content-Type: application/json" -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"ping reply ok"}],"max_tokens":40}')
echo "chat_http=$code"
python3 -c 'import json;d=json.load(open("/tmp/chat.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");print("content:",(c or str(d))[:300])'
systemctl is-active website-java-api