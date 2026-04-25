import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: false,
          xfwd: true,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Strip browser origin metadata in local development so the backend
              // treats proxied requests as same-site requests from the dev server.
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('referer')

              if (req.headers.host) {
                proxyReq.setHeader('x-forwarded-host', req.headers.host)
              }

              proxyReq.setHeader('x-forwarded-proto', 'http')
            })
          },
        },
      },
    },
  }
})
