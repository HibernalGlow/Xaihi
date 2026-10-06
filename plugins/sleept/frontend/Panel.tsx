/**
 * sleept 的工作面板。
 *
 * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。
 * 组件与颜色都走 `@hibernalglow/xaihi-ui-kit`，这里不写 hex、不写 `--dsw-*`、不碰主题。
 *
 * 动作全部经 `host.runCommand`（DSH 的命令通道，不经过模型）：面板不自建 RPC，
 * 危险动作由节点在命令侧拒绝，这里就只显示它说的原因。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'
import { registerKitStyles, XButton, XPanel } from '@hibernalglow/xaihi-ui-kit'

export const Probe = { react: React, version: React.version }

const ACTIONS: Array<{ line: string; zh: string; en: string; variant: 'filled' | 'tonal' | 'text' }> = [
  { line: '/sleept status', zh: '读取状态', en: 'Read status', variant: 'filled' },
  { line: '/sleept displayOff', zh: '关闭屏幕', en: 'Display off', variant: 'tonal' },
  { line: '/sleept screensaver', zh: '进入屏保', en: 'Screensaver', variant: 'tonal' },
  { line: '/sleept block 25', zh: '阻止休眠 25 分钟', en: 'Prevent sleep 25 min', variant: 'tonal' },
  { line: '/sleept unblock', zh: '解除阻止', en: 'Release hold', variant: 'text' },
  { line: '/sleept sleep', zh: '立即睡眠（应被拒）', en: 'Sleep now (should refuse)', variant: 'text' },
]

export default function Panel({ contribution, locale, host }: PanelProps): React.ReactElement {
  const title = locale === 'zh' ? contribution.title.zh : contribution.title.en
  const [output, setOutput] = React.useState('')
  const [failed, setFailed] = React.useState(false)
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => registerKitStyles(), [])

  const run = async (line: string): Promise<void> => {
    setBusy(line)
    try {
      const outcome = await host.runCommand(line)
      // 语气按这次调用实际成不成功来定：文本第一行是命令行，所以不能靠前缀猜。
      setFailed(!outcome.ok)
      setOutput(`${line}\n${outcome.ok ? outcome.text : `ERROR: ${outcome.reason}`}`)
    } catch (error) {
      // 按钮的 disabled 全挂在 busy 上：不接住这次异常，整排控件就永久变灰。
      setFailed(true)
      setOutput(`${line}\nERROR: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <XPanel
      title={title}
      status={output || (locale === 'zh' ? '（还没有调用）' : '(no call yet)')}
      statusTone={failed ? 'error' : 'info'}
      actions={ACTIONS.map((action) => (
        <XButton
          key={action.line}
          variant={action.variant}
          disabled={busy !== null}
          onClick={() => void run(action.line)}
        >
          {busy === action.line ? '…' : (locale === 'zh' ? action.zh : action.en)}
        </XButton>
      ))}
    >
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{output}</pre>
    </XPanel>
  )
}
