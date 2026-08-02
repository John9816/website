#!/bin/bash
set -u
DB_USER="website_java"
DB_PASS='website_java_2026_ChangeMe!'
mysql -u"$DB_USER" -p"$DB_PASS" website_java -e "SELECT 1 AS ok;" 2>&1 | head -5
echo "---"
# try root socket
mysql website_java -e "SELECT config_key, LENGTH(config_value) AS len, LEFT(config_value,120) AS val FROM sys_config WHERE config_key LIKE '%image%' ORDER BY config_key;" 2>&1 | head -40
echo "---runtime---"
# try website_runtime from backend env
set -a
# shellcheck disable=SC1091
. /opt/website/backend/.env
set +a
mysql -u"$SPRING_DATASOURCE_USERNAME" -p"$SPRING_DATASOURCE_PASSWORD" website -e "SELECT config_key, LENGTH(config_value) AS len, LEFT(config_value,120) AS val FROM sys_config WHERE config_key LIKE '%image%' ORDER BY config_key;" 2>&1 | head -40
mysql -u"$SPRING_DATASOURCE_USERNAME" -p"$SPRING_DATASOURCE_PASSWORD" website_java -e "SELECT config_key, LENGTH(config_value) AS len, LEFT(config_value,120) AS val FROM sys_config WHERE config_key LIKE '%image%' ORDER BY config_key;" 2>&1 | head -40
