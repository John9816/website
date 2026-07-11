import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_PROXY_TARGET || 'http://localhost:8080'

  return {
    plugins: [
      react(),
      legacy({
        targets: ['Android >= 5', 'Chrome >= 39', 'iOS >= 10'],
        additionalLegacyPolyfills: [
          'whatwg-fetch',
          'abortcontroller-polyfill/dist/polyfill-patch-fetch',
          'intersection-observer',
        ],
        modernPolyfills: false,
        renderLegacyChunks: true,
      }),
    ],
    build: {
      target: 'es2018',
      cssTarget: 'chrome61',
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')
            if (!normalizedId.includes('/node_modules/')) return
            if (
              normalizedId.includes('/node_modules/react/') ||
              normalizedId.includes('/node_modules/react-dom/') ||
              normalizedId.includes('/node_modules/react-router-dom/') ||
              normalizedId.includes('/node_modules/@remix-run/router/') ||
              normalizedId.includes('/node_modules/scheduler/')
            ) {
              return 'vendor-react'
            }
            if (
              normalizedId.includes('/node_modules/antd/') ||
              normalizedId.includes('/node_modules/@ant-design/') ||
              normalizedId.includes('/node_modules/rc-')
            ) {
              return 'vendor-antd'
            }
            if (normalizedId.includes('/node_modules/@tiptap/') || normalizedId.includes('/node_modules/prosemirror')) {
              return 'vendor-editor'
            }
            if (
              normalizedId.includes('/node_modules/react-markdown/') ||
              normalizedId.includes('/node_modules/remark-') ||
              normalizedId.includes('/node_modules/rehype-') ||
              normalizedId.includes('/node_modules/unified/') ||
              normalizedId.includes('/node_modules/micromark') ||
              normalizedId.includes('/node_modules/mdast-') ||
              normalizedId.includes('/node_modules/hast-') ||
              normalizedId.includes('/node_modules/unist-') ||
              normalizedId.includes('/node_modules/vfile') ||
              normalizedId.includes('/node_modules/bail/') ||
              normalizedId.includes('/node_modules/ccount/') ||
              normalizedId.includes('/node_modules/character-') ||
              normalizedId.includes('/node_modules/comma-separated-tokens/') ||
              normalizedId.includes('/node_modules/decode-named-character-reference/') ||
              normalizedId.includes('/node_modules/devlop/') ||
              normalizedId.includes('/node_modules/html-url-attributes/') ||
              normalizedId.includes('/node_modules/is-alphabetical/') ||
              normalizedId.includes('/node_modules/is-alphanumerical/') ||
              normalizedId.includes('/node_modules/is-decimal/') ||
              normalizedId.includes('/node_modules/is-hexadecimal/') ||
              normalizedId.includes('/node_modules/markdown-table/') ||
              normalizedId.includes('/node_modules/property-information/') ||
              normalizedId.includes('/node_modules/space-separated-tokens/') ||
              normalizedId.includes('/node_modules/trim-lines/') ||
              normalizedId.includes('/node_modules/trough/') ||
              normalizedId.includes('/node_modules/zwitch/')
            ) {
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
