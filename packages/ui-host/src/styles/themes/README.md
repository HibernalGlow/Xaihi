# Theme Packs

Concrete theme CSS lives here. `src/index.css` is reserved for Tailwind token
registration, base styles, and shared integration bridges.

## What is left after 2026-10-05

The 16 built-in colour presets were deleted with the user's ruling that they were
only ever imitating what the advanced-theme axis now does properly. This directory
holds one palette (`wuling.css`) plus the two non-palette files:

- `design-axes.css` — the non-colour axis defaults (node-card geometry), consumed by
  the advanced-theme recipes, not by a preset.
- `custom-theme.css` — bridges that only apply when a user-imported theme is active
  (`[data-custom-theme="enabled"]`). Imported themes are data in
  `xiranite.config.toml` / localStorage, **not** files here; adding colours for a user
  must never mean adding a CSS file.

A name is *not* a colour contract on the strength of this directory alone: since the
corpus is one palette, `packages/ui/src/tokens.test.ts` also checks both token blocks
(light and dark) of that palette, and `src/lib/appearance.test.ts` pins the preset
table against the files on disk so a half-deletion cannot recur.

## Add A Theme

1. Create `src/styles/themes/<theme>.css`.
2. Add it to `src/styles/themes/index.css`.
3. Add the root class to `THEME_ROOT_CLASSES` in `src/lib/appearance.ts` — components
   must call `presetThemeRootClass(theme)`, never build `theme-<name>` themselves.
4. Add store-applicable defaults to `THEME_DESIGN_RECIPES`.
5. Add imitation/design metadata to `THEME_STYLE_PROFILES`.
6. Add labels and swatches in theme selection UI and i18n.
7. Scope node interior rules under `.xiranite-node-surface`.

Steps 3–6 are five hand-written enumerations of the same list (`AppTheme`, the three
tables above, and `THEME_PRESET_OPTIONS`), and `appearance.test.ts` is what notices a
missing one. Prefer making the advanced-theme axis carry the look instead of adding a
preset.

## CSS Scope

Use `.theme-<name>` for all concrete token values. A theme may also define
`:root` only when it is the default fallback loaded before React applies the
workspace theme class.

Dark overrides should be scoped to the theme root, for example:

```css
.theme-wuling.dark,
.dark .theme-wuling {
  --background: oklch(...);
}
```

Shared dark tokens such as generic badge colors can use `:root.dark`, but
theme-specific surfaces should not. This prevents one theme from overriding
another through selector specificity.

## Website Reference Mapping

When imitating a reference site, translate it into these axes before writing CSS:

- palette and contrast model
- typography and line-height model
- density and spacing rhythm
- border/radius treatment
- surface and depth model
- motion style
- node interior treatment
- shell/chrome layout expectations

If the reference needs structural changes beyond CSS, add component/layout
variants separately instead of forcing the whole design into tokens.
