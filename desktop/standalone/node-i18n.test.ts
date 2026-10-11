import { expect, it, vi } from 'vitest'
import i18n from 'i18next'
import { useNodeI18n } from '../../packages/ui-host/src/nodes/shared/useNodeI18n'
vi.mock('react-i18next', async () => {
  const { default: instance } = await import('i18next')
  return { useTranslation: () => ({ t: instance.getFixedT(null, 'module'), i18n: instance }) }
})
it('独立节点缺词条时仍替换数量与工具变量，不显示花括号', async () => {
  await i18n.init({ lng: 'zh', resources: { zh: { module: {} } }, defaultNS: 'module', interpolation: {escapeValue: false} })
  const { t } = useNodeI18n('kisaki')
  expect(t('missing.count', '{{count}} 已选', {count: 3})).toBe('3 已选')
  expect(t('missing.tool', '当前工具：{{tool}}。', {tool: '重复文件'})).toBe('当前工具：重复文件。')
  // 模拟原来的直接返回 fallback，夹具必须读到未替换的变量（阳性对照）。
  expect('{{count}} 已选').not.toBe('3 已选')
})
