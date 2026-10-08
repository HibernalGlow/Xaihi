import { useCallback, useEffect, useRef, useState } from "react"
import type { NodeComponentProps } from "@xiranite/contract"

import { createLogger } from "@/lib/logger"
import { pickKisakiNodeConfig, type KisakiNodeConfig } from "./node-config"
import type { KisakiCardState } from "./types"

const logger = createLogger("kisaki.config")

type Host = NodeComponentProps<KisakiCardState, Partial<KisakiNodeConfig>>["host"]

interface UseKisakiNodeConfigOptions {
  host: Host
  applyCardStatePatch: (patch: Partial<KisakiCardState>) => void
}

export function useKisakiNodeConfig({ host, applyCardStatePatch }: UseKisakiNodeConfigOptions) {
  const loadedRef = useRef(false)
  const pendingPatchRef = useRef<Partial<KisakiNodeConfig>>({})
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [, setRevision] = useState(0)

  const save = useCallback((patch: Partial<KisakiNodeConfig>) => {
    if (!Object.keys(patch).length) return
    saveQueueRef.current = saveQueueRef.current
      .then(async () => {
        if (host.config?.save) await host.config.save(patch)
        else await host.saveNodeConfig?.(patch)
      })
      .catch((error) => {
        logger.error("Failed to save Kisaki node configuration", error)
      })
  }, [host])

  const persistCardStatePatch = useCallback((patch: Partial<KisakiCardState>) => {
    const configPatch = pickKisakiNodeConfig(patch)
    if (!Object.keys(configPatch).length) return
    if (!loadedRef.current) {
      pendingPatchRef.current = { ...pendingPatchRef.current, ...configPatch }
      return
    }
    save(configPatch)
  }, [save])

  useEffect(() => {
    let active = true
    const request = host.config?.get?.() ?? host.getNodeConfig?.()
    if (!request) {
      loadedRef.current = true
      return undefined
    }

    void request.then(
      (response) => {
        if (!active) return
        const pendingPatch = pendingPatchRef.current
        pendingPatchRef.current = {}
        loadedRef.current = true
        const savedConfig = pickKisakiNodeConfig(response.config)
        const restoredConfig = { ...savedConfig, ...pendingPatch }
        if (Object.keys(restoredConfig).length) {
          applyCardStatePatch(restoredConfig)
          setRevision((revision) => revision + 1)
        }
        save(pendingPatch)
      },
      (error) => {
        if (!active) return
        loadedRef.current = true
        logger.error("Failed to load Kisaki node configuration", error)
        const pendingPatch = pendingPatchRef.current
        pendingPatchRef.current = {}
        save(pendingPatch)
      },
    )

    return () => {
      active = false
    }
  }, [applyCardStatePatch, host, save])

  return persistCardStatePatch
}
