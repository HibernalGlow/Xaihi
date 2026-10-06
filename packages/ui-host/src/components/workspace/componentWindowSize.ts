import type { ComponentInstance } from "@/types/workspace"

export function updateComponentWindowSize(
  components: ComponentInstance[],
  componentId: string,
  size: { width: number; height: number },
  updatedAt = Date.now(),
): ComponentInstance[] {
  const width = Math.round(size.width)
  const height = Math.round(size.height)
  if (width < 360 || height < 260) return components

  let changed = false
  const next = components.map((component) => {
    if (component.id !== componentId) return component
    if (component.windowSize?.width === width && component.windowSize.height === height) return component
    changed = true
    return { ...component, windowSize: { width, height }, updatedAt }
  })
  return changed ? next : components
}
