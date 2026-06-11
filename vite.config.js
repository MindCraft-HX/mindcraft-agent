import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 16288,
    hmr: false,
    cors: true,
    proxy: {
      '/abc': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    vue(),
    electron({
      main: {
        entry: 'electron/main.js',
      },
      preload: {
        input: 'electron/preload.js',
      },
    }),
  ],
  resolve: {
    alias: {
      '@mindcraft/agent/render': fileURLToPath(new URL('./packages/agent/src/components/agentCommon/render.js', import.meta.url)),
      '@mindcraft/agent': fileURLToPath(new URL('./packages/agent/src/index.js', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  externals: {
    'electron-screenshots': 'require("electron-screenshots")',
  },
  envDir: './config',
  base: './',
  build: {
    chunkSizeWarningLimit: 3000,
    polyfillDynamicImport: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/@datatraccorporation/markdown-it-mermaid/node_modules/mermaid/')) {
            return 'vendor-mermaid-legacy'
          }

          if (
            id.includes('/@datatraccorporation/markdown-it-mermaid/') ||
            id.includes('/markdown-it-mermaid/')
          ) {
            return 'vendor-diagrams'
          }

          if (id.includes('/markmap-lib/') || id.includes('/markmap-view/')) {
            return 'vendor-markmap'
          }

          if (
            id.includes('/markdown-it/') ||
            id.includes('/highlight.js/') ||
            id.includes('/katex/') ||
            id.includes('/vue-katex-auto-render/')
          ) {
            return 'vendor-markdown'
          }

          if (id.includes('/pdfjs-dist/') || id.includes('/mammoth/')) {
            return 'vendor-doc-preview'
          }
        },
      },
    },
  },
})
