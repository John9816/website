#!/bin/bash
TOKEN=$(cat /tmp/admin.token)
curl -sS -m 15 -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8090/api/admin/content/automation/run/content-generate-444f80037fd547ce9cd75a897f3a6b09 \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);x=d.get("data")or{};print(x.get("status"),x.get("stage"),x.get("stageLabel"),str(x.get("error")or"")[:200])'
# test wisart quickly
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.key';")
URL=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.baseUrl';")
MODEL=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='image.api.model';")
echo "img $URL model=$MODEL"
code=$(curl -sS -m 90 -o /tmp/img.json -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"model\":\"$MODEL\",\"prompt\":\"simple red circle icon flat\",\"n\":1,\"size\":\"1024x1024\"}")
echo "img_http=$code"
head -c 250 /tmp/img.json; echo
# tunnel
ss -lntp | grep 18787 || echo NO_TUNNEL
curl -sS -m 10 -o /dev/null -w "models=%{http_code}\n" -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" http://127.0.0.1:18787/v1/models
# put flash first in models
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash,mimo-v2.5-pro,mimo-v2.5,mimo-v2-pro,mimo-v2-omni', updated_at=NOW() WHERE config_key='ai.chat.models';"
mysql -N website_java -e "SELECT config_key,config_value FROM sys_config WHERE config_key LIKE 'ai.chat.%';"