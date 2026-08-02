#!/bin/bash
set -e
mysql website_java -e "UPDATE sys_config SET config_value='http://127.0.0.1:18787/v1', updated_at=NOW() WHERE config_key='ai.chat.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash', updated_at=NOW() WHERE config_key='ai.chat.defaultModel';"
# keep pro available in models list; flash first for reliability
mysql -N website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key LIKE 'ai.chat.%' ORDER BY config_key;"
code=$(curl -sS -m 90 -o /tmp/chat.json -w "%{http_code}" -X POST http://127.0.0.1:18787/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"?????????????"}],"max_tokens":100}')
echo "chat http=$code"
python3 -c 'import json;d=json.load(open("/tmp/chat.json"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");print("content:",(c or str(d))[:400])'
