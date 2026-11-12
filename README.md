# 学城编辑器 · Cloudflare Workers 纯 Serverless 版

把原「music-replica 网关 + 学城 Node 本体」合并重写成单个 Cloudflare Worker，实现**零服务器、永久活**的文档编辑器。对应你定的路线：Workers Assets 一体 + D1 + R2 + 砍掉 MCP + Cloudflare Access 面板密码。

## 架构

```
浏览器 → Cloudflare 边缘（单一 Worker）
          ├─ Workers Assets：托管前端静态 dist/（同源 /editor）
          └─ Worker 脚本：/editor/api/* → D1 读写 + R2 图片
        + Cloudflare Access（面板密码 / 邮箱 OTP）前置鉴权
        + D1 数据库（docs / templates 表）
        + R2 存储桶（files/ 图片）
```

## 目录

```
xuecheng-workers/
  worker/index.js          Worker 后端（Hono）：docs / templates / share / upload / health
  migrations/
    0001_init.sql         D1 schema（docs / templates 表）
    seed.sql              从线上导出的真实数据（16 篇文档，可选导入）
  frontend/               前端源码（React + Vite）；构建产物 frontend/dist
  scripts/
    seed.mjs              从旧网关拉全量数据 → data/seed.json
    gen-sql.mjs           seed.json → seed.sql（D1 导入文件）
    migrate.mjs           seed.json → D1（逐条 API 插入；seed.sql 过大时备选）
  data/seed.json          已导出的真实数据（含正文、分享、父子关系）
  wrangler.toml           D1 + R2 + Assets 绑定配置
  vite.config.js          root=frontend，base=/editor/
```

## 与旧版（8787）的差异

| 项 | 旧版 | 本版（Workers） |
| --- | --- | --- |
| 进程 | music-replica 网关 + Node 学城本体（两进程） | 单一 Worker |
| 存储 | 本地 JSON 文件 + 图片目录 | D1 + R2 |
| 登录 | 网关 `xc_session` | **Cloudflare Access 面板密码**（学城本体零鉴权） |
| AI 面板 / MCP | 支持本地 stdio MCP | **已移除**（Workers 跑不了本地子进程） |
| 运维 | 需常驻服务器（7 个月后到期） | 零服务器，永久活 |

> 前端 AI 面板的 UI 仍保留，但调用 `/api/mcp/*` 会失败（已按你的决策移除 MCP）。文档编辑 / 分享 / 模板等核心功能不受影响。

## 部署（全新）

```bash
npm install                       # 安装 wrangler + 前端依赖
npx wrangler login                # 登录 Cloudflare
npx wrangler d1 create xuecheng   # 建 D1，复制返回的 id → 填 wrangler.toml 的 database_id
npx wrangler r2 bucket create xuecheng-files   # 建 R2 桶
npx wrangler d1 execute xuecheng --remote --file=./migrations/0001_init.sql   # 建表
npm run build                     # 构建前端 → frontend/dist
npx wrangler deploy               # 部署
```

## 从旧网关迁移数据（可选，含你的真实文档）

旧网关仍在 `http://111.91.20.67:8787` 时：

```bash
node scripts/seed.mjs             # 登录网关拉全量 → data/seed.json
node scripts/gen-sql.mjs          # → migrations/seed.sql
npx wrangler d1 execute xuecheng --remote --file=./migrations/seed.sql   # 导入
```

`data/seed.json` 与 `seed.sql` 已包含当前 **16 篇真实文档**（含正文、分享状态、父子关系）。已用 SQLite 引擎校验：16 篇全部导入成功、`content` 均为合法 JSON、`parentId` 无悬空引用、树结构完整（7 个顶级文档）。

> 若 `seed.sql` 因体积被 wrangler 拒绝，改用 `node scripts/migrate.mjs`（逐条 API 插入，需 `CF_ACCOUNT_ID` / `CF_API_TOKEN` 环境变量）。

## 配置 Cloudflare Access（必须）

学城本体**零鉴权**——任何能访问域名的人都能直接读改写。必须在 Worker 的自定义域前加 **Cloudflare Access** 应用：
- 面板密码（Shareable Link / Service Token）或邮箱 OTP；
- 这符合「AI 构建的页面必须要求面板密码」的约定，是访问主防线。

## DNS 切换

把你的域名（如 `km.751152.xyz`）指向 Worker：已在 `wrangler.toml` 通过 `routes` 配置为自定义域，`wrangler deploy` 会自动建 CNAME。访问入口为 `https://km.751152.xyz/editor/`。保留旧 IP 入口几天做回退，确认无异常后再收口。

## 本地开发 / 验证

```bash
npm run dev          # wrangler dev（本地 D1 / R2 / Assets 模拟）
npm run dev:frontend # 仅前端热更（vite 5180，代理 /editor/api 到本地 Worker）
```

## 安全

- 本体零鉴权，**务必**配 Access 面板密码（否则等于公开可写）。
- CORS 当前返回 `Access-Control-Allow-Origin: *`（同源下无害）；若后续要跨域带凭据，需收紧为具体 origin。

## 已验证

- Worker 语法检查通过；前端 `npm run build` 成功（61 模块，dist 已生成）。
- `migrations/seed.sql` 用 SQLite 引擎完整导入 16 篇文档，`content` 全为合法 JSON，`parentId` 无悬空。
- 数据完整性：16 篇 / 顶级 7 篇 / 树结构完整。
- 本地 `wrangler dev` 端到端验证需你的 Cloudflare 账户，请部署后按上面步骤确认。
