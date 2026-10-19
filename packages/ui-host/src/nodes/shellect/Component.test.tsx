import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Manager, type ShellectCall } from '../../../../../plugins/shellect/frontend/Manager'
import type { ShellectManagerCatalog } from '../../../../../plugins/shellect/src/manager'

afterEach(cleanup)
function catalog(platform: 'darwin' | 'win32' | 'linux' = 'darwin'): ShellectManagerCatalog {
  return { platform, hostPlatform: 'darwin', title: 'Xaihi · Shellect', enabled: true, namespace: 'xaihi-shellect', revision: 3, writable: true, settingsReason: '', policies: {}, actions: [{ id: 'dissolvef.direct', nodeId: 'dissolvef', title: '解散文件夹', sourceTitle: '解散文件夹', selection: 'directories', mutates: true, registered: true, supported: true, enabled: true, order: 0 }] }
}
test('switches platforms, saves title with the loaded revision and reads back a settings conflict', async () => {
  const call = vi.fn<ShellectCall>(async input => input.action === 'catalog'
    ? { success: true, data: catalog(input.platform as 'darwin' | 'win32' | 'linux') }
    : { success: true, data: { status: 'conflict', catalog: { ...catalog('win32'), revision: 4 } } })
  render(<Manager call={call} />)
  await screen.findByText('解散文件夹')
  fireEvent.click(screen.getByRole('button', { name: 'Windows' }))
  await waitFor(() => expect(call).toHaveBeenCalledWith({ action: 'catalog', platform: 'win32' }))
  await screen.findByLabelText('动作名称 · dissolvef.direct')
  fireEvent.change(screen.getByLabelText('动作名称 · dissolvef.direct'), { target: { value: 'Dissolve on Windows' } })
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
  await screen.findByText(/原版本 3，当前版本 4/)
  expect(call).toHaveBeenCalledWith({ action: 'configure', platform: 'win32', id: 'dissolvef.direct', title: 'Dissolve on Windows', expectedRevision: 3 })
})
test('uses standard notifications to reread and disposes the subscription', async () => {
  let update: ((ns: string, revision: number) => void) | undefined
  const dispose = vi.fn()
  const subscribe = vi.fn(listener => { update = listener; return dispose })
  const call = vi.fn<ShellectCall>(async () => ({ success: true, data: catalog() }))
  const view = render(<Manager call={call} subscribe={subscribe} />)
  await screen.findByText('解散文件夹')
  const before = call.mock.calls.length
  update!('other-plugin', 7); expect(call).toHaveBeenCalledTimes(before)
  update!('xaihi-shellect', 7)
  await waitFor(() => expect(call.mock.calls.length).toBeGreaterThan(before))
  expect(screen.queryByText(/未接入设置变更通知/)).toBeNull()
  view.unmount(); expect(dispose).toHaveBeenCalled()
})
test('shows unloaded providers and notification degradation; unavailable settings disable writes', async () => {
  const unavailable = { ...catalog(), writable: false, settingsReason: 'settings unavailable', actions: [{ ...catalog().actions[0]!, registered: false, enabled: false }] }
  render(<Manager call={async () => ({ success: true, data: unavailable })} compact />)
  await screen.findByText('提供者未加载')
  expect(screen.getByText(/未接入设置变更通知/)).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('settings unavailable')
  expect((screen.getByLabelText('启用平台菜单') as HTMLInputElement).disabled).toBe(true)
})
test('empty registration catalog renders a useful explanation rather than crashing', async () => {
  render(<Manager call={async () => ({ success: true, data: { ...catalog(), actions: [] } })} />)
  await screen.findByText(/还没有动作注册/)
})

test('renders the MD3E face with platform controls and visible conflict readback', async () => {
  const call = vi.fn<ShellectCall>(async input => input.action === 'catalog'
    ? { success: true, data: catalog(input.platform as 'darwin' | 'win32' | 'linux') }
    : { success: true, data: { status: 'conflict', catalog: { ...catalog('win32'), revision: 4 }, actualRevision: 4 } })
  render(<Manager call={call} uiFace="md3e" />)
  await screen.findByTestId('shellect-md3e')
  expect(screen.getByTestId('shellect-md3e').getAttribute('data-ui-variant')).toBe('md3e')
  fireEvent.click(screen.getByRole('button', { name: 'Windows' }))
  await waitFor(() => expect(call).toHaveBeenCalledWith({ action: 'catalog', platform: 'win32' }))
  const title = await screen.findByLabelText('MD3E 动作名称 · dissolvef.direct')
  fireEvent.change(title, { target: { value: 'Windows action' } })
  fireEvent.click(screen.getByRole('button', { name: '保存名称' }))
  await screen.findByText(/原版本 3，当前版本 4/)
  expect(screen.getByText(/设置发生冲突/)).toBeTruthy()
})

test('keeps MD3E degradation readable when the catalog is unavailable or empty', async () => {
  const unavailable = { ...catalog(), writable: false, settingsReason: 'settings unavailable', actions: [] }
  render(<Manager call={async () => ({ success: true, data: unavailable })} uiFace="md3e" compact />)
  await screen.findByTestId('shellect-md3e')
  expect(screen.getByRole('alert').textContent).toBe('settings unavailable')
  expect(screen.getByText(/还没有动作注册/)).toBeTruthy()
  expect(screen.getByTestId('shellect-md3e').getAttribute('data-shellect-scroll')).toBe('internal')
})
