#!/bin/bash
set -e
cp /tmp/website.jar /opt/website/backend/website.jar
cp /tmp/website.jar /opt/website-java-api/website.jar
tar -xzf /tmp/website-dist.tar.gz -C /tmp
rsync -a --delete /tmp/dist/ /opt/website/dist/
rm -rf /tmp/dist
# keep model name; note that channels are still down
mysql website_java -e "UPDATE sys_config SET config_value='gpt-image-1' WHERE config_key='image.api.model';"
systemctl restart website-java-api
systemctl restart website-api
systemctl restart website-ecs
sleep 14
systemctl is-active website-java-api website-api website-ecs
curl -s -o /dev/null -w "cats=%{http_code}\n" http://127.0.0.1:8090/api/public/categories
curl -s -o /dev/null -w "home=%{http_code}\n" http://127.0.0.1:3000/
mysql website_java -N -e "SELECT config_key, config_value FROM sys_config WHERE config_key LIKE 'image.api.%';"
