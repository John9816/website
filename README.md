# Personal Navigation Frontend

Vite + React + TypeScript frontend for a personal navigation site, with music pages and an admin panel.

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

Do not hardcode the public backend domain into the frontend bundle unless you explicitly want browsers to call it directly.

## Environment Variables

Example:

```env
VITE_API_BASE=
VITE_PROXY_TARGET=http://localhost:8080
BACKEND_URL=https://your-backend.example.com
```

`BACKEND_URL` is only needed for the Vercel proxy.

## Routes

- `/`: public navigation page
- `/music`: music explorer
- `/admin/login`: admin login
- `/admin/categories`: category management
- `/admin/links`: link management
- `/admin/configs`: system configs
- `/admin/image`: image generation
- `/admin/password`: change password

## Commands

- `npm run dev`: start the dev server
- `npm run build`: build production assets into `dist/`
- `npm run preview`: preview the build locally
- `npm run lint`: run TypeScript type checking
