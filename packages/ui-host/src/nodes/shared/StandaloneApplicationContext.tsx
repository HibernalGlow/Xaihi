import { createContext, useContext, type ReactNode } from "react"
import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface StandaloneApplicationSettingsValue {
  name: string
  open: boolean
  setOpen: (open: boolean) => void
  appearance: ReactNode
}

// 独立宿主提供统一入口；节点只提供自己的设置内容，不依赖桌面实现。
const StandaloneApplicationContext = createContext<StandaloneApplicationSettingsValue | null>(null)
export const StandaloneApplicationProvider = StandaloneApplicationContext.Provider
export function useStandaloneApplication() { return useContext(StandaloneApplicationContext) }

export function StandaloneApplicationSettings({ children, title, description, trigger }: {
  children: ReactNode
  title: string
  description: string
  trigger: ReactNode
}) {
  const application = useStandaloneApplication()
  return <Dialog open={application?.open} onOpenChange={application?.setOpen}>
    {!application ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{application ? `${application.name} 应用设置` : title}</DialogTitle>
        <DialogDescription>{application ? "外观可跟随工作台或独立设置；下方是此节点的专用设置。" : description}</DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-[70vh] pr-3">
        <div className="grid gap-5">{application?.appearance}{children}</div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
}

export function StandaloneApplicationSettingsButton() {
  const application = useStandaloneApplication()
  if (!application) return null
  return <Button type="button" size="sm" variant="ghost" aria-label="应用设置" onClick={() => application.setOpen(true)}>
    <Settings2 className="size-4" /><span>设置</span>
  </Button>
}
