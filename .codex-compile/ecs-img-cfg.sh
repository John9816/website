#!/usr/bin/env bash
mysql website_java -N -e "SELECT config_key, LEFT(config_value,100) FROM sys_config WHERE config_key LIKE '%image%' OR config_key LIKE '%wisart%' OR config_key LIKE '%cover%' OR config_key LIKE 'ai.image%' OR config_key LIKE 'content.autopilot%' ORDER BY config_key;"
