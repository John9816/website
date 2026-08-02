#!/bin/bash
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash', updated_at=NOW() WHERE config_key='content.writer.fallbackModels';"
mysql website_java -e "UPDATE sys_config SET config_value='false', updated_at=NOW() WHERE config_key IN ('content.plan.enabled','content.review.enabled');"
# leave evidence if needed
mysql -N website_java -e "SELECT config_key,config_value FROM sys_config WHERE config_key IN ('content.writer.fallbackModels','content.plan.enabled','content.review.enabled','content.evidence.enabled','ai.chat.baseUrl','ai.chat.defaultModel');"