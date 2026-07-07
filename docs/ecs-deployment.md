# ECS deployment

This repository can run on ECS without Cloudflare Pages Functions. The ECS runtime serves the Vite `dist/` directory and keeps the same same-origin proxy contract:

- `/api/*` proxies to `BACKEND_URL`
- `/_image?url=...` proxies public HTTP/HTTPS images with the existing blocked-host checks
- `/_media?url=...` proxies only `kuwo.cn` media URLs and forwards range headers
- all other routes fall back to `index.html`

Pages and Workers can stay online while ECS is verified.

## Build locally

```bash
npm install
npm run build
```

## Run locally like ECS

```bash
BACKEND_URL=https://api.751152.xyz PORT=3000 node server/ecs-server.mjs
```

On PowerShell:

```powershell
$env:BACKEND_URL="https://api.751152.xyz"
$env:PORT="3000"
node server/ecs-server.mjs
```

## Deploy from Windows

```powershell
.\deploy\ecs-deploy.ps1 -HostName <ecs-public-ip> -User root -BackendUrl https://api.751152.xyz
```

The script builds the frontend, uploads `dist/`, `server/`, and deployment templates to `/opt/website`, writes `/opt/website/.env.ecs`, and starts `website-ecs.service` when systemd is available.

## Nginx

Copy `deploy/nginx.website.conf` to the server, update `server_name`, then enable it:

```bash
sudo cp /opt/website/deploy/nginx.website.conf /etc/nginx/conf.d/website.conf
sudo nginx -t
sudo systemctl reload nginx
```

After DNS points the ICP-approved domain to ECS, add HTTPS with your preferred ACME client. Keep Cloudflare Pages and Workers records unchanged until these checks pass:

```bash
curl -I http://<ecs-ip>/healthz
curl -I http://<ecs-ip>/
curl -I "http://<ecs-ip>/_media?url=https://kuwo.cn/"
curl -I "http://<ecs-ip>/api/health"
```

## Backend note

This frontend repository does not contain the actual backend or Workers source. ECS can proxy `/api/*` to the current backend with `BACKEND_URL=https://api.751152.xyz` as a transition path. To fully migrate the backend process itself, provide the backend repository or the Worker source plus its environment variables, database/storage credentials, and target domain plan.
