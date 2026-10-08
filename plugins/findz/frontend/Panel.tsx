/**
 * findz 的工作面板。
 *
 * 只导出组件与 Probe：Probe 是宿主校验 React 同一性用的，不是装饰。
 * 组件与颜色都走 `@hibernalglow/xaihi-ui-kit`，这里不写 hex、不写 `--dsw-*`、不碰主题。
 *
 * 动作全部经 `host.runCommand('/findz …')`（DSH 的命令通道，不经过模型）：面板不自建
 * RPC，也不在 `/xaihi` 下开"执行节点动作"的路由——那会绕过宿主的分派语义
 * （`.dsh/skills/xaihi-node-ui/SKILL.md`）。
 *
 * 面板刻意**只按命令面覆盖到的那几个形状**摆控件：需要翻页游标、路径前缀、分析范围的
 * 组合只有 agent 的工具路径能到，所以这里不摆假控件。详见 `../README.md` 的"命令面"。
 */
import * as React from 'react'
import type { PanelProps } from '@hibernalglow/xaihi-sdk'
import { registerKitStyles, XButton, XField, XPanel } from '@hibernalglow/xaihi-ui-kit'

export const Probe = { react: React, version: React.version }

interface Fields {
  libraryId: string
  libraryRoot: string
  text: string
}

interface Action {
  /** 从表单值拼出命令行；返回 null 表示前置条件还没满足，按钮就禁用。 */
  line(fields: Fields): string | null
  zh: string
  en: string
  variant: 'filled' | 'tonal' | 'text'
}

const ACTIONS: Action[] = [
  { line: () => '/findz api', zh: '内核自检', en: 'Core check', variant: 'filled' },
  {
    line: ({ libraryId, libraryRoot }) => (libraryId === '' || libraryRoot === '' ? null : `/findz open ${libraryId} ${libraryRoot}`),
    zh: '打开库',
    en: 'Open library',
    variant: 'tonal',
  },
  {
    line: ({ libraryId }) => (libraryId === '' ? null : `/findz scan ${libraryId}`),
    zh: '扫描',
    en: 'Scan',
    variant: 'tonal',
  },
  {
    line: ({ libraryId, text }) => (libraryId === '' ? null : `/findz query ${libraryId}${text === '' ? '' : ` ${text}`}`),
    zh: '查询归档',
    en: 'Query archives',
    variant: 'tonal',
  },
  {
    line: ({ libraryId }) => (libraryId === '' ? null : `/findz treemap ${libraryId}`),
    zh: '矩形图',
    en: 'Treemap',
    variant: 'tonal',
  },
  {
    line: ({ libraryId }) => (libraryId === '' ? null : `/findz close ${libraryId}`),
    zh: '关闭库',
    en: 'Close library',
    variant: 'text',
  },
]

const T = {
  libraryId: { zh: '库 id（同时是索引文件名）', en: 'Library id (also the index file name)' },
  libraryRoot: { zh: '库根目录（绝对路径）', en: 'Library root (absolute path)' },
  text: { zh: '文本过滤（可选）', en: 'Text filter (optional)' },
  empty: { zh: '（还没有调用）', en: '(no call yet)' },
  needId: { zh: '先填库 id', en: 'Fill the library id first' },
  via: { zh: '动作走 DSH 的命令通道，与 composer 里手打 /findz 是同一条路。', en: 'Actions go through the DSH command channel — the same path as typing /findz in the composer.' },
} as const

export default function Panel({ contribution, locale, host }: PanelProps): React.ReactElement {
  const zh = locale === 'zh'
  const [fields, setFields] = React.useState<Fields>({ libraryId: '', libraryRoot: '', text: '' })
  const [output, setOutput] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  React.useEffect(() => registerKitStyles(), [])

  const set = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>): void =>
    setFields((current) => ({ ...current, [key]: event.target.value }))

  const run = async (action: Action): Promise<void> => {
    const line = action.line(fields)
    if (line === null) return
    setBusy(line)
    const outcome = await host.runCommand(line)
    setBusy(null)
    setOutput(`${line}\n${outcome.ok ? outcome.text : `ERROR: ${outcome.reason}`}`)
  }

  return (
    <XPanel
      title={zh ? contribution.title.zh : contribution.title.en}
      statusTone={output.startsWith('ERROR') ? 'error' : 'info'}
      status={output === '' ? T.empty[locale] : T.via[locale]}
      actions={ACTIONS.map((action) => {
        const line = action.line(fields)
        return (
          <XButton
            key={action.zh}
            variant={action.variant}
            disabled={line === null || busy !== null}
            title={line ?? T.needId[locale]}
            onClick={() => void run(action)}
          >
            {busy !== null && busy === line ? '…' : (zh ? action.zh : action.en)}
          </XButton>
        )
      })}
    >
      <XField label={T.libraryId[locale]}>
        <input className="xaihi-field-input" value={fields.libraryId} onChange={set('libraryId')} spellCheck={false} />
      </XField>
      <XField label={T.libraryRoot[locale]}>
        <input className="xaihi-field-input" value={fields.libraryRoot} onChange={set('libraryRoot')} spellCheck={false} />
      </XField>
      <XField label={T.text[locale]}>
        <input className="xaihi-field-input" value={fields.text} onChange={set('text')} spellCheck={false} />
      </XField>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>{output}</pre>
    </XPanel>
  )
}
