import { nodeHelpLoaders } from "@/components/modules/packageModules.generated"

type NodeHelpLoader = (typeof nodeHelpLoaders)[keyof typeof nodeHelpLoaders]

/**
 * The generated map is keyed by node id, but a caller asks with whatever id the route or card carries, so the
 * lookup is widened to a record of the same loader type. Unknown ids then answer `undefined` instead of
 * type-checking as `any`.
 */
const loaders: Readonly<Record<string, NodeHelpLoader | undefined>> = nodeHelpLoaders

export function hasNodeHelp(moduleId: string | null | undefined): boolean {
  return Boolean(moduleId && loaders[moduleId])
}

export function getNodeHelpLoader(moduleId: string): NodeHelpLoader | undefined {
  return loaders[moduleId]
}
