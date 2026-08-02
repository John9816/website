#!/usr/bin/env bash
set -euo pipefail

systemctl stop website-java-api.service
cp /opt/website-java-api/website.jar "/opt/website-java-api/website.jar.bak.$(date +%Y%m%d%H%M%S)"
mv /tmp/website.jar.new /opt/website-java-api/website.jar
chown root:root /opt/website-java-api/website.jar
systemctl start website-java-api.service
systemctl --no-pager --full status website-java-api.service | sed -n '1,18p'
