#!/bin/bash
set -u
ENV=$(systemctl cat website-java-api | tr "\n" " ")
DB_USER=$(grep -oP "SPRING_DATASOURCE_USERNAME=\K[^ ]+" /etc/systemd/system/website-java-api.service)
DB_PASS=$(grep -oP "SPRING_DATASOURCE_PASSWORD=\K[^ ]+" /etc/systemd/system/website-java-api.service)
echo "user=$DB_USER"
mysql -u"$DB_USER" -p"$DB_PASS" website_java -N -e "SELECT config_key, LENGTH(config_value), LEFT(config_value,100) FROM sys_config WHERE config_key LIKE '%image%' OR config_key LIKE 'image%' ORDER BY config_key;"
echo "---"
if [ -f /opt/website-java-api/.env ]; then echo has_java_api_env; cat /opt/website-java-api/.env | sed "s/=.*/=***/"; fi
if [ -f /opt/website/backend/.env ]; then echo has_backend_env; grep -i image /opt/website/backend/.env | sed "s/=.*/=***/" || true; fi
