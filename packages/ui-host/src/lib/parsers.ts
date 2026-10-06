/**
 * URL 查询参数解析器（基于 nuqs）。
 *
 * 为数据表格的排序状态（sorting）与筛选状态（filters）提供 nuqs parser，
 * 让这些状态可以序列化到 URL 查询参数中，支持分享链接与浏览器前进/后退。
 *
 * 解析流程：JSON.parse → zod schema 校验 → columnIds 白名单过滤 → 返回类型化结果。
 * 任一步骤失败返回 null（nuqs 会忽略该参数）。
 *
 * columnIds 白名单防止用户手动构造包含不存在列的 URL 导致 UI 异常。
 */
import { createParser } from "nuqs/server";
import { z } from "zod";

import { dataTableConfig } from "@/components/niko-table/config/data-table";

import type {
  ExtendedColumnFilter,
  ExtendedColumnSort,
} from "@/components/niko-table/types";

/** 排序项 schema：{ id: 列名, desc: 是否降序 }。 */
const sortingItemSchema = z.object({
  id: z.string(),
  desc: z.boolean(),
});

/**
 * 创建排序状态的 nuqs parser。
 *
 * @param columnIds 允许的列 id 白名单（可选）。未提供时允许任意列 id。
 * @returns nuqs parser，用于 useQueryStates / useQueryState 的解析配置
 */
export const getSortingStateParser = <TData>(
  columnIds?: string[] | Set<string>,
) => {
  const validKeys = columnIds
    ? columnIds instanceof Set
      ? columnIds
      : new Set(columnIds)
    : null;

  return createParser({
    parse: (value) => {
      try {
        const parsed = JSON.parse(value);
        const result = z.array(sortingItemSchema).safeParse(parsed);

        if (!result.success) return null;

        if (validKeys && result.data.some((item) => !validKeys.has(item.id))) {
          return null;
        }

        return result.data as ExtendedColumnSort<TData>[];
      } catch {
        return null;
      }
    },
    serialize: (value) => JSON.stringify(value),
    eq: (a, b) =>
      a.length === b.length &&
      a.every(
        (item, index) =>
          item.id === b[index]?.id && item.desc === b[index]?.desc,
      ),
  });
};

/** 筛选项 schema：{ id, value, variant, operator, filterId }。 */
const filterItemSchema = z.object({
  id: z.string(),
  value: z.union([z.string(), z.array(z.string())]),
  variant: z.enum(dataTableConfig.filterVariants),
  operator: z.enum(dataTableConfig.operators),
  filterId: z.string(),
});

export type FilterItemSchema = z.infer<typeof filterItemSchema>;

/**
 * 创建筛选状态的 nuqs parser。
 *
 * @param columnIds 允许的列 id 白名单（可选）。
 * @returns nuqs parser
 */
export const getFiltersStateParser = <TData>(
  columnIds?: string[] | Set<string>,
) => {
  const validKeys = columnIds
    ? columnIds instanceof Set
      ? columnIds
      : new Set(columnIds)
    : null;

  return createParser({
    parse: (value) => {
      try {
        const parsed = JSON.parse(value);
        const result = z.array(filterItemSchema).safeParse(parsed);

        if (!result.success) return null;

        if (validKeys && result.data.some((item) => !validKeys.has(item.id))) {
          return null;
        }

        return result.data as ExtendedColumnFilter<TData>[];
      } catch {
        return null;
      }
    },
    serialize: (value) => JSON.stringify(value),
    eq: (a, b) =>
      a.length === b.length &&
      a.every(
        (filter, index) =>
          filter.id === b[index]?.id &&
          filter.value === b[index]?.value &&
          filter.variant === b[index]?.variant &&
          filter.operator === b[index]?.operator,
      ),
  });
};
