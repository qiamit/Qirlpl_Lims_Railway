#!/usr/bin/env node
/**
 * Repeatable calculation validation for the QIRLPL LIMS (ISO/IEC 17025 7.11.6).
 *
 *   cd frontend && npm run validate:calculations
 *   node scripts/validation/run-calculation-validation.mjs [--out <dir>] [--quiet]
 *
 * What it does
 *   1. Bundles the real calculation modules from src/ with esbuild (the same
 *      TypeScript the app ships), with the database client replaced by a stub
 *      that refuses any network call. Runs fully offline.
 *   2. Runs every reference case in calculationCases.mjs (hand-calculated
 *      expected values, with the source of each).
 *   3. Prints a PASS / KNOWN / FIXED / FAIL table and writes JSON evidence:
 *        scripts/validation/out/calculation-validation-<time>.json
 *        scripts/validation/out/latest.json
 *      The JSON can be imported on the LIMS page Quality → LIMS Validation
 *      Runs ("Import evidence JSON") as a validation_test_runs record.
 *
 * Exit code 0 when no case FAILs (KNOWN deviations are listed, not failed),
 * 1 when any case fails, 2 when the modules cannot be bundled or loaded.
 */

import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as esbuild from 'esbuild'
import { CASES, MODULE_FILES } from './calculationCases.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..', '..')
const SRC = path.join(FRONTEND, 'src')

const args = process.argv.slice(2)
const argValue = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const OUT_DIR = path.resolve(argValue('--out') ?? path.join(HERE, 'out'))
const QUIET = args.includes('--quiet')

// ---------------------------------------------------------------- helpers

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: FRONTEND, stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).toString().trim()
  } catch {
    return ''
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex')
}

function readAppVersion() {
  const commit = git('rev-parse --short HEAD') || 'unknown'
  const files = Object.values(MODULE_FILES)
  const dirtyList = git(`status --porcelain -- ${files.map((f) => `"${f}"`).join(' ')}`)
  let pkgVersion = null
  try {
    pkgVersion = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'package.json'), 'utf8')).version ?? null
  } catch {
    /* ignore */
  }
  const envVersion = (process.env.VITE_APP_VERSION ?? '').trim()
  return {
    version: envVersion || commit,
    commit,
    branch: git('rev-parse --abbrev-ref HEAD') || null,
    packageVersion: pkgVersion,
    // Uncommitted edits in the files under test: the evidence then belongs to
    // the working copy, not to the commit.
    uncommittedChangesInTestedFiles: dirtyList
      ? dirtyList.split('\n').map((l) => l.slice(3).trim()).filter(Boolean)
      : [],
  }
}

/** Numbers within tol, everything else by structure. */
function same(actual, expected, tol) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (Number.isNaN(expected)) return Number.isNaN(actual)
    return tol ? Math.abs(actual - expected) <= tol : Object.is(actual, expected) || actual === expected
  }
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') {
    return actual === expected
  }
  if (Array.isArray(expected) !== Array.isArray(actual)) return false
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
  for (const k of keys) {
    if (!same(actual[k], expected[k], tol)) return false
  }
  return true
}

function show(v) {
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(12)))
  if (v === undefined) return 'undefined'
  return JSON.stringify(v, (_k, x) => (typeof x === 'number' && !Number.isInteger(x) ? Number(x.toPrecision(12)) : x))
}

