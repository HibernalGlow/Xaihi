import { expect, it } from 'vitest'
import { developmentLauncher } from '../dsh/apps/desktop/scripts/development-app.ts'

const options = {
  electron: '/tmp/Electron.app/Contents/MacOS/Electron',
  appRoot: '/workspace/Xaihi',
  directory: '/tmp/xaihi-dev',
  home: '/tmp/xaihi-home',
  userData: '/tmp/xaihi-user-data',
  mainPort: 9229,
  rendererPort: 9222,
  hostPort: 9230,
  openDevtools: '0',
  primaryRuntimeDir: '/tmp/xaihi-runtime',
  profile: 'kisaki',
  appName: 'Kisaki',
  nativeEnvironment: 'XAIHI_KISAKI_NATIVE_PATH',
  nativePath: '/workspace/Xaihi/desktop/.products/kisaki/native/xaihi-kisaki.darwin-arm64.node',
}

it('把产品原生 binding 环境写入可由 Finder 冷启动的 launcher', () => {
  const launcher = developmentLauncher(options, '/tmp/xaihi-dev/Harness Dev.app')
  expect(launcher).toContain("export XAIHI_KISAKI_NATIVE_PATH='/workspace/Xaihi/desktop/.products/kisaki/native/xaihi-kisaki.darwin-arm64.node'")
  expect(launcher).toContain("export DSH_HOME='/tmp/xaihi-home'")
  expect(launcher).toContain("export XAIHI_DESKTOP_PRODUCT_TITLE='Kisaki'")
  expect(launcher).toContain("export XAIHI_DESKTOP_PROFILE='kisaki'")
})

it('拒绝未验证的原生环境变量名或缺失路径', () => {
  expect(() => developmentLauncher({ ...options, nativeEnvironment: 'bad-name' }, '/tmp/app')).toThrow('nativeEnvironment')
  expect(() => developmentLauncher({ ...options, nativePath: undefined }, '/tmp/app')).toThrow('nativePath')
})
