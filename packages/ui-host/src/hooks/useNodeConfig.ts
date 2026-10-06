import { useCallback, useEffect, useRef, useState } from "react"

import { getConfigFilePath, getNodeConfigFromBackend, saveNodeConfigToBackend } from "@/backend/configRpcClient"

export interface UseNodeConfigResult<TConfig> {
  /** 从 xiranite.config.toml 读取的节点默认配置 */
  defaults: TConfig | undefined
  /** 配置文件路径 */
  configFilePath: string | undefined
  /** 是否正在加载 */
  loading: boolean
  /** 错误信息 */
  error: string | undefined
  /** 保存配置为默认值（写入 xiranite.config.toml） */
  saveAsDefault: (config: TConfig) => Promise<void>
  /** 重新从 TOML 读取默认配置 */
  reload: () => Promise<void>
}

/**
 * useNodeConfig — 从 xiranite.config.toml 读取节点默认配置。
 *
 * 合并优先级（在 Component 中实现）：
 *   comp.data 配置字段 > xiranite.config.toml [nodes.<nodeId>] > 节点包默认值
 *
 * 本 hook 只负责读取/写入 TOML 中的节点段，不管理 comp.data。
 * Component 负责决定哪些字段属于"配置覆盖"并合并。
 */
export function useNodeConfig<TConfig>(
  nodeId: string,
): UseNodeConfigResult<TConfig> {
  const [defaults, setDefaults] = useState<TConfig | undefined>(undefined)
  const [configFilePath, setConfigFilePath] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(undefined)
    try {
      const [configResult, path] = await Promise.all([
        getNodeConfigFromBackend<TConfig>(nodeId),
        getConfigFilePath(),
      ])
      if (!mountedRef.current) return
      setDefaults(configResult.config)
      setConfigFilePath(path)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [nodeId])

  useEffect(() => {
    mountedRef.current = true
    void load()
    return () => {
      mountedRef.current = false
    }
  }, [load])

  const saveAsDefault = useCallback(async (config: TConfig) => {
    await saveNodeConfigToBackend<TConfig>(nodeId, config)
    setDefaults(config)
  }, [nodeId])

  const reload = useCallback(async () => {
    await load()
  }, [load])

  return {
    defaults,
    configFilePath,
    loading,
    error,
    saveAsDefault,
    reload,
  }
}
