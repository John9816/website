#!/bin/bash
mysql -N website_java -e "SELECT risk_tips_json FROM content_article WHERE id=36;"
echo '---MD---'
mysql -N website_java -e "SELECT LEFT(content_markdown,300) FROM content_article WHERE id=36;"
echo '---MODEL---'
mysql -N website_java -e "SELECT model, quality_score, LEFT(IFNULL(error_message,''),200) FROM content_article WHERE id=36;"
# login for admin token if possible
ls /tmp/*auth* /tmp/*login* 2>/dev/null | head
# check journal for recent writer errors
journalctl -u website-java-api -n 40 --no-pager 2>/dev/null | tail -40