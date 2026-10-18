import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { rspack } from '@rspack/core'
import { buildRegistrations, buildWorkspaceDocument, computeRev } from '../../core/src/registry.ts'
import { remoteHandler, manifestHandler, uiBundleHandler } from '../../core/src/routes.ts'
import type { Plugin } from 'vite'

/** 真 rspack remote + 生产 Core 路由；不替换 MF runtime。 */
export async function mf2AcceptanceServer(): Promise<Plugin> {
  const root = await mkdtemp(path.join(tmpdir(), 'xaihi-mf2-'))
  const fixture = new URL('./fixtures/mf2/', import.meta.url).pathname
  const require = createRequire(new URL('../../../plugins/kisaki/package.json', import.meta.url))
  const { ModuleFederationPlugin } = require('@module-federation/enhanced/rspack')
  const definitions = [
    { id: 'mf2-acceptance', remote: 'mf2_acceptance', version: '^18.3.1 || ^19.2.0', panels: [
      { id: 'mf2.panel', export: 'Panel' }, { id: 'mf2.node', export: 'entry' },
      { id: 'mf2.throw', export: 'Throw' }, { id: 'mf2.missing', export: 'Missing' },
    ] },
    { id: 'mf2-incompatible', remote: 'mf2_incompatible', version: '^99.0.0', panels: [{ id: 'mf2.incompatible', export: 'Panel' }] },
  ]
  const packages = new Map<string, { pkgPath: string; pkg: Record<string, unknown> }>()
  for (const definition of definitions) {
    const directory = path.join(root, definition.id)
    const shared = { singleton: true, strictVersion: true, import: false, requiredVersion: definition.version }
    const compiler = rspack({
      mode: 'production', context: fixture, entry: './container.ts',
      output: { path: directory, publicPath: 'auto', uniqueName: definition.remote },
      resolve: { extensions: ['.tsx', '.ts', '.js'] },
      module: { rules: [{ test: /\.tsx?$/, type: 'javascript/auto', use: [{ loader: 'builtin:swc-loader', options: { jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } } } } }] }] },
      plugins: [new ModuleFederationPlugin({ name: definition.remote, filename: 'remoteEntry.js', exposes: { './Panel': './Panel.tsx', './entry': './entry.tsx', './Throw': './Throw.tsx' }, shared: { react: shared, 'react/jsx-runtime': shared }, dts: false })],
    })
    await new Promise<void>((resolve, reject) => compiler.run((error, stats) => compiler.close(() => {
      if (error || stats?.hasErrors()) reject(error ?? new Error(stats?.toString({ all: false, errors: true })))
      else resolve()
    })))
    packages.set(definition.id, { pkgPath: path.join(directory, 'package.json'), pkg: { xaihi: {
      schema: 'xaihi.manifest/1', id: definition.id, ui: { remote: definition.remote, entry: './remoteEntry.js' },
      panels: definition.panels.map(panel => ({ ...panel, remote: definition.remote, title: { zh: panel.id, en: panel.id }, area: 'workspace' })),
    } } })
  }
  const registrations = buildRegistrations([...packages.keys()], name => packages.get(name))
  const uiDir = process.env.XAIHI_MF2_DOCUMENT ?? ''
  const uiRev = uiDir ? computeRev(uiDir) : 'test'
  const document = buildWorkspaceDocument(registrations, { documentUrl: uiDir ? '/xaihi/ui/' + uiRev + '/index.html' : '', rev: uiRev })
  const source = { registrations: () => registrations, document: () => document }
  return {
    name: 'xaihi-mf2-acceptance',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/xaihi/ui/')) return uiBundleHandler({ dir: () => uiDir, rev: () => uiRev })(req, res)
        if (req.url?.startsWith('/xaihi/remotes/')) return remoteHandler(source)(req, res)
        if (req.url?.startsWith('/xaihi/manifest.json')) return manifestHandler(source)(req, res)
        next()
      })
      server.httpServer?.once('close', () => { void rm(root, { recursive: true, force: true }) })
    },
  }
}
