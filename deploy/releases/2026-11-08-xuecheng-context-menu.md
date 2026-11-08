# 学城右键菜单修复

2026-11-08 09:59:51（Asia/Shanghai）已上线。

- 当前版本：`20261108T015923Z-xuecheng-context-a26fb0888eab`。
- 前端源码：`a26fb0888eab59b97752c8f6e5d29de2344c0424`。
- 发布包 SHA256：`509a79628b24a52115b06e604a2a71255d271474bc22ccad547e7156d704d4e8`。
- 回滚版本：`/opt/website/releases/20261107T130110Z-xuecheng-55b7357c1dc4`。

上游编辑器没有 contextmenu 处理，本次补充正文及侧栏文档操作。正文支持撤销、重做、剪切、复制、粘贴、全选和格式，表格内增加行列操作；侧栏支持打开、重命名、新建子文档、收藏、移动到根目录和删除确认。右键保留命中的选区，拒绝剪贴板权限时不会删除原文。菜单支持边缘定位、外部点击/滚动/Esc 关闭，正文支持 Shift+F10 唤起和键盘导航。

验证：先用浏览器复现右键无菜单，再通过编辑选区、剪贴板成功及拒绝、表格增删行列与撤销、重命名持久化、点击目标隔离、键盘和关闭行为回归。类型检查和生产构建通过；自动保存、登录续期、分享撤销、移动端及原知识库完整浏览器回归通过。线上加载真实发布资源，使用隔离 API 响应验证正文右键加粗及文档菜单，没有写入真实用户文档。线上静态资源与本地制品一致，服务健康，匿名文档 API 返回 401。

仅重启 website-ecs，Java 后端进程、Nginx、音乐下载和编辑器持久化配置保持原状。配置 SHA256 校验通过，website-ecs、website-api、nginx 均 active。

```sh
ln -sfn /opt/website/releases/20261107T130110Z-xuecheng-55b7357c1dc4 /opt/website/current.next
mv -Tf /opt/website/current.next /opt/website/current
systemctl restart website-ecs
curl --fail http://127.0.0.1:3000/healthz
```
