#!/bin/bash
mysql -N website_java -e "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='website_java' AND TABLE_NAME='content_article' ORDER BY ORDINAL_POSITION;"
echo '---'
mysql -N website_java -e "SELECT risk_tips_json, LEFT(content_markdown,200), publish_gate_json FROM content_article WHERE id=36\G" 2>&1 | head -80