/**
 * 上游拼法的别名这一层：`--target` 这类写法必须还能被本包的 bin 认。
 *
 * 为什么钉这件事：搬运把 classf 的参数改成了清单字段名（9 条），
 * `scripts/check-cli-parity.mjs` 现读上游 `src/cli.ts` 与我们每一屏的开关时把这 9 条报成缺——
 * 而**源码里那些开关是真有的**，缺的是"上游那个拼法"。判据不能停在"我们改了名字"，
 * 因为改了名字等于让写过的脚本与文档里的示例失效（搬运是并集，不是子集）。
 *
 * 三条腿都有：改写函数自己的形状、屏上打不打得出来（可发现性，尺读的就是这个）、
 * 以及一条**正反对照**的端到端信号——别名必须不像未知开关那样被拒。
 */
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { applyUpstreamFlagAliases, UPSTREAM_CLASSF_FLAGS } from '../src/cli.ts'

const CLI = resolve(join(import.meta.dirname, '..', 'lib', 'cli.js'))

/** 上游基线里出现过、而本屏原来只打 camel 写法的那 9 条。 */
const UPSTREAM_NAMES = ['--crashu-source', '--placement', '--target', '--transfer', '--classify',
  '--existing', '--items', '--blacklist-keyword', '--samea-group-min']

describe('classf 终端面的上游拼法别名', () => {
  it('带值的两种写法都能换成本包字段名', () => {
    expect(applyUpstreamFlagAliases(['plan', '--target', '/tmp/x', '--json']))
      .toEqual(['plan', '--targetDir', '/tmp/x', '--json'])
    expect(applyUpstreamFlagAliases(['plan', '--items=mixed']))
      .toEqual(['plan', '--workItemMode=mixed'])
  })

  it('否定写法保留否定，只换名字', () => {
    expect(applyUpstreamFlagAliases(['plan', '--no-classify']))
      .toEqual(['plan', '--no-classifyMode'])
  })

  it('本包认识的写法与未知开关都原样过去', () => {
    expect(applyUpstreamFlagAliases(['plan', '--targetDir=/tmp/x', '--zzz=1']))
      .toEqual(['plan', '--targetDir=/tmp/x', '--zzz=1'])
  })

  it('表里的每个值都真是本包声明过的字段名（别名不许指向不存在的开关）', () => {
    // 这条挡住一种很难看的错：映射写错字，`--target` 被换成本包也没有的名字 ⇒
    // 屏上看着全了，实际还是"上游写法不被认识"。
    const screen = execFileSync(process.execPath, [CLI, 'plan', '--help'], { encoding: 'utf8' })
    for (const [key, target] of Object.entries(UPSTREAM_CLASSF_FLAGS)) {
      expect(screen, `别名 ${key} 的目标 ${target} 不在屏上`).toContain(`--${target}`)
    }
  })

  it('每条上游拼法都必须在屏上打得出来', () => {
    const screen = execFileSync(process.execPath, [CLI, 'plan', '--help'], { encoding: 'utf8' })
    for (const name of UPSTREAM_NAMES) expect(screen, `${name} 没打出来`).toContain(name)
  })

  it('端到端正反对照：别名不像未知开关那样被拒', () => {
    const run = (flag: string) => {
      try {
        return execFileSync(process.execPath, [CLI, 'plan', flag, '/tmp/x', '--json'],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      } catch (error) {
        const failed = error as { stdout?: string, stderr?: string }
        return `${failed.stdout ?? ''}${failed.stderr ?? ''}`
      }
    }
    // 正控先立住：真未知的那个开关必须被拒，否则"没被拒"这件事什么都不是。
    // 本包支撑的原文是 `Unknown option: --x.`（`cli-support.ts` 的措辞），
    // 而 cli.ts 的文件头注释里写的是另一种 `Unknown argument: <token>.` —— 只认一种会把正控判成"没拒"。
    const rejected = /Unknown (option|argument)/i
    expect(run('--definitely-not-a-flag')).toMatch(rejected)
    const aliased = run('--target')
    expect(aliased, `--target 被当成未知开关：${aliased.slice(0, 160)}`).not.toMatch(rejected)
    const canonical = run('--targetDir')
    expect(canonical).not.toMatch(rejected)
  })
})
