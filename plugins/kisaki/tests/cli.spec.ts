import { describe, expect, it } from 'vitest'
import { formatKisakiPipeResult } from '../src/cli.js'
import type { KisakiData, KisakiResult } from '../src/core.js'

function dummyData(override: Partial<KisakiData> = {}): KisakiData {
  return {
    action: "scan",
    tool: "duplicate-files",
    fileCount: 0,
    groupCount: 0,
    totalBytes: 0,
    reclaimableBytes: 0,
    groups: [],
    entries: [],
    stopped: false,
    affectedCount: 0,
    errorCount: 0,
    ...override,
  }
}

describe('Kisaki CLI Formatting & Utilities', () => {
  it('formats pipe scan results in Chinese and English', () => {
    const resultZh: KisakiResult = {
      success: true,
      message: 'done',
      data: dummyData({ tool: 'similar-images', similarFolders: [] }),
    }
    expect(formatKisakiPipeResult(resultZh, 'zh')).toEqual([
      '找到 0 项，共 0 组。',
      '格式: 无',
      '相似文件夹: 无',
    ])
    expect(formatKisakiPipeResult(resultZh, 'en')).toEqual([
      'Found 0 item(s) in 0 group(s).',
      'Formats: none',
      'Similar folders: none',
    ])
  })

  it('formats operation results correctly', () => {
    const result: KisakiResult = {
      success: true,
      message: 'deleted',
      data: dummyData({ action: 'delete', affectedCount: 5, errorCount: 1 }),
    }
    expect(formatKisakiPipeResult(result, 'zh')).toEqual(['删除：影响 5 项，错误 1 项。'])
    expect(formatKisakiPipeResult(result, 'en')).toEqual(['Delete: 5 affected, 1 errors.'])
  })
})
