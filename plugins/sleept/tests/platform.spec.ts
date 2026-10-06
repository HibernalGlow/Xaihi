/**
 * 平台层的真机夹具测试。
 *
 * 夹具是从本机 macOS 和那台 Windows 11 测试盒上抓回来的原始输出，不是手写样例。
 * 两条平台分支必须**同时**成立才算抽象对了：只测 mac 的话，Windows 的解析可以整段是假的。
 *
 * @module xaihi-sleept/tests/platform
 */

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  parseHibernateEnabled,
  parseMacAssertions,
  parseMacCustom,
  parsePowercfgSetting,
  planAssertionProbe,
  planCommand,
  windowsHoldScript,
} from '../src/platform.ts'

const fixture = (name: string): string =>
  readFileSync(realpathSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))), 'utf8')

describe('argv 计划', () => {
  it('mac：读状态走 pmset，阻止休眠走 caffeinate，立即睡眠是 sleepnow', () => {
    expect(planCommand('darwin', 'status')?.argv).toEqual(['pmset', '-g', 'custom'])
    expect(planCommand('darwin', 'block')?.argv).toEqual(['caffeinate', '-di'])
    expect(planCommand('darwin', 'sleep')?.argv).toEqual(['pmset', 'sleepnow'])
  })

  it('mac：block 带时限才加 -t，单位换算成秒', () => {
    expect(planCommand('darwin', 'block', { minutes: 45 })?.argv).toEqual(['caffeinate', '-di', '-t', '2700'])
    expect(planCommand('darwin', 'block', { minutes: 0 })?.argv).toEqual(['caffeinate', '-di'])
  })

  it('unblock 不发命令：解除靠杀掉持有的子进程', () => {
    expect(planCommand('darwin', 'unblock')).toBeNull()
    expect(planCommand('win32', 'unblock')).toBeNull()
  })

  it('断言表只有 mac 有对等物', () => {
    expect(planAssertionProbe('darwin')?.argv).toEqual(['pmset', '-g', 'assertions'])
    expect(planAssertionProbe('win32')).toBeNull()
  })

  it('不认识的平台直接拒绝，不静默挑一条能跑的命令', () => {
    expect(() => planCommand('freebsd', 'status')).toThrow(/not supported/)
  })

  it('win：休眠与真睡眠是两条不同的 argv', () => {
    const hibernate = planCommand('win32', 'sleep', { suspendKind: 'hibernate' })
    expect(hibernate?.argv).toEqual(['rundll32.exe', 'powrprof.dll,SetSuspendState', '1,1,0'])
    const suspend = planCommand('win32', 'sleep', { suspendKind: 'suspend' })
    expect(suspend?.argv[0]).toBe('powershell.exe')
    expect(suspend?.argv.join(' ')).toContain('SetSuspendState($false, $true, $false)')
    // 阳性对照：真睡眠那条绝不能落到 hibernate=1 的参数上。
    expect(suspend?.argv.join(' ')).not.toContain('1,1,0')
  })

  it('win：持有脚本带 ES_CONTINUOUS|ES_SYSTEM_REQUIRED，无限期时不自杀', () => {
    expect(windowsHoldScript(0)).toContain('SetThreadExecutionState')
    expect(windowsHoldScript(0)).toContain('while ($true)')
    // 参数就是秒：5 分钟要由调用方换算成 300。
    expect(windowsHoldScript(300)).toContain('Start-Sleep -Seconds 300')
    expect(windowsHoldScript(300)).not.toContain('while ($true)')
  })
})

describe('macOS 解析（真机夹具）', () => {
  const sections = parseMacCustom(fixture('macos-pmset-custom.txt'))

  it('交流/电池两段各读到自己那份秒数', () => {
    expect(sections['AC Power']).toEqual({ systemSleepSeconds: 600, displaySleepSeconds: 600, hibernateMode: 3 })
    expect(sections['Battery Power']).toEqual({ systemSleepSeconds: 900, displaySleepSeconds: 600, hibernateMode: 3 })
  })

  it('带空格的键（Sleep On Power Button）不被误当成设置项', () => {
    expect(Object.keys(sections['AC Power'] as object)).toEqual(['systemSleepSeconds', 'displaySleepSeconds', 'hibernateMode'])
  })

  it('断言表把"谁在拦"列出来，而不是只报一个布尔', () => {
    const { counters, holders } = parseMacAssertions(fixture('macos-pmset-assertions.txt'))
    expect(counters['PreventUserIdleSystemSleep']).toBe(1)
    expect(counters['PreventSystemSleep']).toBe(0)
    expect(holders.length).toBeGreaterThanOrEqual(4)
    const first = holders[0]
    expect(first).toMatchObject({ pid: 1984, process: 'Vorssaint', kind: 'PreventUserIdleSystemSleep' })
    expect(first?.name).toContain('keep the Mac awake')
  })

  it('阳性对照：把持有者行删掉就必须读不到人', () => {
    const text = fixture('macos-pmset-assertions.txt').split('\n').filter((line) => !line.includes('pid ')).join('\n')
    expect(parseMacAssertions(text).holders).toEqual([])
  })
})

describe('Windows 解析（真机夹具，locale 与编码都不许依赖）', () => {
  it('中文 locale 的 powercfg 输出照样拿到 AC / DC', () => {
    const standby = parsePowercfgSetting(fixture('windows-standbyidle.txt'), 'STANDBYIDLE')
    expect(standby).toEqual({ acSeconds: null, dcSeconds: null, known: true })
    const hibernate = parsePowercfgSetting(fixture('windows-hibernateidle.txt'), 'HIBERNATEIDLE')
    expect(hibernate.known).toBe(true)
    // 夹具里 DC 是 0x7fffffff（不活动即休眠），不许读成"0 秒"。
    expect(hibernate.dcSeconds).toBe(0x7fffffff)
  })

  it('同一份内容换成英文标签也必须解析得出（解析不读词）', () => {
    const english = fixture('windows-standbyidle.txt')
      .replace('GUID 别名: STANDBYIDLE', 'GUID Alias: STANDBYIDLE')
      .replace('当前交流电源设置索引: 0x00000000', 'Current AC Power Setting Index: 0x000000b4')
      .replace('当前直流电源设置索引: 0x00000000', 'Current DC Power Setting Index: 0x0000012c')
    expect(parsePowercfgSetting(english, 'STANDBYIDLE')).toEqual({ acSeconds: 180, dcSeconds: 300, known: true })
  })

  it('别名不存在时 known=false，而不是把 0 当成"从不"', () => {
    expect(parsePowercfgSetting(fixture('windows-standbyidle.txt'), 'NO_SUCH_ALIAS')).toEqual({ acSeconds: null, dcSeconds: null, known: false })
  })

  it('休眠开着：这台盒子必须被认出来（否则"睡眠"会睡成"休眠"）', () => {
    expect(parseHibernateEnabled(fixture('windows-hibernateenabled.txt'))).toBe(true)
    expect(parseHibernateEnabled('HibernateEnabled    REG_DWORD    0x0')).toBe(false)
    expect(parseHibernateEnabled('未找到注册表值')).toBeNull()
  })

  it('阳性对照：GBK 原始输出不能给十六进制解析带来假绿', () => {
    // availablesleepstates 那份是 GBK 字节，直接读进来的中文是乱码——所以它不能被用作
    // 任何判据的来源，这里只断言"确实读不出可用文字"，把这条编码地雷记在测试里。
    const raw = fixture('windows-availablesleepstates.gbk.txt')
    expect(raw).not.toContain('休眠')
    expect(/0x[0-9a-f]{8}/i.test(raw)).toBe(false)
  })
})
