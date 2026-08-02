#!/bin/bash
echo "=== tunnel ==="
ss -lntp | grep 18787 || echo NO_TUNNEL
curl -sS -m 10 -o /dev/null -w "models=%{http_code}\n" -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" http://127.0.0.1:18787/v1/models 2>/dev/null || echo models=fail
echo "=== api ==="
systemctl is-active website-java-api
echo "=== config ==="
mysql -N website_java -e "SELECT config_key, LEFT(config_value,90) FROM sys_config WHERE config_key IN ('ai.chat.baseUrl','ai.chat.defaultModel','content.plan.enabled','content.review.enabled','content.writer.fallbackModels') ORDER BY config_key;"
echo "=== latest articles ==="
mysql -N website_java -e "SELECT id,status,model,quality_score,LEFT(IFNULL(error_message,''),100),LEFT(title,40) FROM content_article ORDER BY id DESC LIMIT 5;"
echo "=== latest fallback? ==="
mysql -N website_java -e "SELECT id, (risk_tips_json LIKE '%fallback was used%' OR risk_tips_json LIKE '%本地模板%') AS fb, CHAR_LENGTH(content_markdown) FROM content_article ORDER BY id DESC LIMIT 3;"