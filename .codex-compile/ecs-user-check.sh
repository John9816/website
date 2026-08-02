#!/usr/bin/env bash
mysql website_java -e "SELECT id,user_id,status,image_mode FROM content_article WHERE id IN (49,50)\G"
mysql website_java -e "SHOW TABLES;"
