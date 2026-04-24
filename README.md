# 个人导航 - 前端

基于 Vite + React + TypeScript + Ant Design 的个人导航站前端，对接 Spring Boot 后端。

## 快速启动

```bash
npm install
npm run dev
```

默认打开 http://localhost:5173/

## 跨域处理

本项目采用 **vite dev server 反向代理** 方案，前端统一请求同源的相对路径 `/api/*`，由 vite 转发到后端，浏览器不会发起跨域请求。

- 代理目标通过 `VITE_PROXY_TARGET` 配置（仅 vite dev 读取，不会打入 bundle）
- 前端运行时用 `VITE_API_BASE`，默认为空 → 走相对路径 → 命中代理
- 切换本地后端：改 `.env` 的 `VITE_PROXY_TARGET=http://localhost:8080`，重启 `npm run dev`

生产部署时推荐前后端同域（Nginx 反向代理），此时 `VITE_API_BASE` 留空即可；若必须跨域部署（如 Vercel + 独立后端），填完整地址，并确保后端 `app.cors.allowed-origins` 加了前端域名。

## 配置

后端地址通过环境变量配置（见 `.env`）：

```
# 前端运行时 base — 留空则走 vite 代理（开发推荐）
VITE_API_BASE=

# vite dev 代理目标
VITE_PROXY_TARGET=http://localhost:8080
```

## 路由

| 路径 | 说明 |
| ---- | ---- |
| `/` | 公开导航页（调用 `/api/public/nav`） |
| `/admin/login` | 后台登录 |
| `/admin/categories` | 分类管理 |
| `/admin/links` | 链接管理 |
| `/admin/configs` | 系统配置 |
| `/admin/image` | 图片生成 |
| `/admin/password` | 修改密码 |

## 默认账号

首次启动后端会自动创建：
- 用户名：`admin`
- 密码：`admin123`

登录后请尽快通过 "修改密码" 修改。

## 图标

分类和链接的 `icon` 字段兼容两种格式：
- HTTP(S) URL —— 渲染为 `<img>`
- [Lucide 图标名](https://lucide.dev/icons)（如 `Navigation`、`Wrench`、`Coffee`）—— 渲染为 SVG

## 命令

| 命令 | 用途 |
| ---- | ---- |
| `npm run dev` | 启动开发服务器（端口 5173） |
| `npm run build` | 生产构建到 `dist/` |
| `npm run preview` | 本地预览构建产物 |
| `npm run lint` | TypeScript 类型检查 |
