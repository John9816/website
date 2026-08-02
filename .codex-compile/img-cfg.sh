#!/bin/bash
journalctl -u website-java-api --since "15 min ago" --no-pager | tail -100
echo ====CFG====
mysql -N website_java -e "SELECT config_key, LEFT(config_value,100) FROM sys_config WHERE config_key LIKE 'ai.%' OR config_key LIKE '%image%' ORDER BY config_key;"
echo ====THREADS====
ps -eLf | grep website.jar | head -5