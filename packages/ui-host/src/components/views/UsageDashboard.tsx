import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { TFunction } from "i18next"
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  Gauge,
  History,
  Layers3,
  RadioTower,
  Server,
  Sparkles,
  Zap,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import type { RuntimeHistoryItemDTO, RuntimeHistoryStatusDTO } from "@xiranite/shared"
import type { LocalBackendStatusKind } from "@/backend/localBackendStatus"
import { MODULE_REGISTRY, getModule } from "@/components/modules/registry"
import { useHostConnection } from "@/hooks/useHostConnection"
import { useNodeRunHistory } from "@/hooks/useNodeRunHistory"
import { useRuntimeHistory } from "@/hooks/useRuntimeHistory"
import { isTerminalPhase, useNodeOperations, type TrackedNodeOperation } from "@/store/nodeOperations"
import { useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { cn } from "@/lib/utils"
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar"
import { AnimatedList } from "@/components/ui/animated-list"
import { Badge } from "@/components/ui/badge"
import { BlurFade } from "@/components/ui/blur-fade"
import { BorderBeam } from "@/components/ui/border-beam"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { NumberTicker } from "@/components/ui/number-ticker"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  DynamicContainer,
  DynamicIsland,
  DynamicIslandProvider,
} from "@/components/ui/dynamic-island"
import { StatusMark } from "@/components/ui/status-mark"
import { SpotlightCard } from "@/components/ui/spotlight-card"

const RANGE_OPTIONS = [7, 14, 30] as const
type RangeDays = (typeof RANGE_OPTIONS)[number]

const activityChartConfig = {
  success: { label: "Success", color: "var(--chart-1)" },
  failed: { label: "Failed", color: "var(--chart-5)" },
  info: { label: "Info", color: "var(--chart-2)" },
} satisfies ChartConfig

const durationChartConfig = {
  average: { label: "Average", color: "var(--chart-3)" },
} satisfies ChartConfig

const nodeChartConfig = {
  count: { label: "Runs", color: "var(--chart-2)" },
} satisfies ChartConfig

const statusColors: Record<RuntimeHistoryStatusDTO, string> = {
  success: "var(--chart-1)",
  error: "var(--chart-5)",
  cancelled: "var(--chart-4)",
  info: "var(--chart-2)",
}

type ActivityPoint = {
  day: string
  success: number
  failed: number
  info: number
  total: number
}

type DurationPoint = {
  day: string
  average: number
}

type NodeUsagePoint = {
  node: string
  count: number
  failed: number
  success: number
  averageMs: number
}

type StatusPoint = {
  status: RuntimeHistoryStatusDTO
  label: string
  count: number
  fill: string
}

type CategoryPoint = {
  category: string
  count: number
  percent: number
}

type DashboardBackendStatus = LocalBackendStatusKind | "checking" | "unknown"

