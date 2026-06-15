# Personal Navigation Frontend

Vite + React + TypeScript frontend for the `website` backend.

It now covers:

- public navigation homepage
- user registration / login / current-user session
- per-user navigation category and link management
- AI chat workspace with model list, backend-provided voice list, SSE streaming audio events, audio input, message audio replay, standalone TTS preview, and audio regeneration
- image generation and editing with per-user history
- knowledge base spaces, document tree, tags, version history, and public share page
- music aggregation pages, per-user track sharing, and a public song share page

## Quick Start

```bash
npm install
npm run dev
```

Default local URL: `http://localhost:5173`

## API Strategy

The frontend should prefer same-origin `/api/*` requests.

- In development, keep `VITE_API_BASE` empty and use `VITE_PROXY_TARGET` so the Vite dev server proxies `/api/*` to the backend.
- In production, keep `VITE_API_BASE` empty so the browser still requests `/api/*` on the current domain.
- On Vercel, configure `BACKEND_URL` and let [vercel.ts](/D:/Projects/VSCode/website/vercel.ts) proxy `/api/:path*` to the backend.
- On Cloudflare Pages, configure `BACKEND_URL` and let Pages Functions proxy `/api/*`, `/_image`, and `/_media`.

Frontend endpoint conventions:

- public read routes: `/api/public/*`
- logged-in user routes: `/api/user/*`
- admin-only system config routes: `/api/admin/configs/*`
- content factory routes: `/api/admin/content/*`
- music BFF routes: `/api/v1/music/*`

Content factory automation contract:

- `GET /api/admin/content/automation?articleId=123`
- `POST /api/admin/content/automation/jobs/retry`
- article payloads may include `automation.logs`, `automation.jobs`, `automation.publishRecords`, and `automation.currentStage`

Do not hardcode the public backend domain into the frontend bundle unless you explicitly want browsers to call it directly.

## Environment Variables

Example:

```env
VITE_API_BASE=
VITE_PROXY_TARGET=http://localhost:8080
BACKEND_URL=https://your-backend.example.com
```

`BACKEND_URL` is only needed by the production deployment proxy.
Current Workers backend:

```env
BACKEND_URL=https://website-api.1255542159.workers.dev
```

## Cloudflare Pages

Use these settings when creating the Pages project:

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: 20 or newer
- Environment variable: `BACKEND_URL=https://website-api.1255542159.workers.dev`

The repository includes:

- [wrangler.toml](/D:/Projects/VSCode/website/wrangler.toml): Pages output directory and compatibility date
- [functions/api/[[path]].ts](/D:/Projects/VSCode/website/functions/api/[[path]].ts): same-origin `/api/*` backend proxy
- [functions/_image.ts](/D:/Projects/VSCode/website/functions/_image.ts): mixed-content-safe image proxy
- [functions/_media.ts](/D:/Projects/VSCode/website/functions/_media.ts): Kuwo media proxy
- [public/_routes.json](/D:/Projects/VSCode/website/public/_routes.json): routes only API/proxy paths through Functions

For a manual deploy after logging in with Wrangler:

```bash
npm run pages:deploy
```

For local Pages emulation:

```bash
npm run pages:dev
```

## Routes

- `/`: public navigation page
- `/login`: user login
- `/register`: user registration
- `/ai-chat`: AI workspace
- `/ai-image`: AI image generation and editing
- `/music`: music explorer
- `/music/share/:token`: public music share page
- `/kb/share/:token`: public knowledge-base share page
- `/admin/login`: admin login
- `/admin/categories`: category management
- `/admin/links`: link management
- `/admin/configs`: system configs
- `/admin/kb`: knowledge-base management
- `/admin/password`: change password

## Commands

- `npm run dev`: start the dev server
- `npm run build`: build production assets into `dist/`
- `npm run preview`: preview the build locally
- `npm run lint`: run TypeScript type checking
