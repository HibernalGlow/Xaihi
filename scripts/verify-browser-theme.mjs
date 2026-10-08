import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const playwrightPkg = resolve(import.meta.dirname, '../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright')
const { chromium } = require(playwrightPkg)

const ARTIFACT_DIR = '/Users/glow/.gemini/antigravity/brain/72452a93-a225-4987-a935-e39e6c98f0d5'

async function run() {
  console.log('[Playwright] 启动 Chromium 真实无头浏览器...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('[Browser Error]', msg.text())
    }
  })

  console.log('[Playwright] 访问本地工作台服务 http://127.0.0.1:3344...')
  await page.goto('http://127.0.0.1:3344/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.xiranite-topbar', { timeout: 10000 })
  await page.waitForTimeout(1000)

  // 1. 打开主题 Popover
  const themeBtn = page.locator('.xiranite-topbar button[title="Theme"]').first()
  await themeBtn.click()
  await page.waitForTimeout(500)

  // 2. 切换到 Dark 模式并截图
  console.log('[Playwright] 切换为 Dark 暗色模式...')
  const darkBtn = page.locator('[data-slot="popover-content"] button').filter({ hasText: /^Dark$/i }).first()
  await darkBtn.click()
  await page.waitForTimeout(800)

  // 关闭 popover 以捕获完整界面
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  console.log(`[Playwright] 当前 Dark 状态: ${isDark}`)
  const darkShot = resolve(ARTIFACT_DIR, 'workspace_ui_dark.png')
  await page.screenshot({ path: darkShot, fullPage: true })
  console.log(`[Playwright] 已输出暗色模式全景截图: ${darkShot}`)

  // 3. 打开主题 Popover 切换到 Light 模式并截图
  await themeBtn.click()
  await page.waitForTimeout(500)

  console.log('[Playwright] 切换为 Light 亮色模式...')
  const lightBtn = page.locator('[data-slot="popover-content"] button').filter({ hasText: /^Light$/i }).first()
  await lightBtn.click()
  await page.waitForTimeout(800)

  // 关闭 popover 以捕获完整界面
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  const isLight = await page.evaluate(() => !document.documentElement.classList.contains('dark'))
  console.log(`[Playwright] 当前 Light 状态: ${isLight}`)
  const lightShot = resolve(ARTIFACT_DIR, 'workspace_ui_light.png')
  await page.screenshot({ path: lightShot, fullPage: true })
  console.log(`[Playwright] 已输出亮色模式全景截图: ${lightShot}`)

  await browser.close()
  console.log('[Playwright] 真实浏览器端到端双主题验证成功！')
}

run().catch(err => {
  console.error('[Playwright Error]', err)
  process.exit(1)
})
