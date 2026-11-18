import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端部署在 /editor/ 子路径下，base 必须与 Workers Assets 的访问路径一致
export default defineConfig({
  plugins: [react()],
  root: 'frontend',
  base: '/editor/',
  resolve: {
    // 强制 prosemirror 核心包单一实例：否则 ESM 直接 import 与 prosemirror-view
    // 内部 require 会解析出两个不同的 CellSelection 类，导致 instanceof 比较全部失效
    dedupe: ["prosemirror-state", "prosemirror-model", "prosemirror-view", "prosemirror-tables"],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 稳定的 vendor 分块：react / 图标 / 编辑器内核各自独立，便于浏览器长期缓存；
        // 其中 vendor-pm 只被按需加载的 chunk 引用，不会进入首屏 modulepreload。
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/.test(id)) return "vendor-react";
          if (id.includes("@ant-design")) return "vendor-icons";
          if (/prosemirror-|rope-sequence|orderedmap|w3c-keyname/.test(id)) return "vendor-pm";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5180,
    proxy: {
      "/editor/api": "http://localhost:8790",
    },
  },
})
