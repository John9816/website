#!/usr/bin/env bash
mysql website_java -N -e "SELECT risk_tips_json FROM content_article WHERE id=44;"
echo "---"
mysql website_java -N -e "SELECT IF(risk_tips_json LIKE '%local template%', 'HAS_TEMPLATE', 'NO_TEMPLATE'), IF(risk_tips_json LIKE '%writerFallback%' OR risk_tips_json LIKE '%AI 正文失败%', 'FALLBACK_GATE', 'OKISH') FROM content_article WHERE id=44;"
