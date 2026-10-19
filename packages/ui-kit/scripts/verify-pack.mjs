import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratch = mkdtempSync(join(tmpdir(), 'xaihi-ui-kit-consumer-'))
const packDir = join(scratch, 'pack')
const consumerDir = join(scratch, 'consumer')
execFileSync('mkdir', ['-p', packDir, join(consumerDir, 'node_modules', '@hibernalglow')], { stdio: 'ignore' })

const packOutput = execFileSync('npm', ['pack', '--pack-destination', packDir, '--json'], {
  cwd: packageDir,
  encoding: 'utf8',
})
const packResult = JSON.parse(packOutput)[0]
const tarball = join(packDir, packResult.filename)
const installedPackage = join(consumerDir, 'node_modules', '@hibernalglow', 'xaihi-ui-kit')
execFileSync('mkdir', ['-p', installedPackage], { stdio: 'ignore' })
execFileSync('tar', ['-xzf', tarball, '--strip-components=1', '-C', installedPackage])

const peerReact = realpathSync(join(packageDir, 'node_modules', 'react'))
const peerReactDom = realpathSync(join(packageDir, 'node_modules', 'react-dom'))
symlinkSync(peerReact, join(consumerDir, 'node_modules', 'react'), 'dir')
symlinkSync(peerReactDom, join(consumerDir, 'node_modules', 'react-dom'), 'dir')
symlinkSync(realpathSync(join(packageDir, 'node_modules', '@types')), join(consumerDir, 'node_modules', '@types'), 'dir')

const consumer = `
import * as root from '@hibernalglow/xaihi-ui-kit'
import * as components from '@hibernalglow/xaihi-ui-kit/components'
import * as md3e from '@hibernalglow/xaihi-ui-kit/md3e'
import * as shapes from '@hibernalglow/xaihi-ui-kit/shapes'
import * as tokens from '@hibernalglow/xaihi-ui-kit/tokens'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const manifest = require('@hibernalglow/xaihi-ui-kit/package.json')
if (typeof root.XMd3eTheme !== 'function') throw new Error('root export missing XMd3eTheme')
if (typeof components.XMd3eHeroBanner !== 'function') throw new Error('components export missing XMd3eHeroBanner')
if (typeof components.XMd3eSegmentedTrack !== 'function') throw new Error('components export missing XMd3eSegmentedTrack')
if (typeof md3e.XMd3eShapeButton !== 'function') throw new Error('md3e export missing XMd3eShapeButton')
if (shapes.XMD3E_SHAPES.length < 20) throw new Error('shape catalog is unexpectedly small')
if (typeof tokens.KIT_CSS !== 'string' || !tokens.KIT_CSS.includes('--xaihi-')) throw new Error('token CSS missing')
if (!tokens.XAIHI_UI_KIT_THEME_TOKENS.includes('--xaihi-md3e-surface-lowest')) throw new Error('surface-lowest theme token missing')
if (tokens.XAIHI_UI_KIT_THEME_TOKENS.length !== 22) throw new Error('theme token contract size changed')
if (manifest.name !== '@hibernalglow/xaihi-ui-kit') throw new Error('package identity changed')
const css = readFileSync(require.resolve('@hibernalglow/xaihi-ui-kit/styles.css'), 'utf8')
if (!css.includes('.xaihi-md3e-shape-button')) throw new Error('styles.css subpath missing')
if (!css.includes('--xaihi-md3e-surface-lowest')) throw new Error('styles.css missing surface-lowest bridge')
const readme = readFileSync(join(dirname(require.resolve('@hibernalglow/xaihi-ui-kit/package.json')), 'README.md'), 'utf8')
for (const token of tokens.XAIHI_UI_KIT_THEME_TOKENS) {
  if (!readme.includes(token)) throw new Error('README missing theme token ' + token)
}
console.log(JSON.stringify({ name: manifest.name, version: manifest.version, shapes: shapes.XMD3E_SHAPES.length, cssBytes: Buffer.byteLength(css) }))
`
writeFileSync(join(consumerDir, 'consumer.mjs'), consumer)
const result = execFileSync(process.execPath, ['consumer.mjs'], { cwd: consumerDir, encoding: 'utf8' }).trim()
const typeConsumer = `
import '@hibernalglow/xaihi-ui-kit/styles.css'
import * as React from 'react'
import { XMd3eCoverBadge, XMd3eExtendedFab, XMd3eField, XMd3eGestureBoard, XMd3eMultiChoiceChips, XMd3eRayMenu, XMd3eSearchBar, XMd3eSheet, XMd3eActionButton } from '@hibernalglow/xaihi-ui-kit'
import { XMd3eList, XMd3eListItem } from '@hibernalglow/xaihi-ui-kit/md3e'
import { XMd3eSegmentedTrack } from '@hibernalglow/xaihi-ui-kit/components'
import { XMD3E_SHAPES, getXMd3eShapePhase } from '@hibernalglow/xaihi-ui-kit/shapes'
const shape = XMD3E_SHAPES[0]
const phase = getXMd3eShapePhase(shape, 'expanded')
const view = <XMd3eField label="Name" valueBadge={phase.borderRadius}><XMd3eActionButton size="xs">Save</XMd3eActionButton></XMd3eField>
const search = <XMd3eSearchBar query="" onQueryChange={() => undefined} />
const list = <XMd3eList><XMd3eListItem title="Item" /></XMd3eList>
const segmented = <XMd3eSegmentedTrack aria-label="Density" options={[{ value: 'compact', label: 'Compact', disabled: false }]} value="compact" onChange={() => undefined} />
const extras = <><XMd3eExtendedFab label="Run" /><XMd3eMultiChoiceChips options={[{ id: 'a', label: 'A' }]} values={[]} /><XMd3eSheet open><XMd3eCoverBadge value="1" /></XMd3eSheet><XMd3eGestureBoard value={[]} /><XMd3eRayMenu items={[]} /></>
void React.createElement('div', null, view, search, list, segmented, extras)
`
writeFileSync(join(consumerDir, 'consumer.tsx'), typeConsumer)
writeFileSync(join(consumerDir, 'styles.d.ts'), "declare module '@hibernalglow/xaihi-ui-kit/styles.css'\n")
writeFileSync(join(consumerDir, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, types: ['react', 'react-dom'] },
  files: ['consumer.tsx', 'styles.d.ts'],
}, null, 2))
execFileSync(process.execPath, [resolve(packageDir, 'node_modules/typescript/bin/tsc'), '--project', join(consumerDir, 'tsconfig.json')], { cwd: consumerDir, stdio: 'pipe' })
console.log(`xaihi-ui-kit: packed consumer and types ok ${result}`)
