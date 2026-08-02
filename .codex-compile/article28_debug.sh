#!/usr/bin/env bash
set -euo pipefail

mysql website_java -N -e "SELECT id,status,quality_score,error_message FROM content_article WHERE id=28;"
mysql website_java -N -e "SELECT risk_tips_json FROM content_article WHERE id=28;"
