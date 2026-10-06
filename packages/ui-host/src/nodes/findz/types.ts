import { RULE_TREE_FORMAT, type RuleTree } from "@xiranite/shared/rules"
import type { FindzTask } from "@xiranite/findz-native"
import type { RuleTreeField } from "@/nodes/shared/RuleTreeEditor"
import type { FindzWorkspaceLayout } from "./workspace-layout"

export type FindzAreaMetric = "archiveSize" | "totalImageSize" | "averageImageSize" | "averageBytesPerMegapixel" | "medianBytesPerMegapixel" | "anomalyCount" | "estimatedSavings"
export type FindzArchiveSort = "relativePath" | "archiveSize" | "imageCount" | "analysisCoverage" | "totalImageSize" | "averageImageSize" | "averageBytesPerMegapixel" | "anomalyCount" | "estimatedSavings"
export type FindzT = (key: string, fallback: string, vars?: Record<string, unknown>) => string

export interface FindzCardState {
  libraryRoot?: string
  libraryId?: string
  pathPrefix?: string
  text?: string
  rules?: RuleTree
  sortBy?: FindzArchiveSort
  sortDesc?: boolean
  areaBy?: FindzAreaMetric
  selectedArchiveId?: number
  taskId?: string
  pageCursor?: string
  workspace?: FindzWorkspaceLayout
}

export function getFindzRuleFields(t: FindzT): readonly RuleTreeField[] {
  const field = (name: string, key: string, fallback: string, type: RuleTreeField["type"], options?: readonly { name: string; key: string; fallback: string }[]): RuleTreeField => ({
    name,
    label: t(`rules.fields.${key}`, fallback),
    type,
    ...(options ? { options: options.map((option) => ({ name: option.name, label: t(`rules.options.${option.key}`, option.fallback) })) } : {}),
  })
  return [
    field("relativePath", "relativePath", "Archive path", "text"),
    field("scanState", "scanState", "Index state", "select", [{ name: "indexed", key: "indexed", fallback: "Indexed" }, { name: "corrupt_archive", key: "corrupt", fallback: "Corrupt" }, { name: "unsupported_archive", key: "unsupported", fallback: "Unsupported" }, { name: "rejected_archive", key: "rejected", fallback: "Rejected" }]),
    field("archiveSize", "archiveSize", "Archive size", "number"),
    field("memberCount", "memberCount", "Members", "number"),
    field("imageCount", "imageCount", "Image candidates", "number"),
    field("memberPath", "memberPath", "Member path", "text"),
    field("memberSize", "memberSize", "Member size", "number"),
    field("extension", "extension", "Member extension", "text"),
    field("actualFormat", "actualFormat", "Actual format", "text"),
    field("width", "width", "Image width", "number"),
    field("height", "height", "Image height", "number"),
    field("pixels", "pixels", "Pixels", "number"),
    field("bytesPerMegapixel", "bytesPerMegapixel", "Bytes / MP", "number"),
    field("analysisStatus", "analysisStatus", "Analysis status", "select", [{ name: "complete", key: "complete", fallback: "Complete" }, { name: "metadata_budget_exceeded", key: "budgetExceeded", fallback: "Budget exceeded" }, { name: "unsupported_format", key: "unsupportedFormat", fallback: "Unsupported format" }, { name: "parser_failure", key: "parserFailure", fallback: "Parser failure" }, { name: "encrypted_member", key: "encrypted", fallback: "Encrypted" }]),
    field("anomalyKind", "anomalyKind", "Anomaly kind", "select", [{ name: "bytes_per_megapixel_high", key: "highBytesPerMegapixel", fallback: "High bytes / MP" }, { name: "member_size_high", key: "largeMember", fallback: "Large member" }]),
    field("anomalyScore", "anomalyScore", "Anomaly score", "number"),
    field("memberEstimatedSavings", "memberEstimatedSavings", "Member estimated savings", "number"),
    field("analysisCoverage", "analysisCoverage", "Analyzed images", "number"),
    field("totalImageSize", "totalImageSize", "Total image size", "number"),
    field("averageBytesPerMegapixel", "averageBytesPerMegapixel", "Average bytes / MP", "number"),
    field("anomalyCount", "anomalyCount", "Anomalies", "number"),
    field("estimatedSavings", "estimatedSavings", "Estimated savings", "number"),
  ]
}

export function getFindzAreaMetrics(t: FindzT): ReadonlyArray<{ value: FindzAreaMetric; label: string }> {
  return [
    { value: "archiveSize", label: t("metrics.archiveSize", "Archive size") },
    { value: "totalImageSize", label: t("metrics.totalImageSize", "Total image size") },
    { value: "averageImageSize", label: t("metrics.averageImageSize", "Average image size") },
    { value: "averageBytesPerMegapixel", label: t("metrics.averageBytesPerMegapixel", "Average bytes / MP") },
    { value: "medianBytesPerMegapixel", label: t("metrics.medianBytesPerMegapixel", "Median bytes / MP") },
    { value: "anomalyCount", label: t("metrics.anomalyCount", "Anomaly count") },
    { value: "estimatedSavings", label: t("metrics.estimatedSavings", "Estimated savings") },
  ]
}

export function getFindzArchiveSorts(t: FindzT): ReadonlyArray<{ value: FindzArchiveSort; label: string }> {
  return [
    { value: "relativePath", label: t("sort.path", "Path") },
    { value: "archiveSize", label: t("sort.archiveSize", "Archive size") },
    { value: "imageCount", label: t("sort.imageCount", "Image candidates") },
    { value: "analysisCoverage", label: t("sort.analysisCoverage", "Analysis coverage") },
    { value: "totalImageSize", label: t("sort.totalImageSize", "Total image size") },
    { value: "averageImageSize", label: t("sort.averageImageSize", "Average image size") },
    { value: "averageBytesPerMegapixel", label: t("sort.averageBytesPerMegapixel", "Average bytes / MP") },
    { value: "anomalyCount", label: t("sort.anomalyCount", "Anomalies") },
    { value: "estimatedSavings", label: t("sort.estimatedSavings", "Estimated savings") },
  ]
}

export function createFindzRuleTree(): RuleTree {
  return {
    format: RULE_TREE_FORMAT,
    version: 1,
    root: { id: "findz-root", kind: "group", combinator: "all", not: false, children: [] },
  }
}

export function isTerminalTask(task: FindzTask | undefined): boolean {
  return task !== undefined && ["completed", "completed_with_warnings", "cancelled", "failed"].includes(task.status)
}
