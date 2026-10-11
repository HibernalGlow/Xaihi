import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { StandaloneApplicationProvider, StandaloneApplicationSettings, StandaloneApplicationSettingsButton } from './StandaloneApplicationContext'

afterEach(cleanup)
function NodeSettings() {
  return <StandaloneApplicationSettings title="节点设置" description="节点配置" trigger={<button>旧节点入口</button>}>
    <label>节点缓存路径<input /></label>
  </StandaloneApplicationSettings>
}
function Application() {
  const [open, setOpen] = useState(false)
  return <StandaloneApplicationProvider value={{ name: 'Kisaki', open, setOpen, appearance: <label>主题模式<select><option>跟随工作台</option></select></label> }}>
    <StandaloneApplicationSettingsButton /><NodeSettings />
  </StandaloneApplicationProvider>
}
test('one visible application entry opens appearance and node settings together and can reopen after closing', () => {
  render(<Application />)
  expect(screen.queryByRole('button', { name: '旧节点入口' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }))
  expect(screen.getByRole('dialog').textContent).toContain('Kisaki 应用设置')
  expect(screen.getByLabelText('主题模式')).toBeTruthy()
  expect(screen.getByLabelText('节点缓存路径')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '应用设置' }))
  expect(screen.getByRole('dialog')).toBeTruthy()
})
test('workspace node retains its own entry without standalone appearance', () => {
  render(<NodeSettings />)
  fireEvent.click(screen.getByRole('button', { name: '旧节点入口' }))
  expect(screen.getByRole('dialog').textContent).toContain('节点配置')
  expect(screen.queryByLabelText('主题模式')).toBeNull()
})
