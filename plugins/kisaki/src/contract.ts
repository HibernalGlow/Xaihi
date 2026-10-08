/**
 * 迁移期垫片：kisaki 内核用到的合约与事件类型。
 * @module xaihi-kisaki/contract
 */

export interface NodeRunEvent {
  type: 'progress' | 'log'
  progress?: number
  message: string
  data?: unknown
}

export interface NodeRunResult<TData = unknown> {
  success: boolean
  message: string
  data?: TData
  stats?: Record<string, number>
  outputPath?: string
}

export interface NodeDef {
  id: string
  name: string
  version: string
  category: string
  description: string
  icon: string
  keywords?: string[]
}

export interface NodeHelpField {
  id: string
  label: string
  description: string
  required?: boolean
  default?: unknown
}

export interface NodeHelp {
  whenToUse: { zh: string; en: string }
  workflows: {
    ui?: string[]
    cli?: string[]
  }
}

export interface HeadlessNodePackage {
  def: NodeDef
  run?(input: unknown, onEvent?: (event: NodeRunEvent) => void): Promise<NodeRunResult>
}
