# @hibernalglow/xaihi-ui-kit

Reusable Material 3 Expressive primitives for Xaihi nodes and independent React projects.

The package owns component geometry and state behavior. It does not own a palette. For a complete independent theme, provide the semantic slots listed below or map them to your design tokens. The `./styles.css` export is static and can be imported by an app bundler or linked from a document.

Inside the Xaihi host, MD3E colors are resolved in this order: `--xaihi-md3e-*`, host-scoped `--md3e-*`, Material system roles such as `--md-sys-color-primary`, the package's `--xaihi-*` aliases, and measured `--dsw-alias-*` roles. The kit does not fall back to generic `--primary`, `--card`, or `--background` variables, so a legacy design language cannot leak a second palette into an MD3E node. The expressive surface ladder includes `surface-lowest`, `surface-low`, `surface`, and `surface-high`; these are separate contract slots so independent consumers can control dense input surfaces and raised panels distinctly.

For an independent React project, use `XMd3eTheme` as the token boundary. It injects the stylesheet once while mounted and accepts caller-owned CSS custom properties. `XAIHI_UI_KIT_THEME_TOKENS` exports the complete 22-slot contract:

```tsx
import '@hibernalglow/xaihi-ui-kit/styles.css'
import { XAIHI_UI_KIT_THEME_TOKENS, XMd3eTheme, XMd3eActionButton } from '@hibernalglow/xaihi-ui-kit'

const themeTokens = {
  '--xaihi-surface': 'oklch(0.98 0.01 300)',
  '--xaihi-on-surface': 'oklch(0.18 0.02 300)',
  '--xaihi-on-surface-variant': 'oklch(0.38 0.03 300)',
  '--xaihi-outline': 'oklch(0.65 0.02 300)',
  '--xaihi-primary': 'oklch(0.48 0.2 300)',
  '--xaihi-on-primary': 'white',
  '--xaihi-secondary-container': 'oklch(0.9 0.06 300)',
  '--xaihi-on-secondary-container': 'oklch(0.2 0.04 300)',
  '--xaihi-error': 'oklch(0.52 0.2 25)',
  '--xaihi-md3e-surface': 'oklch(0.98 0.01 300)',
  '--xaihi-md3e-surface-lowest': 'oklch(0.99 0.005 300)',
  '--xaihi-md3e-surface-low': 'oklch(0.95 0.02 300)',
  '--xaihi-md3e-surface-high': 'oklch(0.91 0.03 300)',
  '--xaihi-md3e-primary': 'oklch(0.48 0.2 300)',
  '--xaihi-md3e-on-primary': 'white',
  '--xaihi-md3e-primary-container': 'oklch(0.86 0.1 300)',
  '--xaihi-md3e-on-primary-container': 'oklch(0.18 0.05 300)',
  '--xaihi-md3e-secondary-container': 'oklch(0.9 0.06 340)',
  '--xaihi-md3e-on-secondary-container': 'oklch(0.2 0.04 340)',
  '--xaihi-md3e-tertiary-container': 'oklch(0.88 0.08 190)',
  '--xaihi-md3e-on-tertiary-container': 'oklch(0.2 0.04 190)',
  '--xaihi-md3e-error': 'oklch(0.52 0.2 25)',
} satisfies Partial<Record<(typeof XAIHI_UI_KIT_THEME_TOKENS)[number], string>>

export function Panel() {
  return <XMd3eTheme tokens={themeTokens}><XMd3eActionButton>Run</XMd3eActionButton></XMd3eTheme>
}
```

Create a second object with the same slots for dark mode, then select it using the independent app's existing color-mode state. Keep foreground and container roles paired (`on-primary` with `primary`, for example) and verify contrast in both modes. The package has neutral fallbacks when slots are omitted; setting all 22 prevents the theme from mixing with generic or host-specific fallback colors.

| Token group | Purpose |
| --- | --- |
| `--xaihi-surface`, `--xaihi-on-surface` | Base panel and foreground |
| `--xaihi-on-surface-variant`, `--xaihi-outline` | Secondary text, hints, and outlines |
| `--xaihi-primary`, `--xaihi-on-primary` | Primary actions and selected controls |
| `--xaihi-secondary-container`, `--xaihi-on-secondary-container` | Tonal actions and chips |
| `--xaihi-error` | Error text and state |
| `--xaihi-md3e-surface-lowest`, `--xaihi-md3e-surface-low`, `--xaihi-md3e-surface`, `--xaihi-md3e-surface-high` | Expressive surface depth |
| `--xaihi-md3e-primary`, `--xaihi-md3e-on-primary` | Expressive primary action |
| `--xaihi-md3e-primary-container`, `--xaihi-md3e-on-primary-container` | Primary zones and selected states |
| `--xaihi-md3e-secondary-container`, `--xaihi-md3e-on-secondary-container` | Secondary zones, chips, and switches |
| `--xaihi-md3e-tertiary-container`, `--xaihi-md3e-on-tertiary-container` | Tertiary zones and accents |
| `--xaihi-md3e-error` | Expressive error state |

Mounting several remotes shares one `style#xaihi-ui-kit`; the stylesheet is removed only after the last mounted consumer releases it.

The expressive surface primitives share the same shape contract. Use `phase="idle" | "pressed" | "expanded"` on shape surfaces, chips, and action controls; `XMd3eIconButton` and `XMd3eFab` are convenience entries for common actions. `XMd3eLiquidGlass`, `XMd3eLensBar`, `XMd3eNavigationDock`, and `XMd3ePopup` are host-neutral chrome primitives.

```tsx
import '@hibernalglow/xaihi-ui-kit/styles.css'
import {
  XMd3eActionButton,
  XMd3eConnectedGroup,
  XMd3eProgress,
  XMd3eShapeButton,
  XMd3eSlider,
  XMd3eSwitch,
} from '@hibernalglow/xaihi-ui-kit'

export function Example() {
  return (
    <XMd3eConnectedGroup>
      <XMd3eShapeButton shape="cookie-8" aria-label="More" />
      <XMd3eActionButton size="xl">Run</XMd3eActionButton>
      <XMd3eSlider label="Opacity" value={72} onValueChange={() => {}} thickness={24} ticks={[0, 25, 50, 75, 100]} wavy />
      <XMd3eSwitch label="Enabled" checked onCheckedChange={() => {}} value="72%" />
      <XMd3eProgress value={72} wavy />
    </XMd3eConnectedGroup>
  )
}
```

Subpaths are available for smaller consumers: `./components`, `./md3e`, `./shapes`, `./tokens`, and `./styles.css`.

`XMd3eTabs` follows the horizontal tab keyboard contract: only the selected tab (or first enabled tab when the value is not present) is in the page Tab order. Left/Right wrap across enabled tabs; Home/End move to the first/last enabled tab and activate it. Each item accepts `disabled?: boolean`. Keep the selected panel wired to the same controlled `value` so keyboard and pointer activation stay in sync.

Use `XMd3eSegmentedTrack` for a mutually exclusive choice such as platform, density, or filter mode; it renders a labeled horizontal `radiogroup`, with one radio in the Tab order and Left/Right plus Home/End selection. Options accept `disabled?: boolean`. Use `XMd3eMultiChoiceChips` when more than one choice may stay selected; it preserves independent pressed buttons instead of implying radio selection.
