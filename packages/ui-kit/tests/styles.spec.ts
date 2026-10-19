import { afterEach, describe, expect, it, vi } from 'vitest'
import { STYLE_TAG_ID } from '../src/tokens.ts'

type FakeStyle = {
  id: string
  textContent: string
  dataset: Record<string, string>
  isConnected: boolean
  remove(): void
}

function installDocumentStub(): { tags: Map<string, FakeStyle> } {
  const tags = new Map<string, FakeStyle>()
  const fakeDocument = {
    getElementById: (id: string) => tags.get(id) ?? null,
    createElement: () => {
      const tag: FakeStyle = {
        id: '',
        textContent: '',
        dataset: {},
        isConnected: false,
        remove() {
          tags.delete(this.id)
          this.isConnected = false
        },
      }
      return tag
    },
    head: {
      append(tag: FakeStyle) {
        tags.set(tag.id, tag)
        tag.isConnected = true
      },
    },
  }
  vi.stubGlobal('document', fakeDocument)
  return { tags }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('shared stylesheet lifetime', () => {
  it('keeps styles installed until the last independently bundled consumer releases them', async () => {
    const { tags } = installDocumentStub()
    vi.resetModules()
    const firstBundle = await import('../src/components.tsx')
    const releaseFirst = firstBundle.registerKitStyles()

    vi.resetModules()
    const secondBundle = await import('../src/components.tsx')
    const releaseSecond = secondBundle.registerKitStyles()
    const tag = tags.get(STYLE_TAG_ID)

    expect(tag?.dataset.xaihiUiKitUsers).toBe('2')
    releaseFirst()
    expect(tag?.isConnected).toBe(true)
    expect(tag?.dataset.xaihiUiKitUsers).toBe('1')

    releaseFirst()
    expect(tag?.dataset.xaihiUiKitUsers).toBe('1')
    releaseSecond()
    expect(tag?.isConnected).toBe(false)
    expect(tags.has(STYLE_TAG_ID)).toBe(false)
  })
})
