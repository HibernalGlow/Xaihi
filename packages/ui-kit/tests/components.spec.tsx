/**
 * 组件形状测试：渲染成字符串，钉"可选槽不存在时不留空节点"。
 *
 * @module xaihi-ui-kit/tests/components
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { XButton, XField, XPanel, XMd3eHeroBanner, XMd3eSegmentedTrack, XMd3eSliderCard, XMd3eTheme } from '../src/components.tsx'
import { XMd3eActionButton, XMd3eBadge, XMd3eBreadcrumb, XMd3eChip, XMd3eCollapsibleCard, XMd3eCoverBadge, XMd3eExtendedFab, XMd3eField, XMd3eGestureBoard, XMd3eIconButton, XMd3eLensBar, XMd3eLiquidGlass, XMd3eList, XMd3eListItem, XMd3eMultiChoiceChips, XMd3eNavigationDock, XMd3eNodeFrame, XMd3ePopup, XMd3eProgressRing, XMd3eRayMenu, XMd3eSearchBar, XMd3eShapeButton, XMd3eShapeSurface, XMd3eSheet, XMd3eSlider, XMd3eSwitch, XMd3eTabs } from '../src/md3e.tsx'
import { XMD3E_SHAPES, getXMd3eShape, getXMd3eShapePhase } from '../src/shapes.ts'
import { getXMd3eShapeStyle } from '../src/md3e.tsx'
import { KIT_CSS } from '../src/tokens.ts'

describe('面板组件', () => {
  it('按钮带变体属性，禁用就是真禁用', () => {
    const html = renderToStaticMarkup(
      <div>{XButton({ variant: 'tonal', children: 'go' })}{XButton({ variant: 'text', disabled: true, children: 'no' })}</div>,
    )
    expect(html).toContain('class="xaihi-btn" data-variant="tonal"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('data-variant="text"')
  })

  it('字段没有 hint 时不渲染说明节点', () => {
    const withHint = renderToStaticMarkup(XField({ label: '目录', hint: '逗号分隔', children: React.createElement('input', { className: 'xaihi-field-input' }) }))
    const without = renderToStaticMarkup(XField({ label: '目录', children: React.createElement('input', { className: 'xaihi-field-input' }) }))
    expect(withHint).toContain('xaihi-status')
    expect(without).not.toContain('xaihi-status')
  })

  it('状态行的语气只走 data-tone，不写颜色', () => {
    const html = renderToStaticMarkup(XPanel({ title: 'T', status: '失败了', statusTone: 'error', children: React.createElement('span', null, 'body') }))
    expect(html).toContain('class="xaihi-card"')
    expect(html).toContain('data-tone="error"')
    expect(html).not.toMatch(/#[0-9a-f]{6}/)
    expect(html).not.toContain('color:')
  })

  it('MD3E primitives expose expressive structure without owning a palette', () => {
    const html = renderToStaticMarkup(
      <XMd3eHeroBanner title="Findz" description="Archive surface" tone="tertiary" />,
    )
    expect(html).toContain('xaihi-md3e-hero')
    expect(html).toContain('data-tone="tertiary"')
    expect(html).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('segmented and slider primitives preserve accessible native controls', () => {
    const html = renderToStaticMarkup(
      <div>
        <XMd3eSegmentedTrack options={[{ value: 'a', label: 'A' }]} value="a" onChange={() => {}} />
        <XMd3eSliderCard label="Opacity" value={42} thickness={40} wavy ticks={[0, 50, 100]} onChange={() => {}} />
      </div>,
    )
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('type="range"')
    expect(html).toContain('aria-label="Opacity"')
    expect(html).toContain('data-thickness="40"')
    expect(html).toContain('data-wavy="true"')
  })

  it('node frame exposes the container and scroll contract', () => {
    const html = renderToStaticMarkup(<XMd3eNodeFrame scroll="internal"><span>body</span></XMd3eNodeFrame>)
    expect(html).toContain('data-xaihi-node-frame="md3e"')
    expect(html).toContain('data-scroll="internal"')
    expect(html).toContain('xaihi-md3e-node-frame')
  })

  it('switch exposes checked state and a check mark target', () => {
    const html = renderToStaticMarkup(<XMd3eSwitch checked label="Enabled" value="On" />)
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('data-state="checked"')
    expect(html).toContain('xaihi-md3e-switch-check')
  })

  it('shape button carries a pressed morph phase for keyboard and pointer states', () => {
    const html = renderToStaticMarkup(<XMd3eShapeButton shape="cookie-8" pressed aria-label="Run" />)
    expect(html).toContain('data-shape="cookie-8"')
    expect(html).toContain('data-pressed="true"')
    expect(html).toContain('--xaihi-shape-pressed-clip')
  })

  it('standalone theme boundary accepts caller tokens without embedding a palette', () => {
    const html = renderToStaticMarkup(
      <XMd3eTheme tokens={{ '--xaihi-md3e-primary': 'oklch(0.7 0.2 300)' }}>
        <XMd3eHeroBanner title="Standalone" />
      </XMd3eTheme>,
    )
    expect(html).toContain('data-xaihi-md3e-theme="true"')
    expect(html).toContain('--xaihi-md3e-primary:oklch(0.7 0.2 300)')
    expect(html).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('exposes the three readable shape phases and five action sizes', () => {
    const html = renderToStaticMarkup(
      <div>
        <XMd3eShapeSurface shape="gem" phase="expanded">Surface</XMd3eShapeSurface>
        <XMd3eActionButton size="xs" phase="pressed">Run</XMd3eActionButton>
        <XMd3eIconButton shape="circle" aria-label="Close" icon="x" />
        <XMd3eChip shape="cookie-8" phase="expanded">42</XMd3eChip>
      </div>,
    )
    expect(html).toContain('data-phase="expanded"')
    expect(html).toContain('data-size="xs"')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('data-shape="cookie-8"')
  })

  it('exposes standalone expressive chrome primitives', () => {
    const html = renderToStaticMarkup(
      <div>
        <XMd3eLiquidGlass intensity="strong"><span>Glass</span></XMd3eLiquidGlass>
        <XMd3eLensBar leading="L">Search</XMd3eLensBar>
        <XMd3eNavigationDock items={[{ id: 'home', label: 'Home' }]} value="home" />
        <XMd3ePopup placement="end">Menu</XMd3ePopup>
      </div>,
    )
    expect(html).toContain('xaihi-md3e-liquid-glass')
    expect(html).toContain('xaihi-md3e-lens-bar')
    expect(html).toContain('xaihi-md3e-navigation-dock')
    expect(html).toContain('role="dialog"')
  })

  it('keeps every catalog shape readable across all three phases', () => {
    expect(XMD3E_SHAPES).toHaveLength(36)
    for (const shape of XMD3E_SHAPES) {
      expect(shape.pressedClipPath ?? shape.pressedBorderRadius ?? shape.clipPath ?? shape.borderRadius).toBeDefined()
      expect(shape.expandedClipPath ?? shape.expandedBorderRadius ?? shape.clipPath ?? shape.borderRadius).toBeDefined()
    }
  })

  it('derives distinct polygon geometry for pressed and expanded phases', () => {
    const shape = getXMd3eShape('triangle')
    const idle = getXMd3eShapePhase(shape, 'idle')
    const pressed = getXMd3eShapePhase(shape, 'pressed')
    const expanded = getXMd3eShapePhase(shape, 'expanded')
    expect(pressed.clipPath).not.toBe(idle.clipPath)
    expect(expanded.clipPath).not.toBe(idle.clipPath)
    expect(expanded.clipPath).not.toBe(pressed.clipPath)
  })

  it('exports serializable shape tokens for independent consumers', () => {
    const style = getXMd3eShapeStyle('triangle', 'expanded')
    const vars = style as Record<string, unknown>
    expect(vars['--xaihi-shape-phase-clip']).toContain('polygon(')
    expect(vars['--xaihi-shape-expanded-clip']).toContain('polygon(')
  })

  it('covers fields, search, lists, badges, progress and navigation families', () => {
    const html = renderToStaticMarkup(
      <div>
        <XMd3eField label="Opacity" valueBadge="72 dp" hint="Saved" placeholder="Search" />
        <XMd3eSearchBar query="Rossi" onQueryChange={() => {}} aria-label="Search" />
        <XMd3eList><XMd3eListItem title="Library" description="12 items" selected trailing={<XMd3eBadge value={12} />} /></XMd3eList>
        <XMd3eProgressRing value={72} />
        <XMd3eTabs items={[{ id: 'a', label: 'A' }]} value="a" />
        <XMd3eBreadcrumb items={[{ id: 'a', label: 'A' }]} />
      </div>,
    )
    expect(html).toContain('xaihi-md3e-field')
    expect(html).toContain('role="search"')
    expect(html).toContain('xaihi-md3e-list-item')
    expect(html).toContain('xaihi-md3e-progress-ring')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Breadcrumb"')
  })

  it('covers the remaining expressive interaction families', () => {
    const html = renderToStaticMarkup(
      <div>
        <XMd3eExtendedFab label="Run" icon="+" />
        <XMd3eMultiChoiceChips options={[{ id: 'a', label: 'A' }]} values={['a']} />
        <XMd3eSheet open title="Options" description="Choose a mode" onClose={() => {}}><XMd3eCollapsibleCard title="Advanced" value="3">Body</XMd3eCollapsibleCard></XMd3eSheet>
        <XMd3eCoverBadge kind="unread" value={3} tone="tertiary" pulse />
        <XMd3eGestureBoard value={[0, 4]} />
        <XMd3eRayMenu open items={[{ id: 'a', label: 'A' }]} />
      </div>,
    )
    expect(html).toContain('xaihi-md3e-extended-fab')
    expect(html).toContain('xaihi-md3e-multi-choice-chips')
    expect(html).toContain('xaihi-md3e-sheet')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('xaihi-md3e-cover-badge')
    expect(html).toContain('data-tone="tertiary"')
    expect(html).toContain('data-pulse="true"')
    expect(html).toContain('xaihi-md3e-gesture-board')
    expect(html).toContain('<polyline')
    expect(html).toContain('xaihi-md3e-ray-menu')
    expect(html).toContain('aria-controls=')
    expect(html).toContain('xaihi-md3e-collapsible-card')
  })

  it('keeps the xl action dimension explicit and the narrow fallback available', () => {
    expect(KIT_CSS).toContain('[data-size="xl"] { min-height: 136px')
    expect(KIT_CSS).toContain('@container (max-width: 360px)')
  })

  it('renders a vertical slider with a vertical value track and correctly sized range input', () => {
    const html = renderToStaticMarkup(
      <XMd3eSlider orientation="vertical" label="Opacity" value={72} ticks={[0, 25, 50, 75, 100]} />,
    )

    expect(html).toContain('data-orientation="vertical"')
    expect(html).toContain('style="--xaihi-slider-progress:72%"')
    expect(KIT_CSS).toContain('[data-orientation="vertical"] .xaihi-md3e-slider-rail::after')
    expect(KIT_CSS).toContain('height: var(--xaihi-slider-progress, 0%)')
    expect(KIT_CSS).toContain('height: 40px; transform: rotate(-90deg)')
    expect(KIT_CSS).toContain('[data-orientation="vertical"] .xaihi-md3e-slider-ticks { height: 180px; flex-direction: column')
  })
})
