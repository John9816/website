#!/usr/bin/env bash
# 学城 Workers + D1 + R2 一键部署脚本
# 凭据从 .env.deploy 读取（不回显 token），部署结束后自动删除该文件。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f .env.deploy ]; then
  echo "缺少 .env.deploy。请创建该文件（权限 600），内容为："
  echo "  CLOUDFLARE_API_TOKEN=你的token"
  echo "  CLOUDFLARE_ACCOUNT_ID=你的账户ID"
  exit 1
fi

# 仅在脚本作用域内导入凭据，不在 stdout 回显
set -a
source .env.deploy
set +a
: "${CLOUDFLARE_API_TOKEN:?请在 .env.deploy 设置 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?请在 .env.deploy 设置 CLOUDFLARE_ACCOUNT_ID}"

echo "=== 1) 创建 D1 数据库 'xuecheng' ==="
npx wrangler d1 create xuecheng > /tmp/d1create.txt 2>&1 || true
DB_ID="$(grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' /tmp/d1create.txt | head -1 || true)"
if [ -z "$DB_ID" ]; then
  echo "未能从输出解析 D1 id，请查看 /tmp/d1create.txt 或手动把 id 填入 wrangler.toml 的 database_id。"
  echo "若数据库已存在，请直接复制其 ID 替换 wrangler.toml 中的 REPLACE_WITH_YOUR_D1_ID 后重跑。"
  exit 1
fi
echo "D1 id = $DB_ID"
sed -i "s/REPLACE_WITH_YOUR_D1_ID/$DB_ID/" wrangler.toml

echo "=== 2) 创建 R2 桶 'xuecheng-files' ==="
npx wrangler r2 bucket create xuecheng-files || echo "(若已存在可忽略)"

echo "=== 3) 导入 schema ==="
npx wrangler d1 execute xuecheng --remote --file=./migrations/0001_init.sql

echo "=== 4) 导入种子数据（你的 16 篇真实文档）==="
npx wrangler d1 execute xuecheng --remote --file=./migrations/seed.sql

echo "=== 5) 构建前端 ==="
npm run build

echo "=== 6) 部署 Worker ==="
npx wrangler deploy

# 清理临时凭据
rm -f .env.deploy
echo
echo "✅ 部署完成。Worker 默认域名通常为 https://xuecheng-editor.<subdomain>.workers.dev"
echo "下一步（建议手动，更安全）："
echo "  1) 已在 wrangler.toml 配置自定义域 km.751152.xyz，deploy 会自动建 CNAME"
echo "  2) 在 Zero Trust → Access 加一条策略：面板密码 / 邮箱 OTP（学城本体零鉴权，这道门是主防线）"
echo "  3) 临时凭据 .env.deploy 已删除，请到 Cloudflare Dashboard 撤销本次使用的 API Token。"
