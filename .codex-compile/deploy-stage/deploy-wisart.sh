#!/bin/bash
set -e
cp /tmp/website.jar /opt/website-java-api/website.jar
cp /tmp/website.jar /opt/website/backend/website.jar
mysql website_java -e "UPDATE sys_config SET config_value='https://wisart.kuaileshifu.com/v1/images/generations' WHERE config_key='image.api.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='gpt-image-2' WHERE config_key='image.api.model';"
mysql website_java -e "UPDATE sys_config SET config_value='https://wisart.kuaileshifu.com/v1/images/edits' WHERE config_key='image.edit.api.baseUrl';"
# keep key as-is until user provides WisArt token
systemctl restart website-java-api
sleep 16
systemctl is-active website-java-api
curl -s -o /dev/null -w "cats=%{http_code}\n" http://127.0.0.1:8090/api/public/categories
mysql website_java -N -e "SELECT config_key, LEFT(config_value,90) FROM sys_config WHERE config_key LIKE 'image.api.%' OR config_key='image.edit.api.baseUrl';"
# verify base reaches WisArt with missing key message (not connection error)
curl -sS -m 15 -o /tmp/w.json -w "wisart=%{http_code}\n" -X POST "https://wisart.kuaileshifu.com/v1/images/generations" -H "Content-Type: application/json" -d '{"model":"gpt-image-2","prompt":"x","n":1}'
head -c 200 /tmp/w.json; echo
