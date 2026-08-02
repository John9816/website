#!/usr/bin/env bash
set -euo pipefail
mysql website_java -e "SELECT id,status,quality_score,image_mode,LEFT(title,40) t FROM content_article ORDER BY id DESC LIMIT 10;"
echo "=== wechat/content cfg ==="
mysql website_java -N -e "SELECT config_key, LEFT(config_value,100) FROM sys_config WHERE config_key LIKE 'content.%' OR config_key LIKE 'wechat.%' OR config_key LIKE 'ai.%' ORDER BY config_key;"
echo "=== service ==="
systemctl is-active website-java-api
curl -sS -m 3 -o /dev/null -w "http=%{http_code}\n" http://127.0.0.1:8090/ || true
