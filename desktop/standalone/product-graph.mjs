/** 编译后的真实模块图：节点本体必须在，工作台 chrome 与其他节点必须不在。 */
export function assertKisakiGraph(resources) {
  if (!resources.some(path => path.endsWith('/nodes/kisaki/Component.tsx'))) throw new Error('缺少真实 Kisaki 组件')
  const forbidden = resources.filter(path => /\/nodes\/(?!kisaki\/|shared\/)/.test(path) || /\/(App|WorkspaceLayout|TopBar|BottomBar|AlphabetNodeRail)\.(tsx?|jsx?)$/.test(path))
  if (forbidden.length) throw new Error(`独立产品混入工作台或其他节点：${forbidden.join(', ')}`)
}
