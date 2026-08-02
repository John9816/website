#!/usr/bin/env bash
set -euo pipefail
mysql website_java -e "UPDATE sys_config SET config_value='gpt-image-2' WHERE config_key='image.api.model';"
# ensure row exists
cnt=$(mysql website_java -N -e "SELECT COUNT(*) FROM sys_config WHERE config_key='image.api.model';")
if [[ "$cnt" -eq 0 ]]; then
  mysql website_java -e "INSERT INTO sys_config (config_key, config_value, description) VALUES ('image.api.model','gpt-image-2','Model name passed to upstream image API.');"
fi
mysql website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key LIKE 'image.%' ORDER BY config_key;"
