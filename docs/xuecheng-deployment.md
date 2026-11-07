# 学城文档运维

入口为 `/editor/`，网站首页和管理工作台菜单均有“学城文档”。已有网站账号直接使用；文档、模板按账号隔离。公开分享仅能读取指定文档，关闭分享后立即失效。

源码基于 `John9816/xuecheng-editor` 的 `e72dc77e1a13c181cdde43bf818059527d50b846`，见 `src/features/xuecheng/UPSTREAM.md`。API 挂在已有 ECS Node 服务下，不需要 Java 数据库迁移。原“知识库”继续独立使用。

## 运行配置

系统服务 `website-ecs` 的 `xuecheng.conf` drop-in 读取 `/opt/website/xuecheng.env`：

```dotenv
EDITOR_DATA_DIR=/opt/website/shared/xuecheng
EDITOR_MCP_HOME=/var/lib/website-xuecheng-mcp
EDITOR_MCP_UID=65534
EDITOR_MCP_GID=65534
```

文档位于 `users/<网站用户ID>/docs.json`，模板为 `templates.json`，分享索引为 `shares.json`，图片位于 `files/`。数据目录 700、JSON 和图片 600；JSON 原子替换，读取失败会报错，不能以空数据覆盖。发布与回滚不得删除这个目录。备份须覆盖整个目录，包括图片和分享索引；需要一致快照时短暂停止 `website-ecs`，打包后再启动。

MCP 仅系统管理员可管理，stdio 以 nobody 运行，不继承网站服务密钥；配置里的密钥保存在受限的 `mcp.json`，列表仅返回键名。MCP home 独立于私有文档目录。自动连接在管理员首次使用 MCP API 时触发；重启不会无条件拉起外部工具。上游“AI 助手”保留文本技能及 MCP 工具，未新增模型调用或付费推理服务。

上传支持 PNG/JPEG/GIF/WebP，最大 5MB；文档内容最大 2MB、每用户最多 2000 篇。图片使用随机能力 URL，持有 URL 的人可以访问，撤销文档分享不撤销已取得的图片 URL。数据为单进程 JSON 存储，暂不支持多人实时协作或同时运行多个写入实例。

## 验证与构建

```sh
node --test server/ecs-server.test.mjs server/xuecheng*.test.mjs
npm run build
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node deploy/verify-xuecheng.mjs
```

浏览器验证使用临时身份服务与独立存储，不写线上业务数据；包含自动保存、切换文档、登录续期、浏览器后退、模板、公开分享撤销、移动端，以及原知识库回归。截图写入 `output/xuecheng/`。

本地开发需要两个进程：`BACKEND_URL=http://127.0.0.1:8090 npm run ecs:serve` 与 `npm run dev`。Vite 将 `/editor/api`、`/editor/files` 代理到 localhost:3000，可通过 `VITE_EDITOR_PROXY_TARGET` 覆盖。

## 发布与回滚

先完成构建和验证，再把 `dist/`、`server/` 打包为新版本的 `frontend/`，将 `deploy/activate-xuecheng.sh`、`deploy/verify-xuecheng-production.py` 放入版本的 `xuecheng-ops/`，写入 `meta/release.env`（RELEASE_ID、FRONTEND_SHA、index.html SHA256、上游提交），上传至 `/opt/website/releases/<版本>/`。不要上传本地数据或环境文件。

运行 `bash deploy/activate-xuecheng.sh <版本>`（脚本须先上传到服务器）。脚本备份配置、复用当前后端和 ops、在 3002 端口预检，随后原子切换 current 并仅重启 website-ecs；失败自动回滚。不会覆盖 Nginx 或音乐下载配置。预检要求 3002 空闲。

上线后检查 HTTPS `/editor/`、新资源、`/editor/api/docs` 未登录返回 401、登录后 CRUD 与用户隔离、分享撤销、首页/音乐/原知识库。可用 `deploy/verify-xuecheng-production.py` 在服务器创建短期测试账号并验证真实后端鉴权；该脚本不输出令牌或数据库密钥，结束后删除自己的账号和文档夹。

手动回滚（从对应 `meta/release.env` 读取 PREVIOUS_RELEASE）：

```sh
ln -sfn /opt/website/releases/<旧版本> /opt/website/current.next
mv -Tf /opt/website/current.next /opt/website/current
systemctl restart website-ecs
curl --fail http://127.0.0.1:3000/healthz
```

保留 `/opt/website/shared/xuecheng` 和 drop-in，后续再部署编辑器即可恢复访问。每次发布结果记录在 `deploy/releases/`。
