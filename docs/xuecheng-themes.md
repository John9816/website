# 学城统一文档入口与双主题

2026-11-08

文档工作区统一为学城。首页和后台只展示“学城文档”，旧 `/admin/kb/*` 入口转到 `/editor/`；旧 `/kb/*` 分享地址返回 HTTP 410 和下线说明。删除原知识库前端页面、API 封装、类型及专用样式。保留内容工厂使用的公共富文本组件。

后端删除旧知识库的 CRUD、附件与分享 Controller，所有历史知识库 API 返回 410、`Cache-Control: no-store`。保留数据库表、历史记录和附件文件；本次不迁移、不清空历史数据。学城继续使用按用户隔离的现有持久化目录。

主题只支持白天（light）和黑夜（dark）。网站与学城共用 `nav.theme`、ThemeProvider、ThemeToggle 和全局色彩变量。旧 image 或无效值归一到 light，HTML 在首次绘制前应用保存的主题，React 在绘制前同步主题，storage 事件同步其他标签页。主题偏好读写失败时仍可在当前页面切换。

学城的正文、侧栏、工具栏、右键菜单、AI 面板、模板预览、分享弹窗和公开分享页共用网站的字体、品牌色及明暗表面。用户正文中显式设置的文字和背景颜色保留。

验证命令：

```sh
npm run build
node --test server/ecs-server.test.mjs server/xuecheng.test.mjs server/xuecheng-autosave.test.mjs server/xuecheng-mcp.test.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node deploy/verify-xuecheng.mjs
# 后端目录
mvn clean package
```

浏览器回归覆盖主题选项、暗色表面、刷新记忆、跨标签页同步、旧偏好迁移、首次绘制、存储不可用、首页/后台往返，以及原有自动保存、登录续期、右键操作、模板、分享和移动端布局。

发布使用 `deploy/activate-workspace.sh` 同步切换前后端版本，保留当前 Nginx、systemd、环境变量及共享数据目录，健康检查失败自动恢复原版本并重启服务。回滚需要同时重启 `website-api` 和 `website-ecs`。
