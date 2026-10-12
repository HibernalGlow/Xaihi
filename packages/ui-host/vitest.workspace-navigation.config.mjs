import { defineConfig } from 'vitest/config'
import base from './vitest.config.ts'

// Run only the navigation/settings contract being changed in this lane.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: [
      'src/store/persistedUiPreferences.test.ts',
      'tests/trellis-layout-hook.spec.tsx',
      'tests/trellis-document.spec.ts',
      'tests/app-config-sections.spec.ts',
      'src/components/workspace/WorkspaceUrlState.test.tsx',
      'src/actions/registry.test.ts',
      'tests/settings-picker-routing.spec.tsx',
    ],
  },
})
