// 解析器的对照：win32 的两条落点必须在任何宿主上都可判，所以按分隔符归一化比较，
// 且 exists/pathList 全部注入——不在 mac 上假装能 stat 到 C:\ 盘。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolvePackageManager, shellCommandLine } from './package-manager.mjs'

const flat = value => String(value).split('\\').join('/').toLowerCase()
const same = (actual, expected, message) => assert.deepEqual(
  { command: flat(actual.command), shell: actual.shell },
  { command: flat(expected.command), shell: expected.shell }, message)
const hit = want => candidate => flat(candidate) === flat(want)

test('win 有 pnpm.exe 时直接执行它，不开 shell', () => {
  const exe = 'C:\\Users\\r\\setup-pnpm\\node_modules\\.bin\\pnpm.exe'
  same(resolvePackageManager('pnpm', { platform: 'win32', pathList: ['C:\\x', 'C:\\Users\\r\\setup-pnpm\\node_modules\\.bin'], exists: hit(exe) }), { command: exe, shell: false })
})

test('win 只有 .cmd 垫片时改用 shell（云上 ENOENT 的那条形态）', () => {
  same(resolvePackageManager('pnpm', { platform: 'win32', pathList: ['C:\\nodejs\\bin'], exists: hit('C:\\nodejs\\bin\\pnpm.cmd') }), { command: 'pnpm', shell: true })
})

test('win 上两者都没有时不自己编路径', () => {
  same(resolvePackageManager('pnpm', { platform: 'win32', pathList: ['C:\\nothing'], exists: () => false }), { command: 'pnpm', shell: false })
})

for (const platform of ['darwin', 'linux', 'freebsd']) {
  test(`${platform} 保持原命令与不开 shell`, () => {
    same(resolvePackageManager('pnpm', { platform, pathList: ['/opt/homebrew/bin'], exists: () => true }), { command: 'pnpm', shell: false })
  })
}

test('带空格或引号的参数在 shell 形态下被包起来', () => {
  assert.equal(shellCommandLine(['--config', 'D:\\a p\\rspack.config.mjs']), '--config "D:\\a p\\rspack.config.mjs"')
  assert.equal(shellCommandLine(['exec', 'tsdown']), 'exec tsdown')
})
