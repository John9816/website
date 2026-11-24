# 汽水音乐（黑源）网页接入

音乐页 → 搜索 → 汽水音乐（黑源）。支持歌曲/歌单搜索、歌词、歌单详情和收藏。复用现有播放、分享、历史、喜欢及我的歌单组件；长歌曲 ID 和 `playlistId:ownerId:type` 歌单 ID 始终作为字符串传递。

来源名称及能力统一位于 `src/features/music/sources.ts`。汽水仅开放歌曲和歌单搜索，点击歌曲中的歌手/专辑信息时转为歌曲关键词搜索；榜单、新歌、推荐歌单继续使用原有来源范围。

黑源授权窗口独立位于 `src/features/music/QishuiAccountControl.tsx`，通过本站 `/api/v1/music/qishui` 接口获取状态、创建二维码、轮询、刷新和解绑。二维码为 PNG base64；由用户使用抖音扫码确认。每2秒串行轮询，终态停止；窗口关闭或网站登录会话变化时取消请求和计时器，旧响应不能写回新会话。前端不保存个人票据、证书、私钥或 OAuth 应用参数。

个人扫码与 TuneFree v1 播放服务独立。上游加密音频在网页显示暂不支持；解析服务未配置时明确提示，搜索与收藏仍可用。

后端部署前需要新增 `user_qishui_account` 表，配置固定 `QISHUI_ENCRYPTION_KEY` 及三个 OAuth 应用参数。播放另需 `QISHUI_PARSE_ACCESS_TOKEN`。完整协议在后端仓库 `docs/tunefree-next-qishui-api.md`。

验证命令：

```sh
npm run lint
node --test tests/music-sources.test.mjs server/*.test.mjs
npm run build
# 启动 Vite 或预览服务后执行；PLAYWRIGHT_MODULE 可指向已安装的 Playwright。
SMOKE_BASE_URL=http://127.0.0.1:5187 node deploy/verify-qishui-music.mjs
```

浏览器用合成数据验证桌面/手机上的搜索、复合歌单 ID、扫码状态机、刷新、解绑、关闭取消、账号隔离及加密媒体提示，不代表真实扫码确认或真实播放已经验证。真实网络验证需另行记录。
