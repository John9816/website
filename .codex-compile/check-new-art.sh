#!/bin/bash
ss -lntp | grep 18787 || echo NO_TUNNEL
mysql -N website_java -e "SELECT id,status,model,quality_score,LEFT(IFNULL(error_message,''),160),LEFT(title,60) FROM content_article ORDER BY id DESC LIMIT 3;"
echo '---RISK---'
mysql -N website_java -e "SELECT id, risk_tips_json FROM content_article ORDER BY id DESC LIMIT 1;"
echo '---MDHEAD---'
mysql -N website_java -e "SELECT LEFT(content_markdown,400) FROM content_article ORDER BY id DESC LIMIT 1;"
echo '---LEN---'
mysql -N website_java -e "SELECT id, CHAR_LENGTH(content_markdown), cover_image_url IS NOT NULL FROM content_article ORDER BY id DESC LIMIT 1;"
# check if fallback mentioned
mysql -N website_java -e "SELECT id, risk_tips_json LIKE '%local template%' OR risk_tips_json LIKE '%本地模板%' FROM content_article ORDER BY id DESC LIMIT 1;"