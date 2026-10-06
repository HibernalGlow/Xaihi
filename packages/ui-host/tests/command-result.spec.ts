/**
 * 命令结果收口的测试。
 *
 * 钉的是实验里真踩过的一下：网关回 `{ok:false, error:{…}}` 时不能当成成功，
 * 否则面板会显示一条"看起来是结果"的失败，而运行账本里什么都没有。
 *
 * @module xaihi-ui/tests/command-result
 */

import { describe, expect, it } from 'vitest'
import { readCommandResult } from '../src/client/index.ts'

describe('readCommandResult', () => {
  it('纯文本原样收', () => {
    expect(readCommandResult('platform: darwin')).toEqual({ ok: true, text: 'platform: darwin' })
  })

  it('业务成功信封取 text', () => {
    expect(readCommandResult({ kind: 'success', text: 'held off' })).toEqual({ ok: true, text: 'held off' })
  })

  it('业务错误算失败，并带原文', () => {
    const outcome = readCommandResult({ kind: 'error', text: 'gated as dangerous' })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toContain('gated as dangerous')
  })

  it('阳性对照：网关的 ok:false 绝不能被收成成功', () => {
    const outcome = readCommandResult({ ok: false, error: { code: 'gateway/arguments-invalid' } })
    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.reason).toContain('gateway/arguments-invalid')
  })
})
