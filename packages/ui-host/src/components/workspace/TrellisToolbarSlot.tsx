import { createContext, useContext, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react'
const MountContext = createContext<HTMLDivElement | null>(null)
const SetMountContext = createContext<Dispatch<SetStateAction<HTMLDivElement | null>> | null>(null)
/** A portal keeps Trellis's provider and node lifetime intact while its controls occupy the app bar. */
export function TrellisToolbarHost({ children }: { children: ReactNode }) {
  const [mount, setMount] = useState<HTMLDivElement | null>(null)
  return <SetMountContext.Provider value={setMount}><MountContext.Provider value={mount}>{children}</MountContext.Provider></SetMountContext.Provider>
}
export function TrellisToolbarSlot() {
  const setMount = useContext(SetMountContext)
  return <div ref={setMount} className="xaihi-toolbar-slot min-w-0 shrink" />
}
export const useTrellisToolbarMount = () => useContext(MountContext)
