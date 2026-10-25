import { execSync } from 'child_process'
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

/**
 * Short commit of this build, shown in the app as the LIMS version (ISO/IEC 17025 7.11.2).
 * Railway sets RAILWAY_GIT_COMMIT_SHA; locally git is asked; otherwise 'unknown'.
 */
function buildCommit(): string {
  const fromEnv = (process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? '').trim()
  if (/^[0-9a-f]{7,40}$/i.test(fromEnv)) return fromEnv.slice(0, 7).toLowerCase()
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      cwd: __dirname,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    })
      .toString()
      .trim()
    return /^[0-9a-f]{4,40}$/i.test(sha) ? sha : 'unknown'
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react(), stampServiceWorker()],
  define: {
    __APP_COMMIT__: JSON.stringify(buildCommit()),
    __APP_BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
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
