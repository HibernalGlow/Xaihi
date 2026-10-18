import * as React from 'react'
export const Probe = { react: React, version: React.version }
export default function Panel({ host, locale }: { host: { runCommand(line: string): Promise<{ ok: boolean; reason?: string }> }; locale: string }) {
  const [count, setCount] = React.useState(0)
  const [reason, setReason] = React.useState('')
  return <div><button onClick={() => setCount(count + 1)}>MF2 panel count: {count}</button><span>locale: {locale}</span><button onClick={async () => { const outcome = await host.runCommand('/mf2 status'); setReason(outcome.reason ?? 'success') }}>Run command</button><p role="status">{reason}</p></div>
}
