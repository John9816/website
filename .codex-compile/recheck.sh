#!/bin/bash
sleep 8
systemctl is-active website-java-api website-ecs
curl -s -o /dev/null -w "cats=%{http_code}\n" http://127.0.0.1:8090/api/public/categories
curl -s -o /dev/null -w "home=%{http_code}\n" http://127.0.0.1:3000/
mysql website_java -N -e "SELECT config_key, LEFT(config_value,80) FROM sys_config WHERE config_key LIKE 'image.api.%';"
journalctl -u website-java-api -n 6 --no-pager
