import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { resolveNativeBinding, stageNativeResources } from './native-resources.mjs'
const temps: string[] = []
function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'xaihi-native-test-')); temps.push(repo)
  const directory = join(repo, 'artifacts'); mkdirSync(directory)
  return { repo, directory, destination: join(repo, 'output'), native: { directory: 'artifacts', binding: 'engine.node' } }
}
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, {recursive: true, force: true}) })
it('复制 .node 与动态库并计算资源摘要，小二进制不当成文本指针', () => {
  const f = fixture(); writeFileSync(join(f.directory, 'engine.node'), Buffer.from([0x7f, 0, 1])); writeFileSync(join(f.directory, 'libtest.so.2'), 'library')
  const result = stageNativeResources(f)
  expect(result.files.map((x: any) => x.name)).toEqual(['engine.node', 'libtest.so.2'])
  expect(readFileSync(result.binding)).toEqual(Buffer.from([0x7f, 0, 1]))
  expect(result.files[0].sha256).toMatch(/^[0-9a-f]{64}$/)
})
it('历史文本指针解析后连同绑定旁边的依赖一起复制', () => {
  const f = fixture(); mkdirSync(join(f.directory, 'nested'))
  writeFileSync(join(f.directory, 'engine.node'), 'nested/actual.node\n'); writeFileSync(join(f.directory, 'nested/actual.node'), Buffer.alloc(5000)); writeFileSync(join(f.directory, 'nested/test.dylib'), 'dylib')
  expect(stageNativeResources(f).files.map((x: any) => x.name)).toEqual(['engine.node', 'test.dylib'])
})
it('拒绝越界文本指针、绑定符号链接及动态库符号链接（边界阳性对照）', () => {
  const f = fixture(); const outside = join(f.repo, 'outside.node'); writeFileSync(outside, Buffer.alloc(5000))
  writeFileSync(join(f.directory, 'engine.node'), '../outside.node')
  expect(() => resolveNativeBinding(f.directory, 'engine.node')).toThrow('越出')
  rmSync(join(f.directory, 'engine.node')); symlinkSync(outside, join(f.directory, 'engine.node'))
  expect(() => resolveNativeBinding(f.directory, 'engine.node')).toThrow('越出')
  rmSync(join(f.directory, 'engine.node')); writeFileSync(join(f.directory, 'engine.node'), Buffer.alloc(5000))
  symlinkSync(outside, join(f.directory, 'escape.dll'))
  expect(() => stageNativeResources(f)).toThrow('越出')
  // 直接复制会成功，证明夹具能暴露漏掉边界检查的实现。
  expect(readFileSync(join(f.directory, 'escape.dll')).length).toBe(5000)
})
