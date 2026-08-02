#!/usr/bin/env bash
set -euo pipefail
mysql website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key LIKE 'ai.chat%' OR config_key LIKE 'content.writer%';"
echo "--- article 43 ---"
mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) AS clen, LEFT(risk_tips_json,500) AS risk FROM content_article WHERE id=43;"
echo "--- recent jobs ---"
mysql website_java -e "SELECT id,status,LEFT(result_json,400) FROM content_agent_job ORDER BY id DESC LIMIT 3;"
echo "--- fufu ---"
getent hosts fufu.iqach.top || true
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey' LIMIT 1;")
curl -sS -m 20 -o /tmp/fufu-models.json -w "models_http=%{http_code}\n" \
  "https://fufu.iqach.top/v1/models" -H "Authorization: Bearer ${KEY}" || true
head -c 200 /tmp/fufu-models.json; echo
