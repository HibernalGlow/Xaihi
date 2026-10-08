/**
 * @xyflow/react 的浏览器端轻量降级垫片：
 * 用于在尚未全仓引入 @xyflow 外部重型依赖时，保证 marku 工作流编辑器及其依赖图可编译且安全挂载。
 */

import React, { useState, useCallback } from "react"

export const BackgroundVariant = {
  Dots: "dots",
  Lines: "lines",
  Cross: "cross",
} as const

export const MarkerType = {
  Arrow: "arrow",
  ArrowClosed: "arrowclosed",
} as const

export const Position = {
  Left: "left",
  Right: "right",
  Top: "top",
  Bottom: "bottom",
} as const

export function Background() {
  return null
}

export function Controls() {
  return null
}

export function Handle() {
  return null
}

export function Panel({ children, className, style }: { children?: React.ReactNode; className?: string; style?: React.CSSProperties; position?: string }) {
  return (
    <div className={className} style={{ position: "absolute", zIndex: 5, ...style }}>
      {children}
    </div>
  )
}

export function ReactFlow({
  children,
  className,
  style,
}: {
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  [key: string]: unknown
}) {
  return (
    <div
      className={`react-flow-stub ${className ?? ""}`}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function useNodesState<T = unknown>(initial: T[] = []) {
  const [nodes, setNodes] = useState<T[]>(initial)
  const onNodesChange = useCallback((_changes: unknown) => {}, [])
  return [nodes, setNodes, onNodesChange] as const
}

export function useReactFlow() {
  return {
    setViewport: () => {},
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    fitView: () => {},
  }
}

export type Edge = unknown
export type Node<T = unknown> = unknown
export type NodeProps<T = unknown> = unknown
export type NodeTypes = Record<string, unknown>
export type Viewport = { x: number; y: number; zoom: number }
