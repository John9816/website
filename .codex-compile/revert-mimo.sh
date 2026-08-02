#!/bin/bash
mysql website_java -e "UPDATE sys_config SET config_value='http://127.0.0.1:18787/v1', updated_at=NOW() WHERE config_key='ai.chat.baseUrl';"
mysql website_java -e "UPDATE sys_config SET config_value='sk-mimo-e827e268c9f9afde9610ac28a6c90bd76bf7f2ccd472589e8d9242050d96437f', updated_at=NOW() WHERE config_key='ai.chat.apiKey';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash', updated_at=NOW() WHERE config_key='ai.chat.defaultModel';"
mysql website_java -e "UPDATE sys_config SET config_value='mimo-v2-flash,mimo-v2.5', updated_at=NOW() WHERE config_key='ai.chat.models';"
# remove xiaomimimo fallback temporarily to avoid invalid key noise - optional via empty
mysql website_java -e "DELETE FROM sys_config WHERE config_key='content.writer.fallbackBaseUrls';" 2>/dev/null || true
mysql -N website_java -e "SELECT config_key, LEFT(config_value,90) FROM sys_config WHERE config_key LIKE 'ai.chat.%' ORDER BY config_key;"