export function UsageDashboard() {
  const { t } = useTranslation()
  const [rangeDays, setRangeDays] = useState<RangeDays>(14)
  // 两条 REST 历史 hook 永久停用（`enabled: false` ⇒ 一条请求都不发）：运行历史的真源是
  // runner 组，而 runner 现在没有提供者（提案 P1：命令要跑在一个 Agent 上）。界面上
  // 因此按"无数据"渲染 —— 这比继续打一条作废的 REST 后端诚实。
  const runtimeHistory = useRuntimeHistory({ limit: 200 }, { enabled: false })
  const nodeHistory = useNodeRunHistory({ limit: 200 }, { enabled: false })
  // 连接状态读桥握手（无轮询），不再轮询那个已作废的 REST 后端。
  const host = useHostConnection()
  const operations = useNodeOperations((store) => store.operations)
  const workspace = useWorkspaceShallowSelector((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    workspaces: state.workspaces,
    components: state.components,
    lanes: state.lanes,
  }))

  const dashboard = useMemo(() => {
    const runtimeItems = filterByRange(runtimeHistory.data?.items ?? [], rangeDays)
    const nodeItems = filterByRange(nodeHistory.data?.items ?? [], rangeDays)
    const activeComponents = workspace.components.filter((component) => component.workspaceId === workspace.activeWorkspaceId)
    const activeLanes = workspace.lanes.filter((lane) => lane.workspaceId === workspace.activeWorkspaceId && !lane.hidden)
    const statusCounts = countStatuses(runtimeItems)
    const operationCounts = countOperations(operations)
    const totalTerminal = statusCounts.success + statusCounts.error + statusCounts.cancelled
    const successRate = totalTerminal > 0 ? statusCounts.success / totalTerminal : 0
    const backendKind: DashboardBackendStatus = host.ready ? "ready" : "unreachable"
    const backendScore = backendKind === "ready" ? 1 : 0.25
    const stabilityScore = clampPercent(Math.round((successRate || backendScore) * 76 + backendScore * 24 - operationCounts.error * 3))
    const averageDurationMs = average(nodeItems.map((item) => item.durationMs))
    const p95DurationMs = percentile(nodeItems.map((item) => item.durationMs), 0.95)
    const activitySeries = buildActivitySeries(runtimeItems, rangeDays)
    const durationSeries = buildDurationSeries(nodeItems, rangeDays)
    const nodeUsage = buildNodeUsage(nodeItems, activeComponents)
    const statusBreakdown = buildStatusBreakdown(statusCounts, t)
    const categories = buildCategoryUsage(activeComponents)
    const recentHistory = runtimeItems.slice(0, 9)
    const liveFeed = buildLiveFeed(operations)

    return {
      activeComponents,
      activeLanes,
      activitySeries,
      averageDurationMs,
      backendKind,
      categories,
      durationSeries,
      liveFeed,
      nodeItems,
      nodeUsage,
      operationCounts,
      p95DurationMs,
      recentHistory,
      runtimeItems,
      stabilityScore,
      statusBreakdown,
      statusCounts,
      successRate,
    }
  }, [
    host.ready,
    nodeHistory.data?.items,
    operations,
    rangeDays,
    runtimeHistory.data?.items,
    t,
    workspace.activeWorkspaceId,
    workspace.components,
    workspace.lanes,
  ])

  const activeWorkspace = workspace.workspaces.find((item) => item.id === workspace.activeWorkspaceId)
  const historyBusy = runtimeHistory.isLoading || nodeHistory.isLoading

  return (
    <div className="min-h-0 flex-1 overflow-auto ws-canvas-bg">
      <div className="mx-auto flex w-full max-w-[1560px] flex-col gap-5 px-4 py-4 lg:px-6 lg:py-6">
        <BlurFade>
          <section className="relative overflow-hidden rounded-xl border border-border/70 bg-card/90 p-4 shadow-2xl shadow-black/10 backdrop-blur lg:p-5">
            <BorderBeam size={160} duration={8} colorFrom="var(--chart-2)" colorTo="var(--chart-4)" borderWidth={1.25} />
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span>{t("view:dashboard.scope")}</span>
                  <Badge variant="outline" className="rounded-sm font-mono">
                    {activeWorkspace?.label ? t(activeWorkspace.label) : workspace.activeWorkspaceId}
                  </Badge>
                  <BackendBadge status={dashboard.backendKind} />
                </div>
                <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground lg:text-3xl">
                      {t("view:dashboard.title")}
                    </h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                      {t("view:dashboard.subtitle")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <LiveSignalIsland
                  active={dashboard.operationCounts.active}
                  status={dashboard.backendKind}
                  score={dashboard.stabilityScore}
                />
                <Select value={String(rangeDays)} onValueChange={(value) => setRangeDays(Number(value) as RangeDays)}>
                  <SelectTrigger className="h-10 w-full border-border/70 bg-background/70 font-mono text-xs sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {RANGE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={String(option)}>
                          {t("view:dashboard.rangeDays", { count: option })}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </BlurFade>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            delay={0}
            icon={History}
            label={t("view:dashboard.metrics.operations")}
            value={dashboard.runtimeItems.length}
            detail={t("view:dashboard.metrics.operationsDetail", { count: dashboard.nodeItems.length })}
            beam
          />
          <MetricCard
            delay={0.05}
            icon={Gauge}
            label={t("view:dashboard.metrics.successRate")}
            value={Math.round(dashboard.successRate * 100)}
            suffix="%"
            detail={t("view:dashboard.metrics.successRateDetail", { count: dashboard.statusCounts.error + dashboard.statusCounts.cancelled })}
          />
          <MetricCard
            delay={0.1}
            icon={Layers3}
            label={t("view:dashboard.metrics.components")}
            value={dashboard.activeComponents.length}
            detail={t("view:dashboard.metrics.componentsDetail", { count: dashboard.activeLanes.length })}
          />
          <MetricCard
            delay={0.15}
            icon={Clock3}
            label={t("view:dashboard.metrics.avgDuration")}
            value={Math.round(dashboard.averageDurationMs)}
            suffix="ms"
            detail={t("view:dashboard.metrics.p95Duration", { value: Math.round(dashboard.p95DurationMs) })}
          />
        </section>

        <Tabs defaultValue="overview" className="gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="w-full justify-start overflow-x-auto lg:w-fit">
              <TabsTrigger value="overview">
                <BarChart3 />
                {t("view:dashboard.tabs.overview")}
              </TabsTrigger>
              <TabsTrigger value="stability">
                <Server />
                {t("view:dashboard.tabs.stability")}
              </TabsTrigger>
              <TabsTrigger value="history">
                <Database />
                {t("view:dashboard.tabs.history")}
              </TabsTrigger>
            </TabsList>
            {historyBusy ? (
              <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
                <StatusMark status="running" size={14} />
                {t("view:dashboard.loading")}
              </div>
            ) : null}
          </div>

          <TabsContent value="overview" className="m-0 flex flex-col gap-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
              <DashboardCard
                title={t("view:dashboard.charts.activity")}
                description={t("view:dashboard.charts.activityDesc")}
                icon={Activity}
              >
                <ChartContainer config={activityChartConfig} className="h-[300px] w-full aspect-auto">
                  <AreaChart data={dashboard.activitySeries} margin={{ left: 4, right: 12, top: 10 }}>
                    <defs>
                      <linearGradient id="dashboardSuccess" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.7} />
                        <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0.04} />
                      </linearGradient>
                      <linearGradient id="dashboardFailed" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-failed)" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="var(--color-failed)" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="4 6" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} width={28} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                    <Area dataKey="success" type="natural" fill="url(#dashboardSuccess)" stroke="var(--color-success)" strokeWidth={2} />
                    <Area dataKey="failed" type="natural" fill="url(#dashboardFailed)" stroke="var(--color-failed)" strokeWidth={2} />
                    <Area dataKey="info" type="natural" fill="transparent" stroke="var(--color-info)" strokeDasharray="6 5" strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              </DashboardCard>

              <DashboardCard
                title={t("view:dashboard.charts.stability")}
                description={t("view:dashboard.charts.stabilityDesc")}
                icon={Gauge}
              >
                <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-1 2xl:grid-cols-[180px_minmax(0,1fr)]">
                  <div className="flex items-center justify-center rounded-lg border border-border/50 bg-muted/20 py-4">
                    <AnimatedCircularProgressBar
                      value={dashboard.stabilityScore}
                      className="size-36 text-3xl"
                      gaugePrimaryColor="var(--chart-1)"
                      gaugeSecondaryColor="var(--muted)"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col justify-center gap-3">
                    <HealthRow label={t("view:dashboard.health.backend")} value={t(`view:dashboard.backend.${dashboard.backendKind}`)} score={dashboard.backendKind === "ready" ? 100 : 45} />
                    <HealthRow label={t("view:dashboard.health.history")} value={t("view:dashboard.health.rate", { value: Math.round(dashboard.successRate * 100) })} score={Math.round(dashboard.successRate * 100)} />
                    <HealthRow label={t("view:dashboard.health.active")} value={String(dashboard.operationCounts.active)} score={dashboard.operationCounts.active > 0 ? 72 : 100} />
                  </div>
                </div>
              </DashboardCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.8fr)_minmax(0,1.2fr)]">
              <DashboardCard
                title={t("view:dashboard.charts.status")}
                description={t("view:dashboard.charts.statusDesc")}
                icon={Sparkles}
              >
                <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                  <ChartContainer config={{ count: { label: t("view:dashboard.labels.count") } }} className="mx-auto h-[230px] w-full max-w-[260px] aspect-square">
                    <PieChart>
                      <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                      <Pie
                        data={dashboard.statusBreakdown}
                        dataKey="count"
                        nameKey="label"
                        innerRadius={62}
                        outerRadius={92}
                        strokeWidth={3}
                      >
                        {dashboard.statusBreakdown.map((entry) => (
                          <Cell key={entry.status} fill={entry.fill} />
                        ))}
                        <Label
                          content={({ viewBox }) => {
                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                              return (
                                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                                    {dashboard.runtimeItems.length}
                                  </tspan>
                                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-[11px]">
                                    {t("view:dashboard.labels.events")}
                                  </tspan>
                                </text>
                              )
                            }
                            return null
                          }}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                  <div className="flex flex-col justify-center gap-3">
                    {dashboard.statusBreakdown.map((item) => (
                      <div key={item.status} className="flex items-center gap-3">
                        <span className="size-2.5 rounded-sm" style={{ background: item.fill }} />
                        <span className="min-w-0 flex-1 text-sm text-muted-foreground">{item.label}</span>
                        <span className="font-mono text-sm tabular-nums text-foreground">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </DashboardCard>

              <DashboardCard
                title={t("view:dashboard.charts.nodeUsage")}
                description={t("view:dashboard.charts.nodeUsageDesc")}
                icon={Zap}
              >
                <ChartContainer config={nodeChartConfig} className="h-[286px] w-full aspect-auto">
                  <BarChart data={dashboard.nodeUsage} layout="vertical" margin={{ left: 8, right: 20 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="4 6" />
                    <XAxis type="number" tickLine={false} axisLine={false} />
                    <YAxis dataKey="node" type="category" width={94} tickLine={false} axisLine={false} />
                    <ChartTooltip content={<ChartTooltipContent indicator="dashed" />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={5} />
                  </BarChart>
                </ChartContainer>
              </DashboardCard>
            </div>
          </TabsContent>

          <TabsContent value="stability" className="m-0 grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
            <DashboardCard
              title={t("view:dashboard.charts.duration")}
              description={t("view:dashboard.charts.durationDesc")}
              icon={Clock3}
            >
              <ChartContainer config={durationChartConfig} className="h-[320px] w-full aspect-auto">
                <AreaChart data={dashboard.durationSeries} margin={{ left: 4, right: 12, top: 10 }}>
                  <defs>
                    <linearGradient id="dashboardDuration" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-average)" stopOpacity={0.65} />
                      <stop offset="95%" stopColor="var(--color-average)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="4 6" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={10} />
                  <YAxis tickLine={false} axisLine={false} width={42} />
                  <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
                  <Area dataKey="average" type="natural" fill="url(#dashboardDuration)" stroke="var(--color-average)" strokeWidth={2} />
                </AreaChart>
              </ChartContainer>
            </DashboardCard>

            <DashboardCard
              title={t("view:dashboard.live.title")}
              description={t("view:dashboard.live.description")}
              icon={RadioTower}
            >
              {dashboard.liveFeed.length ? (
                <AnimatedList delay={700} className="items-stretch gap-2">
                  {dashboard.liveFeed.map((item) => (
                    <LiveFeedItem key={item.id} item={item} />
                  ))}
                </AnimatedList>
              ) : (
                <EmptyPanel label={t("view:dashboard.live.empty")} />
              )}
            </DashboardCard>
          </TabsContent>

          <TabsContent value="history" className="m-0 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <DashboardCard
              title={t("view:dashboard.history.title")}
              description={t("view:dashboard.history.description")}
              icon={History}
            >
              <RecentHistoryTable items={dashboard.recentHistory} />
            </DashboardCard>

            <DashboardCard
              title={t("view:dashboard.categories.title")}
              description={t("view:dashboard.categories.description")}
              icon={Layers3}
            >
              <div className="flex flex-col gap-3">
                {dashboard.categories.length ? dashboard.categories.map((category) => (
                  <CategoryRow key={category.category} category={category} />
                )) : <EmptyPanel label={t("view:dashboard.categories.empty")} />}
              </div>
            </DashboardCard>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function MetricCard({
  beam,
  delay,
  detail,
  icon: Icon,
  label,
  suffix,
  value,
}: {
  beam?: boolean
  delay: number
  detail: string
  icon: typeof Activity
  label: string
  suffix?: string
  value: number
}) {
  return (
    <BlurFade delay={delay} inView>
      <SpotlightCard className="rounded-lg">
        <Card className="relative min-h-36 overflow-hidden rounded-lg border-border/70 bg-card/90 py-4 shadow-lg shadow-black/5">
          {beam ? <BorderBeam size={110} duration={7} colorFrom="var(--chart-1)" colorTo="var(--chart-2)" /> : null}
          <CardHeader className="px-4 pb-0">
            <div className="flex items-center justify-between gap-3">
              <CardDescription className="text-[10px] font-mono uppercase tracking-widest">{label}</CardDescription>
              <span className="grid size-8 place-items-center rounded-md border border-border/60 bg-muted/30 text-primary">
                <Icon className="size-4" />
              </span>
            </div>
          </CardHeader>
          <CardContent className="px-4">
            <div className="mt-1 flex items-baseline gap-1">
              <NumberTicker value={value} className="text-3xl font-semibold tracking-tight text-foreground" />
              {suffix ? <span className="text-sm font-medium text-muted-foreground">{suffix}</span> : null}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p>
          </CardContent>
        </Card>
      </SpotlightCard>
    </BlurFade>
  )
}

function DashboardCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode
  description: string
  icon: typeof Activity
  title: string
}) {
  return (
    <Card className="rounded-lg border-border/70 bg-card/90 shadow-xl shadow-black/5">
      <CardHeader className="px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="size-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="mt-1 leading-5">{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  )
}

function LiveSignalIsland({ active, score, status }: { active: number; score: number; status: DashboardBackendStatus }) {
  const { t } = useTranslation()
  return (
    <DynamicIslandProvider initialSize="compact" presets={{ compact: { width: 260, aspectRatio: 46 / 260, borderRadius: 23 } }}>
      <DynamicIsland
        id="dashboard-live-signal"
        className="border border-border/70 bg-background/75 px-3 shadow-lg shadow-black/10 backdrop-blur"
      >
        <DynamicContainer className="flex w-full items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn(
              "relative flex size-2.5 rounded-full",
              status === "ready" ? "bg-primary" : "bg-destructive",
            )}>
              <span className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                status === "ready" ? "bg-primary" : "bg-destructive",
              )} />
            </span>
            <span className="truncate text-[11px] font-mono uppercase tracking-widest text-foreground">
              {t("view:dashboard.liveSignal")}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <span>{active}</span>
            <span>/</span>
            <span>{score}</span>
          </div>
        </DynamicContainer>
      </DynamicIsland>
    </DynamicIslandProvider>
  )
}

