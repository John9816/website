const backendUrl = process.env.BACKEND_URL?.trim().replace(/\/+$/, '')

if (!backendUrl) {
  throw new Error('BACKEND_URL is required for Vercel deploys.')
}

export const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  rewrites: [
    {
      source: '/api/:path*',
      destination: `${backendUrl}/api/:path*`,
    },
    {
      source: '/(.*)',
      destination: '/index.html',
    },
  ],
}
