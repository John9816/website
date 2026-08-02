#!/bin/bash
mysql -N website_java -e "SELECT config_key, config_value FROM sys_config WHERE config_key LIKE '%model%' OR config_key LIKE '%writer%' OR config_key LIKE 'content.%' ORDER BY config_key;"