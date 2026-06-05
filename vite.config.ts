import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-')) {
              return 'vendor-antd'
            }
            if (id.includes('@tiptap') || id.includes('prosemirror')) {
              return 'vendor-editor'
            }
            if (id.includes('react-markdown') || id.includes('remark-') || id.includes('unified')) {
              return 'vendor-markdown'
            }
          },
        },
      },
    },
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
