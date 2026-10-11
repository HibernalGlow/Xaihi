import type { ComponentProps } from "react"
import { StandaloneAppearanceProvider } from "@/nodes/shared/StandaloneAppearance"

// Kisaki 保留原节点入口；独立产品的配置和界面实现由统一组件提供。
export { StandaloneAppearanceSettings as KisakiAppearanceSettings, useStandaloneAppearance as useKisakiAppearance } from "@/nodes/shared/StandaloneAppearance"
export type { StandaloneAppearanceMode as KisakiAppearanceMode, StandaloneColorTheme as KisakiColorTheme, StandaloneAppearanceConfig as KisakiAppearanceConfig } from "@/nodes/shared/StandaloneAppearance"
export function KisakiAppearanceProvider(props: Omit<ComponentProps<typeof StandaloneAppearanceProvider>, "nodeId">) {
  return <StandaloneAppearanceProvider {...props} nodeId="kisaki" />
}
