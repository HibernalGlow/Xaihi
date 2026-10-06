import { useEffect } from "react"

import { initializeDesktopTrays } from "./trayCoordinator"
import { createLogger } from "@/lib/logger"

const logger = createLogger("desktop.tray")

export function DesktopTrayBridge() {
  useEffect(() => {
    void initializeDesktopTrays().catch((error) => {
      logger.warn("Initialization failed", error)
    })
  }, [])

  return null
}
