#!/bin/bash
# recent journal for java api
journalctl -u website-java-api --since "2 hours ago" --no-pager 2>/dev/null | tail -n 120
echo "==== app logs ===="
ls -lt /opt/website-java-api/*.log /var/log/website* 2>/dev/null | head -10
# find log files
find /opt/website-java-api /opt/website -name "*.log" -mtime -1 2>/dev/null | head -20
# mysql recent articles risk tips
mysql -N website_java -e "SELECT id, LEFT(title,40), status, LEFT(risk_tips_json,200), updated_at FROM content_article ORDER BY id DESC LIMIT 8;" 2>/dev/null || mysql -N website_java -e "SHOW TABLES LIKE '%content%';"