function BackendBadge({ status }: { status: DashboardBackendStatus }) {
  const { t } = useTranslation()
  const variant = status === "ready" ? "secondary" : status === "checking" ? "outline" : "destructive"
  return (
    <Badge variant={variant} className="rounded-sm font-mono">
      {t(`view:dashboard.backend.${status}`)}
    </Badge>
  )
}

function HealthRow({ label, score, value }: { label: string; score: number; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground">{value}</span>
      </div>
      <Progress value={clampPercent(score)} className="h-1.5" />
    </div>
  )
}

function RecentHistoryTable({ items }: { items: RuntimeHistoryItemDTO[] }) {
  const { t } = useTranslation()
  if (!items.length) return <EmptyPanel label={t("view:dashboard.history.empty")} />

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("view:dashboard.history.columns.operation")}</TableHead>
          <TableHead>{t("view:dashboard.history.columns.status")}</TableHead>
          <TableHead>{t("view:dashboard.history.columns.kind")}</TableHead>
          <TableHead className="text-right">{t("view:dashboard.history.columns.duration")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="max-w-[280px]">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate font-medium">{item.title ?? item.target?.label ?? item.nodeId ?? item.operation}</span>
                <span className="truncate text-[11px] text-muted-foreground">{item.message}</span>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={item.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{t(`view:history.kind.${item.kind}`)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{formatDuration(item.durationMs)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function StatusBadge({ status }: { status: RuntimeHistoryStatusDTO }) {
  const { t } = useTranslation()
  const variant = status === "error" ? "destructive" : status === "success" ? "secondary" : "outline"
  return (
    <Badge variant={variant} className="rounded-sm font-mono">
      {t(`view:history.status.${status}`)}
    </Badge>
  )
}

function LiveFeedItem({ item }: { item: ReturnType<typeof buildLiveFeed>[number] }) {
  const Icon = item.phase === "error" ? AlertTriangle : item.phase === "completed" ? CheckCircle2 : Activity
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-start gap-3">
        <span className="grid size-8 place-items-center rounded-md border border-border/60 bg-background/70 text-primary">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{item.node}</span>
            <span className="shrink-0 text-[10px] font-mono uppercase text-muted-foreground">{item.phase}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.message}</p>
        </div>
      </div>
    </div>
  )
}

function CategoryRow({ category }: { category: CategoryPoint }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">{category.category}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{category.count}</span>
      </div>
      <Progress value={category.percent} className="h-1.5" />
    </div>
  )
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/10 px-4 text-center text-sm text-muted-foreground">
      {label}
    </div>
  )
}

