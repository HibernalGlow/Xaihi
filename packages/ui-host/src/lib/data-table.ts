/**
 * 数据表格工具函数（TanStack Table）。
 *
 * 提供两类与 TanStack Table 配合使用的纯函数工具：
 * 1. 列固定（pinning）样式计算：根据列的固定状态返回 sticky 定位所需的 CSS 属性；
 * 2. 筛选操作符映射：把 FilterVariant 映射到允许的操作符列表，并提供默认操作符与有效筛选条件过滤。
 *
 * 这些工具与 `@/components/data-table` 中的列定义、`@/config/data-table` 中的操作符配置共同工作，
 * 服务于所有节点中复用的数据表格 UI。
 */
import type { Column } from "@tanstack/react-table";
import type * as React from "react";
import { dataTableConfig } from "@/config/data-table";
import type {
  ExtendedColumnFilter,
  FilterOperator,
  FilterVariant,
} from "@/types/data-table";

/**
 * 计算列固定（pinning）所需的 CSS 属性。
 *
 * TanStack Table 自身只维护 pinning 状态，不输出具体样式；本函数把状态转换为 sticky 定位样式：
 * - left/right：固定列的偏移量（基于列宽与已固定列宽度累加）；
 * - position: sticky / relative：固定列用 sticky，普通列用 relative；
 * - boxShadow：可选的内阴影，用于在最后一列左固定 / 第一列右固定处显示分界线；
 * - opacity/zIndex：让固定列略微不透明并提升层级，避免滚动时被其他列遮挡。
 *
 * @param column TanStack Table 列实例
 * @param withBorder 是否显示固定列的分界阴影
 */
export function getColumnPinningStyle<TData>({
  column,
  withBorder = false,
}: {
  column: Column<TData>;
  withBorder?: boolean;
}): React.CSSProperties {
  const isPinned = column.getIsPinned();
  const isLastLeftPinnedColumn =
    isPinned === "left" && column.getIsLastColumn("left");
  const isFirstRightPinnedColumn =
    isPinned === "right" && column.getIsFirstColumn("right");

  return {
    boxShadow: withBorder
      ? isLastLeftPinnedColumn
        ? "-4px 0 4px -4px var(--border) inset"
        : isFirstRightPinnedColumn
          ? "4px 0 4px -4px var(--border) inset"
          : undefined
      : undefined,
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    opacity: isPinned ? 0.97 : 1,
    position: isPinned ? "sticky" : "relative",
    background: isPinned ? "var(--background)" : "var(--background)",
    width: column.getSize(),
    zIndex: isPinned ? 1 : undefined,
  };
}

/**
 * 根据 FilterVariant 返回该列允许使用的筛选操作符列表。
 *
 * 不同列类型支持不同的操作符集合：例如 text 支持 iLike/contains 等，number 支持 gt/lt/between 等。
 * 操作符的具体定义在 `@/config/data-table` 中维护，本函数只负责映射。未知 variant 回退为文本操作符。
 *
 * @param filterVariant 列的筛选变体（text/number/range/date/dateRange/boolean/select/multiSelect）
 * @returns 允许的操作符列表（含 label 与 value）
 */
export function getFilterOperators(filterVariant: FilterVariant) {
  const operatorMap: Record<
    FilterVariant,
    { label: string; value: FilterOperator }[]
  > = {
    text: dataTableConfig.textOperators,
    number: dataTableConfig.numericOperators,
    range: dataTableConfig.numericOperators,
    date: dataTableConfig.dateOperators,
    dateRange: dataTableConfig.dateOperators,
    boolean: dataTableConfig.booleanOperators,
    select: dataTableConfig.selectOperators,
    multiSelect: dataTableConfig.multiSelectOperators,
  };

  return operatorMap[filterVariant] ?? dataTableConfig.textOperators;
}

/**
 * 返回某 FilterVariant 的默认操作符。
 *
 * 取该 variant 的第一个操作符；若操作符列表为空，则 text 回退为 iLike，其他回退为 eq。
 * 用于新建筛选条件时给操作符下拉框一个合理的初始值。
 *
 * @param filterVariant 列的筛选变体
 * @returns 默认操作符 value
 */
export function getDefaultFilterOperator(filterVariant: FilterVariant) {
  const operators = getFilterOperators(filterVariant);

  return operators[0]?.value ?? (filterVariant === "text" ? "iLike" : "eq");
}

/**
 * 过滤出"有效"的筛选条件，剔除空值筛选。
 *
 * empty / not.empty 操作符本身即代表"为空"语义（算子名与 niko-table 的实现同源），始终保留；
 * 其他操作符按 value 类型判断：数组需非空，标量需非空字符串且非 null/undefined。
 *
 * 用于在应用筛选到表格数据 / 序列化到 URL 之前清理用户未填完整的临时筛选行。
 *
 * @param filters 原始筛选条件数组
 * @returns 有效的筛选条件数组
 */
export function getValidFilters<TData>(
  filters: ExtendedColumnFilter<TData>[],
): ExtendedColumnFilter<TData>[] {
  return filters.filter(
    (filter) =>
      filter.operator === "empty" ||
      filter.operator === "not.empty" ||
      (Array.isArray(filter.value)
        ? filter.value.length > 0
        : filter.value !== "" &&
          filter.value !== null &&
          filter.value !== undefined),
  );
}
