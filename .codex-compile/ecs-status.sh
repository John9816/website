#!/usr/bin/env bash
set -euo pipefail
echo "=== service ==="
systemctl is-active website-java-api
getent hosts fufu.iqach.top || true
echo "=== articles ==="
mysql website_java -e "SELECT id,status,quality_score,CHAR_LENGTH(content_markdown) clen,LEFT(title,50) title,updated_at FROM content_article ORDER BY id DESC LIMIT 5;"
echo "=== latest risk ==="
mysql website_java -e "SELECT id, LEFT(risk_tips_json,500) risk FROM content_article ORDER BY id DESC LIMIT 2\G"
echo "=== recent logs ==="
journalctl -u website-java-api --since '15 min ago' --no-pager | tail -50
