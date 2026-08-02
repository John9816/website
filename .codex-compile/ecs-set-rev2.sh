#!/usr/bin/env bash
set -euo pipefail
mysql website_java -e "DESCRIBE sys_config;"
mysql website_java -e "SELECT config_key,config_value FROM sys_config WHERE config_key LIKE 'content.review%';"
# update if exists
n=$(mysql -N website_java -e "SELECT COUNT(*) FROM sys_config WHERE config_key='content.review.maxRevisions';")
if [[ "$n" -gt 0 ]]; then
  mysql website_java -e "UPDATE sys_config SET config_value='2' WHERE config_key='content.review.maxRevisions';"
else
  mysql website_java -e "INSERT INTO sys_config (config_key, config_value, created_at, updated_at) VALUES ('content.review.maxRevisions','2',NOW(6),NOW(6));" \
    || mysql website_java -e "INSERT INTO sys_config (config_key, config_value) VALUES ('content.review.maxRevisions','2');" || true
fi
mysql website_java -e "SELECT config_key,config_value FROM sys_config WHERE config_key LIKE 'content.review%';"
