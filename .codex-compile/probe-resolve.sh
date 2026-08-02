#!/bin/bash
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
for ip in 172.67.199.109 104.21.84.247 162.159.0.1; do
  echo "==== resolve $ip ===="
  code=$(curl -sS -m 20 --resolve fufu.iqach.top:443:$ip -o /tmp/fr.json -w "%{http_code}" \
    -H "Authorization: Bearer $KEY" "https://fufu.iqach.top/v1/models" || echo fail)
  echo "models http=$code"
  head -c 150 /tmp/fr.json 2>/dev/null; echo
  code2=$(curl -sS -m 45 --resolve fufu.iqach.top:443:$ip -o /tmp/fc.json -w "%{http_code}" -X POST "https://fufu.iqach.top/v1/chat/completions" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"hi"}],"max_tokens":20}' || echo fail)
  echo "chat http=$code2"
  head -c 200 /tmp/fc.json 2>/dev/null; echo
done
