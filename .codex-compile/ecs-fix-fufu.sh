#!/usr/bin/env bash
set -euo pipefail
/usr/local/bin/update-cf || true
getent hosts fufu.iqach.top
KEY=$(mysql -N website_java -e "SELECT config_value FROM sys_config WHERE config_key='ai.chat.apiKey'")
curl -sS -m 25 -o /tmp/fufu-m.json -w "models=%{http_code}\n" -H "Authorization: Bearer ${KEY}" https://fufu.iqach.top/v1/models
head -c 200 /tmp/fufu-m.json; echo
