import { Component } from './Component'
import { NODE_MANIFESTS, type AppNodeEntry } from '@/components/modules/packageModules.generated'

export default {
  def: NODE_MANIFESTS.kisaki,
  Component,
} satisfies AppNodeEntry
