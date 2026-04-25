import { routes, type VercelConfig } from '@vercel/config/v1'

const backendUrl = process.env.BACKEND_URL?.trim().replace(/\/+$/, '')

if (!backendUrl) {
  throw new Error('BACKEND_URL is required for Vercel deploys.')
}

export const config: VercelConfig = {
  rewrites: [
    routes.rewrite('/api/:path*', `${backendUrl}/api/:path*`),
    routes.rewrite('/(.*)', '/index.html'),
  ],
}