function clip(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ---------------------------------------------------------------- bundle

/** '@/x' → src/x; the Supabase client → a stub that refuses network use. */
const resolvePlugin = {
  name: 'qirlpl-validation-resolve',
  setup(build) {
    build.onResolve({ filter: /^@\/lib\/supabaseClient$/ }, () => ({ path: 'supabase-stub', namespace: 'qirlpl-stub' }))
    build.onLoad({ filter: /.*/, namespace: 'qirlpl-stub' }, () => ({
      loader: 'js',
      contents: `
        const refuse = () => { throw new Error('Network access is disabled in the calculation validation run') }
        const handler = { get: () => new Proxy(refuse, handler), apply: refuse }
        export const supabase = new Proxy(refuse, handler)
      `,
    }))
    build.onResolve({ filter: /^@\// }, (args) =>
      build.resolve(`./${args.path.slice(2)}`, { resolveDir: SRC, kind: args.kind, importer: args.importer }),
    )
  },
}

async function bundleModules() {
  const entry = Object.entries(MODULE_FILES)
    .map(([name, file]) => `export * as ${name} from './${file.replace(/^src\//, '').replace(/\.ts$/, '')}'`)
    .join('\n')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qirlpl-calc-validation-'))
  const outfile = path.join(tmp, 'calc-bundle.mjs')
  await esbuild.build({
    stdin: { contents: entry, resolveDir: SRC, loader: 'ts', sourcefile: 'validation-entry.ts' },
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    outfile,
    logLevel: 'silent',
    plugins: [resolvePlugin],
    define: {
      'import.meta.env': JSON.stringify({ MODE: 'validation', DEV: false, PROD: true, SSR: true }),
      __APP_COMMIT__: 'undefined',
      __APP_BUILT_AT__: 'undefined',
    },
    // Browser globals some modules touch lazily; never at import time.
    banner: { js: 'globalThis.window ??= undefined;' },
  })
  const bundle = fs.readFileSync(outfile)
  const mod = await import(pathToFileURL(outfile).href)
  fs.rmSync(tmp, { recursive: true, force: true })
  return { mod, bundleSha256: sha256(bundle) }
}

// ---------------------------------------------------------------- run

async function main() {
  const startedAt = new Date()
  const app = readAppVersion()

  let mod
  let bundleSha256
  try {
    ;({ mod, bundleSha256 } = await bundleModules())
  } catch (err) {
    console.error('Could not bundle or load the calculation modules:\n', err?.message ?? err)
    process.exit(2)
  }

  const moduleHashes = Object.fromEntries(
    Object.entries(MODULE_FILES).map(([name, file]) => [
      name,
      { file: `frontend/${file}`, sha256: sha256(fs.readFileSync(path.join(FRONTEND, file))) },
    ]),
  )

  const results = []
  for (const c of CASES) {
    let actual
    let error = null
    try {
      actual = await c.run(mod)
    } catch (err) {
      error = String(err?.message ?? err)
    }
    let status
    if (error) status = 'fail'
    else if (same(actual, c.expected, c.tol)) status = c.known ? 'fixed' : 'pass'
    else if (c.known && same(actual, c.known.knownActual, c.tol)) status = 'known_deviation'
    else status = 'fail'
    results.push({
      id: c.id,
      module: c.module,
      file: `frontend/${MODULE_FILES[c.module]}`,
      title: c.title,
      source: c.source,
      expected: c.expected,
      actual: error ? undefined : actual,
      tolerance: c.tol ?? null,
      status,
      error,
      note: c.known?.note ?? null,
    })
  }

  const count = (s) => results.filter((r) => r.status === s).length
  const summary = {
    total: results.length,
    passed: count('pass') + count('fixed'),
    knownDeviations: count('known_deviation'),
    fixed: count('fixed'),
    failed: count('fail'),
  }
  const result = summary.failed > 0 ? 'fail' : 'pass'

  // ---------------------------------------------------------------- table
  const STATUS_TEXT = { pass: 'PASS', fixed: 'FIXED', known_deviation: 'KNOWN', fail: 'FAIL' }
  const rows = results.map((r) => [
    r.id,
    STATUS_TEXT[r.status],
    clip(r.title, 70),
    clip(r.status === 'pass' ? 'as expected' : `exp ${show(r.expected)} | got ${r.error ? `ERROR ${r.error}` : show(r.actual)}`, 90),
  ])
  const head = ['Case', 'Result', 'Check', 'Detail']
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()
  const out = []
  out.push('')
  out.push(`QIRLPL LIMS — calculation validation (ISO/IEC 17025 7.11.6)`)
  out.push(`Version ${app.version}${app.branch ? ` on ${app.branch}` : ''} · ${startedAt.toISOString()} · node ${process.version}`)
  if (app.uncommittedChangesInTestedFiles.length) {
    out.push(`NOTE: uncommitted changes in tested files: ${app.uncommittedChangesInTestedFiles.join(', ')}`)
  }
  out.push('')
  out.push(line(head))
  out.push(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const r of rows) out.push(line(r))
  out.push('')
  out.push(
    `${summary.total} cases: ${summary.passed} pass, ${summary.knownDeviations} known deviation(s), ${summary.failed} fail` +
      (summary.fixed ? `, ${summary.fixed} known deviation(s) now fixed (update calculationCases.mjs)` : ''),
  )
  const known = results.filter((r) => r.status === 'known_deviation')
  if (known.length) {
    out.push('')
    out.push('Known deviations (reported to the Quality Manager; not counted as failures):')
    for (const k of known) out.push(`  ${k.id}: ${k.note}`)
  }
  for (const f of results.filter((r) => r.status === 'fail')) {
    out.push('')
    out.push(`FAIL ${f.id} — ${f.title}`)
    out.push(`  expected: ${show(f.expected)}`)
    out.push(`  actual:   ${f.error ? `ERROR ${f.error}` : show(f.actual)}`)
    out.push(`  source:   ${f.source}`)
  }

  // ---------------------------------------------------------------- evidence
  const evidence = {
    suite: 'calculation-validation',
    standardClause: 'ISO/IEC 17025:2017 7.11.6',
    executedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    host: { node: process.version, platform: `${process.platform}-${process.arch}` },
    app,
    bundleSha256,
    modules: moduleHashes,
    result,
    summary,
    cases: results,
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-')
  const file = path.join(OUT_DIR, `calculation-validation-${stamp}.json`)
  const json = `${JSON.stringify(evidence, null, 2)}\n`
  fs.writeFileSync(file, json)
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), json)
  out.push('')
  const shown = file.startsWith(FRONTEND + path.sep) ? path.relative(FRONTEND, file) : file
  out.push(`Evidence: ${shown} (sha256 ${sha256(json).slice(0, 16)}…)`)
  out.push(`Overall result: ${result.toUpperCase()}`)
  if (!QUIET || result !== 'pass') console.log(out.join('\n'))
  else console.log(`Calculation validation ${result.toUpperCase()} — ${shown}`)
  process.exit(result === 'pass' ? 0 : 1)
}

await main()
