import { expect, it } from 'vitest'
import { xaihiPrimaryDocument } from '../dsh/apps/desktop/src/xaihi-startup-policy'
it('只有本地完整 core 文档可以替换 DSH 首次启动入口', () => {
  expect(xaihiPrimaryDocument({ ui: { documentUrl: '/xaihi/ui/abcdef123456/index.html' } })).toBe('dsh-app://app/xaihi/ui/abcdef123456/index.html')
  for (const value of [null, {}, {ui: null}, {ui: {}}, {ui: {documentUrl: 3}}]) expect(xaihiPrimaryDocument(value)).toBeUndefined()
  for (const path of ['https://example.com/', '/xaihi/ui/abcdef123456/../../index.html', '/xaihi/ui/abcdef123456/index.html?node=kisaki', '/xaihi/ui/abcdef123456/index.html#login', '/xaihi/ui/invalid/index.html', '/xaihi/ui/abcdef123456/other.html']) expect(xaihiPrimaryDocument({ui: {documentUrl: path}})).toBeUndefined()
})
it('原来的 startsWith 检查会误收路径穿越（阳性对照）', () => {
  const path = '/xaihi/ui/abcdef123456/../../index.html'
  expect(path.startsWith('/xaihi/ui/')).toBe(true)
  expect(xaihiPrimaryDocument({ui: {documentUrl: path}})).toBeUndefined()
})
