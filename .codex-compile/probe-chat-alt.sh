#!/bin/bash
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key';")
for url in \
  "https://wisart.kuaileshifu.com/v1/models" \
  "https://wisart.kuaileshifu.com/v1/chat/completions"
 do
  echo "=== $url ==="
  if [[ "$url" == *models ]]; then
    curl -sS -m 20 -o /tmp/w.json -w "http=%{http_code}\n" -H "Authorization: Bearer $KEY" "$url"
    head -c 400 /tmp/w.json; echo
  else
    curl -sS -m 60 -o /tmp/wchat.json -w "http=%{http_code}\n" -X POST "$url" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
      -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"ping"}],"max_tokens":20}'
    head -c 300 /tmp/wchat.json; echo
  fi
done
# also try common china endpoints from ECS
for host in api.deepseek.com api.moonshot.cn dashscope.aliyuncs.com; do
  curl -sS -m 8 -o /dev/null -w "$host %{http_code} %{time_connect}\n" "https://$host/" || echo "$host fail"
done