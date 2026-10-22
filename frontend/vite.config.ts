import fs from 'fs'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Stamps dist/sw.js with a per-build id so every deploy gets a fresh PWA cache. */
function stampServiceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'qirlpl-stamp-sw',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const swPath = path.join(outDir, 'sw.js')
      if (!fs.existsSync(swPath)) return
      const buildId = Date.now().toString(36)
      fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/__BUILD_ID__/g, buildId))
    },
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api/pdf': {
        target: 'http://127.0.0.1:3847',
        changeOrigin: true,
        rewrite: (p) => (p === '/api/pdf' ? '/pdf' : p.replace(/^\/api/, '')),
      },
    },
  },
})
