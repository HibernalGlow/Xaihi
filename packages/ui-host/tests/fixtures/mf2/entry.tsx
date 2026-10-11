import * as React from 'react'
export const Probe = { react: React, version: React.version }
function Counter() {
  const [count, setCount] = React.useState(0)
  return <button onClick={() => setCount(count + 1)}>MF2 node count: {count}</button>
}
export default { def: { id: 'mf2.node', name: 'MF2 node', version: '1.0.0', category: 'other', description: 'Acceptance fixture', icon: 'Puzzle' }, core: {}, Component: Counter }
