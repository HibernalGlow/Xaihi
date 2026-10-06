import * as React from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { localizeNodeHelp } from "@xiranite/contract"
import type { NodeHelp, NodeHelpCommand, NodeHelpField, NodeHelpWorkflow } from "@xiranite/contract"
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileTerminal,
  Info,
  Lightbulb,
  Route,
  ShieldAlert,
} from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getModule } from "@/components/modules/registry"
import { getNodeHelpLoader } from "@/components/help/nodeHelpRegistry"

type HelpLoadState =
  | { status: "idle" | "loading" | "missing" }
  | { status: "loaded"; help: NodeHelp }
  | { status: "error"; error: string }

export interface NodeHelpSheetProps {
  open: boolean
  moduleId: string | null
  moduleName?: string
  version?: string
  category?: string
  onOpenChange: (open: boolean) => void
}

interface NodeHelpContentProps {
  help: NodeHelp
  moduleId: string
  moduleName: string
  version?: string
  category?: string
}

export function NodeHelpSheet({
  open,
  moduleId,
  moduleName,
  version,
  category,
  onOpenChange,
}: NodeHelpSheetProps) {
  const { t, i18n } = useTranslation()
  const prefersReducedMotion = useReducedMotion()
  const [state, setState] = React.useState<HelpLoadState>({ status: "idle" })
  const module = moduleId ? getModule(moduleId) : undefined
  const resolvedName = moduleName
    ?? (moduleId && i18n.exists(`module:${moduleId}.name`) ? t(`module:${moduleId}.name`) : undefined)
    ?? module?.name
    ?? moduleId
    ?? t("registry:help.title")
  const resolvedVersion = version ?? module?.version
  const resolvedCategory = category ?? module?.category
  const localizedHelp = state.status === "loaded" ? localizeNodeHelp(state.help, i18n.language) : null

  React.useEffect(() => {
    if (!open || !moduleId) return

    const loader = getNodeHelpLoader(moduleId)
    if (!loader) {
      setState({ status: "missing" })
      return
    }

    let cancelled = false
    setState({ status: "loading" })
    void loader()
      .then((result) => {
        if (!cancelled) setState({ status: "loaded", help: result.help })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", error: error instanceof Error ? error.message : String(error) })
        }
      })

    return () => {
      cancelled = true
    }
  }, [moduleId, open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="top-12 h-[calc(100%-3rem)] w-[min(760px,calc(100vw-1rem))] gap-0 p-0 sm:max-w-[760px]">
        <SheetHeader className="border-b px-5 py-4 pr-12">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground">
                <BookOpen className="size-4" />
              </span>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base">{localizedHelp?.title ?? resolvedName}</SheetTitle>
                <SheetDescription className="mt-1">
                  {t("registry:help.description")}
                </SheetDescription>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              {resolvedCategory && <Badge variant="outline">{resolvedCategory}</Badge>}
              {resolvedVersion && <Badge variant="secondary">{resolvedVersion}</Badge>}
            </div>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${moduleId ?? "none"}-${state.status}-${i18n.language}`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.16, ease: "easeOut" }}
            >
              {state.status === "loading" && <NodeHelpLoading />}
              {state.status === "missing" && (
                <NodeHelpEmpty
                  title={t("registry:help.missingTitle")}
                  description={t("registry:help.missingDescription")}
                />
              )}
              {state.status === "error" && (
                <NodeHelpEmpty title={t("registry:help.errorTitle")} description={state.error} />
              )}
              {localizedHelp && moduleId && (
                <NodeHelpContent
                  help={localizedHelp}
                  moduleId={moduleId}
                  moduleName={resolvedName}
                  version={resolvedVersion}
                  category={resolvedCategory}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function NodeHelpLoading() {
  return (
    <div className="flex flex-col gap-4 p-5">
      <Skeleton className="h-9 w-80 max-w-full" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  )
}

function NodeHelpEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-5">
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpen />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

export function NodeHelpContent({
  help,
  moduleId,
  moduleName,
  version,
  category,
}: NodeHelpContentProps) {
  const { t } = useTranslation()
  const hasDetails = Boolean(help.fields?.length || help.safety)

  return (
    <Tabs defaultValue="overview" className="gap-0">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-5 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="overview" data-help-tab="overview">{t("registry:help.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="workflows" data-help-tab="workflows">{t("registry:help.tabs.workflows")}</TabsTrigger>
          <TabsTrigger value="cli" data-help-tab="cli">CLI</TabsTrigger>
          {hasDetails && <TabsTrigger value="details" data-help-tab="details">{t("registry:help.tabs.details")}</TabsTrigger>}
        </TabsList>
      </div>

      <TabsContent value="overview" className="flex flex-col gap-5 p-5">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>{help.title || moduleName}</CardTitle>
            <CardDescription>{help.short}</CardDescription>
            <CardAction>
              <div className="flex flex-wrap justify-end gap-1.5">
                {version && <Badge variant="secondary">{version}</Badge>}
                {category && <Badge variant="outline">{category}</Badge>}
                <Badge variant="outline">{moduleId}</Badge>
              </div>
            </CardAction>
          </CardHeader>
          {help.description && help.description !== help.short && (
            <CardContent className="px-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{help.description}</p>
            </CardContent>
          )}
        </Card>

        {help.whenToUse?.length ? (
          <HelpSection title={t("registry:help.sections.whenToUse")} icon={Info}>
            <ItemGroup className="gap-2">
              {help.whenToUse.map((item) => (
                <Item key={item} variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <CheckCircle2 />
                  </ItemMedia>
                  <ItemContent>
                    <ItemDescription className="line-clamp-none">{item}</ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </HelpSection>
        ) : null}

        {help.links?.length ? (
          <HelpSection title={t("registry:help.sections.links")} icon={ExternalLink}>
            <div className="flex flex-wrap gap-2">
              {help.links.map((link) => (
                <Button key={link.href} asChild variant="outline" size="sm">
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                    <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              ))}
            </div>
          </HelpSection>
        ) : null}
      </TabsContent>

      <TabsContent value="workflows" className="p-5">
        <Card className="gap-4 py-5">
          <CardHeader className="px-5">
            <CardTitle>{t("registry:help.sections.workflows")}</CardTitle>
            <CardDescription>{t("registry:help.sections.workflowsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="px-5">
            <Accordion type="multiple" defaultValue={help.workflows.length ? ["workflow-0"] : []}>
              {help.workflows.map((workflow, index) => (
                <WorkflowBlock key={`${workflow.title}-${index}`} workflow={workflow} value={`workflow-${index}`} />
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="cli" className="flex flex-col gap-4 p-5">
        {help.commands.map((command, index) => (
          <CommandBlock key={`${command.title}-${index}`} command={command} />
        ))}
      </TabsContent>

      {hasDetails && (
        <TabsContent value="details" className="flex flex-col gap-5 p-5">
          {help.fields?.length ? <FieldsCard fields={help.fields} /> : null}
          {help.safety ? <SafetyCard help={help} /> : null}
        </TabsContent>
      )}
    </Tabs>
  )
}

function HelpSection({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" />
        <h3>{title}</h3>
      </div>
      {children}
    </section>
  )
}

function WorkflowBlock({ workflow, value }: { workflow: NodeHelpWorkflow; value: string }) {
  const { t } = useTranslation()
  const uiSteps = workflow.ui ?? []
  const cliSteps = workflow.cli ?? []
  const tips = workflow.tips ?? []

  return (
    <AccordionItem value={value}>
      <AccordionTrigger>
        <span className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-sm border bg-muted text-muted-foreground">
            <Route className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <span>{workflow.title}</span>
            {workflow.summary && (
              <span className="text-xs font-normal leading-relaxed text-muted-foreground">{workflow.summary}</span>
            )}
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4">
        {uiSteps.length > 0 && <StepRail label="UI" steps={uiSteps} />}
        {cliSteps.length > 0 && <StepRail label="CLI" steps={cliSteps} terminal />}
        {tips.length > 0 && (
          <Alert>
            <Lightbulb />
            <AlertTitle>{t("registry:help.labels.tip")}</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {tips.map((tip) => <li key={tip}>{tip}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

function StepRail({ label, steps, terminal = false }: { label: string; steps: readonly string[]; terminal?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Badge variant="outline" className="w-fit">{label}</Badge>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-1.5">
        {steps.map((step, index) => (
          <React.Fragment key={`${step}-${index}`}>
            <Item variant="outline" size="sm" className="min-w-0 flex-1 items-start">
              <ItemMedia variant="icon">
                {terminal ? <FileTerminal /> : <span className="font-mono text-xs font-semibold">{index + 1}</span>}
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{terminal ? `${label} ${index + 1}` : `${index + 1}`}</ItemTitle>
                <ItemDescription className="line-clamp-none">{step}</ItemDescription>
              </ItemContent>
            </Item>
            {index < steps.length - 1 && (
              <span className="grid place-items-center text-muted-foreground" aria-hidden="true">
                <ArrowRight className="size-4 rotate-90 sm:rotate-0" />
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

function CommandBlock({ command }: { command: NodeHelpCommand }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle>{command.title}</CardTitle>
        {command.description && <CardDescription>{command.description}</CardDescription>}
        {command.command && (
          <CardAction>
            <Badge variant="secondary">{command.command}</Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-5">
        <ItemGroup className="gap-2">
          {command.examples.map((example, index) => (
            <Item key={`${example.command}-${index}`} variant="outline" size="sm" className="items-start">
              <ItemMedia variant="icon">
                <FileTerminal />
              </ItemMedia>
              <ItemContent className="min-w-0">
                {example.label && <ItemTitle>{example.label}</ItemTitle>}
                <CodeLine value={example.command} />
                {example.description && (
                  <ItemDescription className="line-clamp-none">{example.description}</ItemDescription>
                )}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function CodeLine({ value }: { value: string }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-md border bg-muted/50 px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
      <code>{value}</code>
    </pre>
  )
}

function FieldsCard({ fields }: { fields: readonly NodeHelpField[] }) {
  const { t } = useTranslation()
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle>{t("registry:help.sections.fields")}</CardTitle>
        <CardDescription>{t("registry:help.sections.fieldsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="px-5">
        <ItemGroup className="gap-2">
          {fields.map((field) => (
            <Item key={field.name} variant="outline" size="sm" className="items-start">
              <ItemContent>
                <ItemTitle>
                  {field.name}
                  {field.type && <Badge variant="secondary">{field.type}</Badge>}
                  {field.required && <Badge variant="outline">{t("registry:help.labels.required")}</Badge>}
                </ItemTitle>
                <ItemDescription className="line-clamp-none">{field.description}</ItemDescription>
                {field.defaultValue && (
                  <span className="text-xs text-muted-foreground">
                    {t("registry:help.labels.defaultValue", { value: field.defaultValue })}
                  </span>
                )}
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
    </Card>
  )
}

function SafetyCard({ help }: { help: NodeHelp }) {
  const { t } = useTranslation()
  const destructive = help.safety?.destructive ?? []
  const notes = help.safety?.notes ?? []

  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle>{t("registry:help.sections.safety")}</CardTitle>
        <CardDescription>{t("registry:help.sections.safetyDescription")}</CardDescription>
        {help.safety?.defaultMode && (
          <CardAction>
            <Badge variant="secondary">
              {t("registry:help.labels.defaultMode")}: {help.safety.defaultMode}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-5">
        {destructive.length > 0 && (
          <Alert variant="destructive">
            <ShieldAlert />
            <AlertTitle>{t("registry:help.labels.destructive")}</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {destructive.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {notes.length > 0 && (
          <Alert>
            <Info />
            <AlertTitle>{t("registry:help.labels.note")}</AlertTitle>
            <AlertDescription>
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {notes.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
