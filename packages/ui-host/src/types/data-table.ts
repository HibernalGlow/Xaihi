/**
 * DataTable（基于 @tanstack/react-table）的类型扩展与配套接口。
 *
 * 通过 module augmentation 为 TanStack Table 注入项目专属的 `TableMeta`
 * 与 `ColumnMeta`，使列定义可携带筛选变体、占位符、图标等元信息。
 * 同时定义 URL 同步所需的 query key、过滤选项、行操作等公共类型。
 */
import type { ColumnSort, Row, RowData } from "@tanstack/react-table";
import type * as React from "react";
import type { DataTableConfig } from "@/config/data-table";
import type { FilterItemSchema } from "@/lib/parsers";

declare module "@tanstack/react-table" {
  /** 表级元信息：用于把分页/排序/筛选状态同步到 URL query。 */
  interface TableMeta<TData extends RowData> {
    queryKeys?: QueryKeys;
  }

  /** 列级元信息：驱动表头筛选 UI 的渲染（变体、选项、范围、单位、图标）。 */
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
    placeholder?: string;
    variant?: FilterVariant;
    range?: [number, number];
    unit?: string;
  }
}

/** URL query 参数 key 集合，用于在 nuqs 中同步 DataTable 状态。 */
export interface QueryKeys {
  page: string;
  perPage: string;
  sort: string;
  filters: string;
  joinOperator: string;
}

/** 单个筛选选项（用于 select/multi-select 变体）。 */
export interface Option {
  label: string;
  value: string;
  count?: number;
  icon?: React.ComponentType<React.ComponentProps<"svg">>;
}

export type FilterOperator = DataTableConfig["operators"][number];
export type FilterVariant = DataTableConfig["filterVariants"][number];
export type JoinOperator = DataTableConfig["joinOperators"][number];

/** 泛型化的排序条件，id 限定为 TData 的字符串键。 */
export interface ExtendedColumnSort<TData> extends Omit<ColumnSort, "id"> {
  id: Extract<keyof TData, string>;
}

/** 泛型化的过滤条件，id 限定为 TData 的字符串键。 */
export interface ExtendedColumnFilter<TData> extends FilterItemSchema {
  id: Extract<keyof TData, string>;
}

/** 行级操作意图（更新或删除），由行操作菜单触发。 */
export interface DataTableRowAction<TData> {
  row: Row<TData>;
  variant: "update" | "delete";
}
