#!/usr/bin/env node
/**
 * 只读检查：工作台到底有没有随包/进装机产物。
 *
 *   node desktop/payload-check.mjs --payload desktop/.products/xaihi-desktop   # 载荷目录本身
 *   node desktop/payload-check.mjs --app /Applications/Xaihi.app               # 装出来的 app
 *
 * 为什么要有它：这一环的失败模式全是"看不见"——包里没有我们的组合时，装出来的界面与检出里组合了什么无关，
 * 而 `rg -a -c 'xaihi-core' …/app.asar` = 0 这种读数不写在脚本里就没人会去量。检查项一律读**字节**，不读配置意图。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const valueOf = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1] }
const payloadDir = valueOf('--payload')
const appPath = valueOf('--app')
if (payloadDir === undefined && appPath === undefined) {
  console.error('用法：node desktop/payload-check.mjs --payload <载荷目录> | --app <Xaihi.app>')
  process.exit(2)
}

const failures = []
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail === '' ? '' : `：${detail}`}`)
  if (!ok) failures.push(label)
}
const filesUnder = (dir) => {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)])
}
const contains = (file, needle) => existsSync(file) && readFileSync(file).includes(needle)

if (payloadDir !== undefined) {
  const root = resolve(payloadDir)
  console.log(`载荷检查：${root}`)
  const manifestPath = join(root, 'profile.json')
  check('profile.json 在场', existsSync(manifestPath))
  const profile = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : undefined
  check('profile.json 声明了 bundles 与 coreConfig.uiBundleDir',
    Array.isArray(profile?.bundles) && typeof profile?.coreConfig?.uiBundleDir === 'string')
  const uiDir = profile?.coreConfig?.uiBundleDir === undefined ? join(root, 'ui') : join(root, profile.coreConfig.uiBundleDir)
  const uiFiles = filesUnder(uiDir)
  check('工作台产物有内容', uiFiles.length > 0, `${String(uiFiles.length)} 个文件`)
  // 入口名不是约定俗成：core 的文档壳就按这两个名字发 <script>/<link>（packages/core/src/routes.ts:115-116），
  // 名字对不上时不是 404 而是**界面空白**，所以这里按名字量。
  for (const entry of ['main.js', 'main.css']) {
    check(`工作台入口 ${entry} 在场（core 的路由常量）`, existsSync(join(uiDir, entry)))
  }
  for (const name of profile?.bundles ?? []) {
    const pack = join(root, 'packs', String(name).replace('@hibernalglow/', ''))
    check(`bundle ${name} 有 lib/index.js`, existsSync(join(pack, 'lib', 'index.js')))
    const client = join(pack, 'lib', 'client.js')
    if (existsSync(client)) {
      check(`bundle ${name} 的客户端产物带品牌占位`, contains(client, 'data-xaihi-brand'))
    }
  }
}

if (appPath !== undefined) {
  const root = resolve(appPath)
  console.log(`装机产物检查：${root}`)
  // macOS 的包是 `Contents/Resources`，Windows 的 `win-unpacked` 是 `resources/`——两种布局都认。
  const resources = existsSync(join(root, 'Contents', 'Resources')) ? join(root, 'Contents', 'Resources') : join(root, 'resources')
  check('app 结构在场（Resources）', existsSync(resources), resources)
  const shipped = join(resources, 'xaihi')
  check('Resources/xaihi 载荷进包（extraResources）', existsSync(join(shipped, 'profile.json')),
    existsSync(shipped) ? '目录在但缺 profile.json' : '目录不存在')
  check('包内工作台产物有内容', filesUnder(join(shipped, 'ui')).length > 0)
  for (const entry of ['main.js', 'main.css']) {
    check(`包内工作台入口 ${entry} 在场`, existsSync(join(shipped, 'ui', entry)))
  }
  const packs = existsSync(join(shipped, 'packs')) ? readdirSync(join(shipped, 'packs')) : []
  check('包内 bundle 目录齐全', packs.length >= 5, packs.join(', '))
  // 只数目录等于没数：装进去一个空 pack 同样是 5 个目录，而宿主在装载期就拒绝，
  // 症状是"工作台空白"。`--payload` 那一支有逐包判据，装机这一支也必须吃同一条。
  for (const name of packs) {
    check(`包内 bundle ${name} 有 lib/index.js`, existsSync(join(shipped, 'packs', name, 'lib', 'index.js')))
    const client = join(shipped, 'packs', name, 'lib', 'client.js')
    if (existsSync(client)) {
      check(`包内 bundle ${name} 的客户端产物带品牌占位`, contains(client, 'data-xaihi-brand'))
    }
  }
  const asar = join(resources, 'app.asar')
  check('壳的 app.asar 带 xaihi 客户端半边', contains(asar, 'xaihi-ui'))
  check('客户端产物带品牌占位（data-xaihi-brand）', contains(asar, 'data-xaihi-brand'))
  const size = existsSync(asar) ? statSync(asar).size : 0
  console.log(`  · app.asar ${String(Math.round(size / 1048576))} MB`)
}

console.log(failures.length === 0 ? 'payload-check OK' : `payload-check FAIL（${String(failures.length)} 条）：${failures.join('、')}`)
process.exit(failures.length === 0 ? 0 : 1)
