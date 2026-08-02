#!/bin/bash
systemctl is-active website-ecs
systemctl is-active website-java-api
systemctl is-active website-api
ls -la /opt/website/dist/index.html
ls /opt/website/dist/assets/AdminContentFactory-*.js 2>/dev/null | head -3
echo -n "healthz="; curl -sS -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/healthz; echo
echo -n "root="; curl -sS -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/; echo
echo -n "api_via_node="; curl -sS -m 15 -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health; echo
echo -n "java8090="; curl -sS -m 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/; echo
mysql -N website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key IN ('image.api.model','image.api.baseUrl');"
