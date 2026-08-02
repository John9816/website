#!/bin/bash
set -e
echo "hosts:"; grep fufu /etc/hosts
echo "models:"
curl -4 -sS -m 20 -o /tmp/fufu_m.out -w "http=%{http_code} ip=%{remote_ip}\n" \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  https://fufu.iqach.top/v1/models
head -c 120 /tmp/fufu_m.out; echo
echo "chat:"
code=$(curl -4 -sS -m 90 -o /tmp/fufu_c.out -w "%{http_code}" -X POST https://fufu.iqach.top/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"用一句话回复：ok"}],"max_tokens":40}')
echo "chat_http=$code"
python3 -c 'import json;d=json.load(open("/tmp/fufu_c.out"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");print("content:",(c or str(d))[:300])'
# switch content factory to fufu direct like hermes
mysql website_java -e "UPDATE sys_config SET config_value='https://fufu.iqach.top/v1', updated_at=NOW() WHERE config_key='ai.chat.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f', updated_at=NOW() WHERE config_key='ai.chat.apiKey';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash', updated_at=NOW() WHERE config_key='ai.chat.defaultModel';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash,mimo-v2.5,mimo-v2.5-pro', updated_at=NOW() WHERE config_key='ai.chat.models';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash', updated_at=NOW() WHERE config_key='content.writer.fallbackModels';"
# re-enable plan/review for quality if they were disabled
mysql website_java -e "UPDATE sys_config SET config_value='true', updated_at=NOW() WHERE config_key IN ('content.plan.enabled','content.review.enabled');"
mysql -N website_java -e "SELECT config_key, LEFT(config_value,80) FROM sys_config WHERE config_key LIKE 'ai.chat.%' OR config_key IN ('content.plan.enabled','content.review.enabled','content.writer.fallbackModels') ORDER BY config_key;"
# quick java-side path: same as app
code=$(curl -4 -sS -m 90 -o /tmp/fufu_c2.out -w "%{http_code}" -X POST https://fufu.iqach.top/v1/chat/completions \
  -H "Authorization: Bearer sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f" \
  -H "Content-Type: application/json" \
  -d '{"model":"mimo-v2-flash","messages":[{"role":"user","content":"写30字开篇：普通人用AI提效"}],"max_tokens":80}')
echo "chat2_http=$code"
python3 -c 'import json;d=json.load(open("/tmp/fufu_c2.out"));c=((d.get("choices") or [{}])[0].get("message") or {}).get("content");print("content2:",(c or str(d))[:250])'