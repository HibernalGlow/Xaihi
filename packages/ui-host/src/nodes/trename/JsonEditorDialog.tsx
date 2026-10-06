import { Clipboard, Copy, FileJson, Upload } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { tNode } from "@/nodes/shared/useNodeI18n"

export function JsonEditorDialog(props: {
  disabled?: boolean
  jsonText: string
  pendingCount: number
  readyCount: number
  totalCount: number
  onChange: (value: string) => void
  onCopy: () => void
  onImport: () => void
  onPaste: () => void
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button aria-label={tNode("trename", "aria.jsonEditor", "open trename json editor")} disabled={props.disabled} size="sm" variant="outline">
          <FileJson data-icon="inline-start" />
          JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑 rename JSON</DialogTitle>
          <DialogDescription>
            粘贴外部翻译后的 JSON，或检查扫描生成的分段内容。主卡片只保留结构化预览，不常驻大文本框。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="outline">{props.totalCount} 项</Badge>
          <Badge variant="secondary">{props.pendingCount} 待填</Badge>
          <Badge variant={props.readyCount ? "default" : "outline"}>{props.readyCount} 就绪</Badge>
        </div>
        <Textarea
          aria-label={tNode("trename", "aria.jsonText", "trename json text")}
          className="h-[52vh] min-h-64 resize-none font-mono text-xs leading-5"
          disabled={props.disabled}
          spellCheck={false}
          value={props.jsonText}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
        <DialogFooter>
          <Button disabled={props.disabled} size="sm" variant="outline" onClick={props.onPaste}>
            <Clipboard data-icon="inline-start" />
            粘贴
          </Button>
          <Button disabled={!props.jsonText} size="sm" variant="outline" onClick={props.onCopy}>
            <Copy data-icon="inline-start" />
            复制
          </Button>
          <Button disabled={!props.jsonText || props.disabled} size="sm" onClick={props.onImport}>
            <Upload data-icon="inline-start" />
            导入统计
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