function filterByRange<T extends { finishedAt: number }>(items: T[], rangeDays: RangeDays): T[] {
  const since = Date.now() - rangeDays * 24 * 60 * 60 * 1000
  return items.filter((item) => item.finishedAt >= since)
}

function countStatuses(items: RuntimeHistoryItemDTO[]) {
  return items.reduce(
    (counts, item) => {
      counts[item.status] += 1
      return counts
    },
    { success: 0, error: 0, cancelled: 0, info: 0 } satisfies Record<RuntimeHistoryStatusDTO, number>,
  )
}

function countOperations(operations: TrackedNodeOperation[]) {
  return operations.reduce(
    (counts, operation) => {
      counts.total += 1
      if (!isTerminalPhase(operation.phase)) counts.active += 1
      if (operation.phase === "error") counts.error += 1
      if (operation.phase === "completed") counts.completed += 1
      return counts
    },
    { active: 0, completed: 0, error: 0, total: 0 },
  )
}

function buildActivitySeries(items: RuntimeHistoryItemDTO[], rangeDays: RangeDays): ActivityPoint[] {
  const buckets = createDayBuckets(rangeDays, () => ({ success: 0, failed: 0, info: 0, total: 0 }))
  for (const item of items) {
    const bucket = buckets.get(dayKey(item.finishedAt))
    if (!bucket) continue
    bucket.total += 1
    if (item.status === "success") bucket.success += 1
    else if (item.status === "info") bucket.info += 1
    else bucket.failed += 1
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({ day: key, ...value }))
}

