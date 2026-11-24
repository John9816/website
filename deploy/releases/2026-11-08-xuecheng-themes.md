# 学城统一入口与白天／黑夜模式

2026-11-08 10:17:14（Asia/Shanghai）已上线。

- 发布目录：`/opt/website/releases/20261108T021619Z-xuecheng-themes-4ae2c02fd5f8`
- 前端源码：`4ae2c02fd5f8fa7f3a1a1ff74acf5251aeaf787c`
- 后端源码：`658ac911897fd56d9163ce844ba323b5e351e11a`
- 发布包 SHA256：`2c03e853675cee1ae30239b17e4448d4328339731ac02b87986a36bcc232fc9b`
- 后端 JAR SHA256：`f01f8bbfc0ba5d7a32f9edcc423f7a0fe234cf3141c6e92c096f198a3fee2c0c`
- 回滚目录：`/opt/website/releases/20261108T015923Z-xuecheng-context-a26fb0888eab`

旧知识库的首页／后台入口、前端实现和 Java CRUD、附件、分享 Controller 已移除。旧后台地址跳转学城，旧公开分享页及全部历史 API 返回 410。数据库历史记录和附件保留，学城用户文档继续存储于 `/opt/website/shared/xuecheng`。

只保留白天与黑夜模式，旧背景图偏好归一为白天。学城共用网站字体、品牌色及主题变量；正文、侧栏、右键菜单、模板、AI 面板和分享页随主题切换。主题在首屏加载前应用，刷新和页面往返保留选择，跨标签页自动同步。

验证结果：

- 前端类型检查、生产构建通过；Node 服务测试 15/15；后端完整测试 325/325，clean package 通过。
- 本地完整浏览器回归通过：双模式、首屏暗色、旧偏好迁移、主题偏好存储异常、跨标签页、页面往返、右键选区与剪贴板、表格、自动保存、登录续期、模板、分享撤销和手机布局。
- 线上真实静态资源完成同一套浏览器回归，所有 API 请求转入本地隔离数据，未写入真实用户文档。截图在本地 `output/xuecheng/production-themes/`。
- 线上真实 HTTPS API 使用临时用户验证用户隔离、CRUD、磁盘保存、模板、分享撤销、上传及 MCP 权限，临时账号与数据已清理。
- `hi.751152.xyz` 和 `api.751152.xyz` 的历史知识库 API 均返回 410；学城入口 200，匿名文档 API 401。
- website-api、website-ecs、nginx 均 active。Nginx、音乐下载配置、systemd 和学城环境变量的发布前后校验和一致。

发布使用 `deploy/activate-workspace.sh`，原子切换前后端版本并重启 website-api、website-ecs。旧哈希静态资源保留供已打开标签页使用。

```sh
ln -sfn /opt/website/releases/20261108T015923Z-xuecheng-context-a26fb0888eab /opt/website/current.next
mv -Tf /opt/website/current.next /opt/website/current
systemctl restart website-api website-ecs
curl --fail http://127.0.0.1:8090/health
curl --fail http://127.0.0.1:3000/healthz
```

回滚会恢复原知识库功能及三种主题；共享数据无需回滚。
