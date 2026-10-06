/**
 * sleept 的工作面板。
 *
 * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。
 * 面板不建自己的 React root、不写自己的颜色 token、不碰主题。
 *
 * 动作全部经 `host.runCommand`（DSH 的命令通道，不经过模型）：面板不自建 RPC，
 * 危险动作由节点在命令侧拒绝，这里就只显示它说的原因。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'

export const Probe = { react: React, version: React.version }

const ACTIONS: Array<{ line: string; zh: string; en: string }> = [
  { line: '/sleept status', zh: '读取状态', en: 'Read status' },
  { line: '/sleept block 25', zh: '阻止休眠 25 分钟', en: 'Prevent sleep 25 min' },
  { line: '/sleept unblock', zh: '解除阻止', en: 'Release hold' },
  { line: '/sleept sleep', zh: '立即睡眠（应被拒）', en: 'Sleep now (should refuse)' },
]

export default function Panel({ contribution, locale, host }: PanelProps): React.ReactElement {
  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  const [output, setOutput] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)

  const run = async (line: string): Promise<void> => {
    setBusy(line)
    try {
      const outcome = await host.runCommand(line)
      setOutput(`${line}\n${outcome.ok ? outcome.text : `ERROR: ${outcome.reason}`}`)
    } catch (error) {
      // 按钮的 disabled 全挂在 busy 上：不接住这次异常，整排控件就永久变灰（实机踩过）。
      setOutput(`${line}\nERROR: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ padding: 12, display: 'grid', gap: 8 }}>
      <strong>{title}</strong>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ACTIONS.map((action) => (
          <button
            key={action.line}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(action.line)}
          >
            {busy === action.line ? '…' : (locale === 'zh' ? action.zh : action.en)}
          </button>
        ))}
      </div>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, opacity: busy === null ? 0.85 : 0.5 }}>{output || (locale === 'zh' ? '（还没有调用）' : '(no call yet)')}</pre>
    </div>
  )
}