function buildDurationSeries(items: { finishedAt: number; durationMs: number }[], rangeDays: RangeDays): DurationPoint[] {
  const buckets = createDayBuckets(rangeDays, () => ({ total: 0, count: 0 }))
  for (const item of items) {
    const bucket = buckets.get(dayKey(item.finishedAt))
    if (!bucket) continue
    bucket.total += item.durationMs
    bucket.count += 1
  }
  return Array.from(buckets.entries()).map(([day, value]) => ({
    day,
    average: value.count ? Math.round(value.total / value.count) : 0,
  }))
}

function buildNodeUsage(
  nodeItems: { nodeId: string; status: "success" | "error" | "cancelled"; durationMs: number }[],
  activeComponents: { moduleId: string }[],
): NodeUsagePoint[] {
  const counts = new Map<string, { count: number; failed: number; success: number; totalMs: number }>()

  for (const item of nodeItems) {
    const next = counts.get(item.nodeId) ?? { count: 0, failed: 0, success: 0, totalMs: 0 }
    next.count += 1
    next.totalMs += item.durationMs
    if (item.status === "success") next.success += 1
    else next.failed += 1
    counts.set(item.nodeId, next)
  }

  if (!counts.size) {
    for (const component of activeComponents) {
      const next = counts.get(component.moduleId) ?? { count: 0, failed: 0, success: 0, totalMs: 0 }
      next.count += 1
      counts.set(component.moduleId, next)
    }
  }

  return Array.from(counts.entries())
    .map(([node, value]) => ({
      node,
      count: value.count,
      failed: value.failed,
      success: value.success,
      averageMs: value.count ? Math.round(value.totalMs / value.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

function buildStatusBreakdown(counts: Record<RuntimeHistoryStatusDTO, number>, t: TFunction): StatusPoint[] {
  return (Object.keys(counts) as RuntimeHistoryStatusDTO[]).map((status) => ({
    status,
    label: t(`view:history.status.${status}`),
    count: counts[status],
    fill: statusColors[status],
  }))
}

function buildCategoryUsage(activeComponents: { moduleId: string }[]): CategoryPoint[] {
  const counts = new Map<string, number>()
  for (const component of activeComponents) {
    const category = getModule(component.moduleId)?.category ?? "OTHER"
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  if (!counts.size) {
    for (const module of MODULE_REGISTRY) {
      counts.set(module.category, (counts.get(module.category) ?? 0) + 1)
    }
  }

  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0)
  return Array.from(counts.entries())
    .map(([category, count]) => ({
      category,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 7)
}

function buildLiveFeed(operations: TrackedNodeOperation[]) {
  return operations.slice(0, 8).map((operation) => ({
    id: operation.operationId,
    node: operation.nodeId,
    phase: operation.phase,
    message: operation.lastMessage ?? operation.result?.message ?? "",
    updatedAt: operation.updatedAt,
  }))
}

function createDayBuckets<T>(rangeDays: RangeDays, factory: () => T): Map<string, T> {
  const result = new Map<string, T>()
  const today = startOfDay(Date.now())
  for (let index = rangeDays - 1; index >= 0; index -= 1) {
    const ts = today - index * 24 * 60 * 60 * 1000
    result.set(dayKey(ts), factory())
  }
  return result
}

function dayKey(ts: number): string {
  const date = new Date(ts)
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`
}

function startOfDay(ts: number): number {
  const date = new Date(ts)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1))
  return sorted[index] ?? 0
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}
