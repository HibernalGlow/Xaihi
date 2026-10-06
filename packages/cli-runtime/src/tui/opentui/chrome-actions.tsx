/* @jsxImportSource @opentui/react */
import { createContext, useContext, useEffect, type ReactNode } from "react"

export interface TerminalChromeActions {
  onReset: () => void
  onExit: () => void
  resetLabel?: string
  exitLabel?: string
}

const ChromeActionsContext = createContext<((actions?: TerminalChromeActions) => void) | undefined>(undefined)

export function TerminalChromeActionsProvider({ register, children }: { register: (actions?: TerminalChromeActions) => void; children: ReactNode }): ReactNode {
  return <ChromeActionsContext.Provider value={register}>{children}</ChromeActionsContext.Provider>
}

export function useTerminalChromeActions(actions: TerminalChromeActions): void {
  const register = useContext(ChromeActionsContext)
  useEffect(() => {
    register?.(actions)
    return () => register?.(undefined)
  }, [actions.onExit, actions.onReset, actions.resetLabel, actions.exitLabel, register])
}
