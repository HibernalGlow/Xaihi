/**
 * 同一性判定的减法跑测：这条尺必须能变红。
 * @module xaihi-ui/tests/probe
 */

import * as React from 'react'
import { describe, expect, it } from 'vitest'
import { observatory, publishObservatory, recordProbe } from '../src/client/loader/probe.ts'

const ref = { remote: 'demo', exportName: 'Panel' }

describe('recordProbe', () => {
  it('宿主与远端是同一个 React 时判 true', () => {
    recordProbe(React, 'same/Panel', ref, { Probe: { react: React, version: React.version } })
    expect(observatory.modules['same/Panel']?.sameReactAsHost).toBe(true)
    expect(observatory.modules['same/Panel']?.reactVersion).toBe(React.version)
  })

  it('减法：远端另拿一份 React 时必须判 false（否则这条尺不存在）', () => {
    const decoy = { ...React, __decoy: true }
    recordProbe(React, 'dup/Panel', ref, { Probe: { react: decoy, version: React.version } })
    expect(observatory.modules['dup/Panel']?.sameReactAsHost).toBe(false)
  })

  it('远端没导出 Probe 记 unknown，不算通过', () => {
    recordProbe(React, 'silent/Panel', ref, {})
    expect(observatory.modules['silent/Panel']?.sameReactAsHost).toBe('unknown')
  })

  it('观测面是单一实例，可挂到页面上读', () => {
    const target: Record<string, unknown> = {}
    publishObservatory(target)
    expect(target.__XAIHI__).toBe(observatory)
    expect(observatory.modules['same/Panel']).toBeDefined()
  })
})
