#!/bin/bash
echo "==== network to fufu ===="
getent hosts fufu.iqach.top || host fufu.iqach.top || nslookup fufu.iqach.top
curl -sS -m 15 -o /dev/null -w "fufu_root=%{http_code} time=%{time_total}\n" https://fufu.iqach.top/ || true
curl -sS -m 15 -o /dev/null -w "fufu_v1=%{http_code} time=%{time_total}\n" https://fufu.iqach.top/v1/models || true
# other common bases in config
mysql -N website_java -e "SELECT config_key, LEFT(config_value,100) FROM sys_config WHERE config_value LIKE '%http%' AND (config_key LIKE 'ai%' OR config_key LIKE '%baseUrl%' OR config_key LIKE '%api%') ORDER BY config_key;"
# try models endpoint with key on alternate paths
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
for url in \
  "https://api.moonshot.cn/v1/models" \
  "https://api.deepseek.com/v1/models" \
  "https://api.openai.com/v1/models" \
  "https://dashscope.aliyuncs.com/compatible-mode/v1/models"
do
  code=$(curl -sS -m 12 -o /tmp/m.json -w "%{http_code}" -H "Authorization: Bearer $KEY" "$url" || echo fail)
  echo "try $url -> $code"
done
# check if any recent working base in backups
grep -R "ai.chat.baseUrl\|iqach\|deepseek\|moonshot\|siliconflow\|openrouter" /opt/website/backend /opt/website-java-api --include='*.yml' --include='*.properties' --include='*.env' 2>/dev/null | head -20
