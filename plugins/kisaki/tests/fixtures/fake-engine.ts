/**
 * 假引擎宿主（判据专用）：只满足 `KisakiEngineFace` 那五格，不做任何进程与文件动作。
 *
 * 单独一个文件而不是塞进某份 spec 里：`vi.mock` 是整文件生效的，
 * 在同一份文件里既 mock 又测真组件会把断言打成"测我自己的假件"（本仓记过这条）。
 */
import type { KisakiEngineCallOptions, KisakiEngineFace, KisakiEngineInfo, KisakiEngineMethod, KisakiEngineStatus } from '@hibernalglow/xaihi-sdk'

export interface FakeEngineOptions {
  info?: Partial<KisakiEngineInfo>
  /** 方法名 → 返回值；没给的方法按"未知方法"抛，与真宿主同形状。 */
  results?: Partial<Record<KisakiEngineMethod, unknown>>
  status?: Partial<KisakiEngineStatus>
}

export interface FakeEngine extends KisakiEngineFace {
  /** 记下的调用（`method:参数摘要`），断言"这一格到底被调过"要用它。 */
  readonly calls: string[]
  readonly trashCalls: string[]
}

export function createFakeEngine (options: FakeEngineOptions = {}): FakeEngine {
  const calls: string[] = []
  const trashCalls: string[] = []
  const info: KisakiEngineInfo = {
    apiVersion: options.info?.apiVersion ?? 5,
    sourceVersion: options.info?.sourceVersion ?? '12.0.0',
    capabilities: options.info?.capabilities ?? ['scan.duplicate', 'scan.basic', 'scan.media', 'scan.exif-remover', 'scan.video-optimizer', 'operation.exif.candidate', 'operation.video-optimizer.candidate', 'scan.progress.v2', 'scan.cancel', 'operation.trash.list', 'operation.trash.restore'],
  }
  return {
    calls,
    trashCalls,
    info: async () => info,
    async call<T> (method: KisakiEngineMethod, params: unknown, _options?: KisakiEngineCallOptions<unknown>): Promise<T> {
      calls.push(String(method))
      if (method === 'operation.trash') {
        trashCalls.push(String((params as { path?: string }).path ?? ''))
        return { trashed: true } as T
      }
      if (options.results && method in options.results) return options.results[method] as T
      throw Object.assign(new Error(`unknown_method: ${String(method)}`), { code: 'unknown_method' })
    },
    async cancel (scanId: string) { calls.push(`cancel:${scanId}`); return true },
    status: () => ({ transport: 'subprocess', state: 'running', entry: 'fake', binding: 'fake.node', ...options.status }),
  }
}
