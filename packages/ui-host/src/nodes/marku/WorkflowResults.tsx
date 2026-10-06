// Read-only inspection of the latest workflow run. Source and step selection
// stay local to this view; reusable definitions and execution remain owned by
// the workflow domain and card orchestrator.
import { useState } from "react"
import { ArrowDownToLine, ArrowUpFromLine, Clipboard, FileDiff, ListTree } from "lucide-react"
import type { MarkuData, MarkuWorkflowRunData, MarkuWorkflowSourceResult, MarkuWorkflowStepResult } from "@xiranite/node-marku/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { findModuleMeta } from "./constants"
import { ActionIconButton } from "./controls"

interface WorkflowResultsProps {
  result: MarkuData | null
  run: MarkuWorkflowRunData | null
  onCopyText: (text: string) => void
}

export function WorkflowResults(props: WorkflowResultsProps) {
  const [selectedSourceId, setSelectedSourceId] = useState("")
  const [selectedStepId, setSelectedStepId] = useState("")
  const source = resolveSource(props.run, selectedSourceId)
  const step = resolveStep(source, selectedStepId)
  const changedDiffs = props.result?.diffs.filter((item) => item.changed) ?? []

  return (
    <div data-testid="marku-workflow-results" className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>工作流结果</span>
          {props.run && (
            <>
              <Badge variant="outline" className="shrink-0">{props.run.stepCount} 步</Badge>
              <Badge variant="outline" className="shrink-0">{props.run.sources.length} 个来源</Badge>
            </>
          )}
        </div>
        {props.run && (
          <ActionIconButton
            disabled={!props.run.sources.some((item) => item.outputText)}
            icon={Clipboard}
            label="复制全部输出"
            onClick={() => props.onCopyText(props.run?.sources.map((item) => item.outputText).join("\n\n") ?? "")}
          />
        )}
      </div>

      {props.run && source && step ? (
        <Tabs defaultValue="steps" className="min-h-0 flex-1 gap-0">
          <TabsList aria-label="marku workflow result view" className="h-8 w-full shrink-0 rounded-none border-b bg-transparent p-1" layout="fill" variant="line">
            <TabsTrigger value="steps" className="text-xs"><ListTree />步骤详情</TabsTrigger>
            <TabsTrigger value="diff" className="text-xs"><FileDiff />最终差异</TabsTrigger>
          </TabsList>
          <TabsContent value="steps" className="min-h-0">
            <ScrollArea className="h-full">
              <StepResultInspector
                run={props.run}
                selectedSource={source}
                selectedStep={step}
                onCopyText={props.onCopyText}
                onSelectSource={setSelectedSourceId}
                onSelectStep={setSelectedStepId}
              />
            </ScrollArea>
          </TabsContent>
          <TabsContent value="diff" className="min-h-0">
            <ScrollArea className="h-full">
              <DiffInspector diffs={changedDiffs} onCopyText={props.onCopyText} />
            </ScrollArea>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex h-full min-h-24 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          运行工作流后，这里会按来源展示每一步的输入输出与差异。
        </div>
      )}
    </div>
  )
}

function StepResultInspector(props: {
  run: MarkuWorkflowRunData
  selectedSource: MarkuWorkflowSourceResult
  selectedStep: MarkuWorkflowStepResult
  onCopyText: (text: string) => void
  onSelectSource: (sourceId: string) => void
  onSelectStep: (stepId: string) => void
}) {
  const [textView, setTextView] = useState<"input" | "output">("output")
  const stepMeta = findModuleMeta(props.selectedStep.module)

  return (
    <div className="grid gap-2 p-3">
      <div className="flex items-center gap-2">
        <Select value={props.selectedSource.sourceId} onValueChange={props.onSelectSource}>
          <SelectTrigger aria-label="marku workflow result source" size="sm" className="min-w-0 flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {props.run.sources.map((source) => (
              <SelectItem key={source.sourceId} value={source.sourceId}>{source.sourceLabel}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ActionIconButton
          disabled={!props.selectedSource.outputText}
          icon={Clipboard}
          label="复制来源输出"
          onClick={() => props.onCopyText(props.selectedSource.outputText)}
        />
      </div>

      {props.selectedSource.error && <div className="text-xs text-destructive">{props.selectedSource.error}</div>}

      <div aria-label="marku workflow result steps" className="flex max-w-full gap-1 overflow-x-auto pb-1">
        {props.selectedSource.steps.map((step, index) => {
          const meta = findModuleMeta(step.module)
          const selected = step.stepId === props.selectedStep.stepId
          return (
            <Button
              key={step.stepId}
              aria-label={`步骤 ${index + 1} ${meta.shortLabel}`}
              aria-pressed={selected}
              className="shrink-0"
              size="xs"
              variant={selected ? "secondary" : "outline"}
              onClick={() => props.onSelectStep(step.stepId)}
            >
              <span className="tabular-nums">{index + 1}</span>
              {meta.shortLabel}
            </Button>
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 border-t pt-2 text-xs">
        <stepMeta.icon className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">{stepMeta.label}</span>
        {props.selectedStep.error
          ? <Badge variant="destructive">错误</Badge>
          : <Badge variant={props.selectedStep.changed ? "secondary" : "outline"}>{props.selectedStep.changed ? "有变更" : "无变化"}</Badge>}
      </div>

      {props.selectedStep.error && <div className="text-xs text-destructive">{props.selectedStep.error}</div>}

      <Tabs value={textView} onValueChange={(value) => setTextView(value as "input" | "output")} className="gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <TabsList aria-label="marku workflow step text" className="h-7" layout="fit">
            <TabsTrigger value="input" className="text-xs"><ArrowDownToLine />输入</TabsTrigger>
            <TabsTrigger value="output" className="text-xs"><ArrowUpFromLine />输出</TabsTrigger>
          </TabsList>
          <ActionIconButton
            icon={Clipboard}
            label={textView === "input" ? "复制步骤输入" : "复制步骤输出"}
            onClick={() => props.onCopyText(textView === "input" ? props.selectedStep.inputText : props.selectedStep.outputText)}
          />
        </div>
        <TabsContent value="input">
          <pre data-testid="marku-workflow-step-input" className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{props.selectedStep.inputText}</pre>
        </TabsContent>
        <TabsContent value="output">
          <pre data-testid="marku-workflow-step-output" className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{props.selectedStep.outputText}</pre>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DiffInspector(props: {
  diffs: MarkuData["diffs"]
  onCopyText: (text: string) => void
}) {
  if (!props.diffs.length) {
    return <div className="p-4 text-center text-xs text-muted-foreground">本次工作流没有产生文件差异。</div>
  }

  return (
    <div className="divide-y">
      {props.diffs.map((item) => (
        <div key={item.file} className="grid gap-1.5 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 truncate text-xs font-medium text-primary" title={item.file}>{item.file}</div>
            <ActionIconButton disabled={!item.diff} icon={Clipboard} label="复制文件差异" onClick={() => props.onCopyText(item.diff)} />
          </div>
          {item.diff && <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{item.diff}</pre>}
        </div>
      ))}
    </div>
  )
}

function resolveSource(run: MarkuWorkflowRunData | null, selectedSourceId: string): MarkuWorkflowSourceResult | undefined {
  if (!run) return undefined
  return run.sources.find((source) => source.sourceId === selectedSourceId) ?? run.sources[0]
}

function resolveStep(source: MarkuWorkflowSourceResult | undefined, selectedStepId: string): MarkuWorkflowStepResult | undefined {
  if (!source) return undefined
  return source.steps.find((step) => step.stepId === selectedStepId) ?? source.steps[0]
}
