#!/bin/bash
mysql -N website_java -e "SHOW TABLES LIKE 'content%';"
mysql -N website_java -e "SELECT id, status, LEFT(title,60), updated_at FROM content_article ORDER BY id DESC LIMIT 8;"