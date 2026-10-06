import { createContext, useContext, type ReactNode } from "react"

const NodeRuntimeContext = createContext<string | undefined>(undefined)

export function NodeRuntimeProvider({ children, nodeId }: { children: ReactNode; nodeId: string }) {
  return <NodeRuntimeContext.Provider value={nodeId}>{children}</NodeRuntimeContext.Provider>
}

export function useNodeRuntimeId(): string | undefined {
  return useContext(NodeRuntimeContext)
}
