import { isPaletteKey, type PaletteKey } from './palettes'
import { isStyleId, type StyleId } from './styles'

export type ProjectionView = 'art' | 'qr'

export interface ShareState {
  payload: string
  style: StyleId
  palette: PaletteKey
  view: ProjectionView
}

const PAYLOAD_KEY = 'q'
const STYLE_KEY = 's'
const PALETTE_KEY = 'p'
const VIEW_KEY = 'v'
const SHARE_BUTTON_LABEL = 'COPY LINK'
const SHARE_BUTTON_TITLE = 'Copy a link to this QR sculpture state'

function isProjectionView(value: string): value is ProjectionView {
  return value === 'art' || value === 'qr'
}

export function encodeShareHash(state: ShareState): string {
  const params = new URLSearchParams()
  params.set(PAYLOAD_KEY, state.payload)
  params.set(STYLE_KEY, state.style)
  params.set(PALETTE_KEY, state.palette)
  params.set(VIEW_KEY, state.view)
  return `#${params.toString()}`
}

export function decodeShareHash(hash: string): Partial<ShareState> {
  const source = hash.startsWith('#') ? hash.slice(1) : hash
  if (!source) return {}

  const params = new URLSearchParams(source)
  const payload = params.get(PAYLOAD_KEY)
  const style = params.get(STYLE_KEY)
  const palette = params.get(PALETTE_KEY)
  const view = params.get(VIEW_KEY)
  const state: Partial<ShareState> = {}

  if (payload?.trim()) state.payload = payload
  if (style && isStyleId(style)) state.style = style
  if (palette && isPaletteKey(palette)) state.palette = palette
  if (view && isProjectionView(view)) state.view = view
  return state
}

function currentState(): ShareState | null {
  const input = document.querySelector<HTMLInputElement>('#qr-input')
  const style = document.body.dataset.style
  const activePalette = document.querySelector<HTMLButtonElement>('[data-palette].is-active')?.dataset.palette
  const view = document.body.dataset.mode

  if (
    !input
    || !style
    || !isStyleId(style)
    || !activePalette
    || !isPaletteKey(activePalette)
    || !view
    || !isProjectionView(view)
  ) return null

  const payload = input.value.trim()
  if (!payload) return null
  return { payload, style, palette: activePalette, view }
}

function replaceShareHash(): void {
  const state = currentState()
  if (!state) return
  const hash = encodeShareHash(state)
  if (window.location.hash === hash) return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
}

function clickStyle(style: StyleId): void {
  document.querySelector<HTMLButtonElement>(`[data-style="${style}"]`)?.click()
}

function clickPalette(palette: PaletteKey): void {
  document.querySelector<HTMLButtonElement>(`[data-palette="${palette}"]`)?.click()
}

function restoreView(view: ProjectionView): void {
  if (document.body.dataset.mode === view) return
  document.querySelector<HTMLCanvasElement>('#stage canvas')?.dispatchEvent(new MouseEvent('click', {
    bubbles: true,
    clientX: 1,
    clientY: 1,
  }))
}

function restoreShareState(): void {
  const state = decodeShareHash(window.location.hash)
  const input = document.querySelector<HTMLInputElement>('#qr-input')

  if (state.payload && input && input.value !== state.payload) {
    input.value = state.payload
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

  if (state.style && document.body.dataset.style !== state.style) {
    clickStyle(state.style)
  }

  if (state.palette) {
    // Scene changes reset to that scene's default palette. Apply the shared palette
    // after the scene click has synchronously updated main.ts state and UI.
    queueMicrotask(() => clickPalette(state.palette!))
  }

  if (state.view) {
    // View mode is independent of scene/palette state, so restore it after the synchronous
    // scene update. The renderer owns the actual sculpture rotation and body[data-mode].
    queueMicrotask(() => restoreView(state.view!))
  }
}

function fallbackCopyText(value: string): boolean {
  const input = document.createElement('textarea')
  input.value = value
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  input.style.pointerEvents = 'none'
  document.body.appendChild(input)
  input.select()
  input.setSelectionRange(0, value.length)

  try {
    return document.execCommand('copy')
  } finally {
    input.remove()
  }
}

async function copyShareLink(button: HTMLButtonElement): Promise<void> {
  replaceShareHash()
  const url = window.location.href
  let copied = false

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      copied = true
    }
  } catch {
    copied = false
  }

  if (!copied) copied = fallbackCopyText(url)

  button.textContent = copied ? 'COPIED ✓' : 'COPY FAILED'
  button.title = copied ? 'Share link copied' : 'Could not copy share link'
  document.dispatchEvent(new CustomEvent('share-link-copy', {
    detail: { url, copied },
  }))

  window.setTimeout(() => {
    button.textContent = SHARE_BUTTON_LABEL
    button.title = SHARE_BUTTON_TITLE
  }, 1800)
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  restoreShareState()

  let inputTimer = 0
  document.querySelector<HTMLInputElement>('#qr-input')?.addEventListener('input', () => {
    window.clearTimeout(inputTimer)
    inputTimer = window.setTimeout(replaceShareHash, 240)
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('[data-style], [data-palette], #stage canvas')) return
    queueMicrotask(replaceShareHash)
  })

  document.querySelector<HTMLButtonElement>('#copy-share-link')?.addEventListener('click', (event) => {
    void copyShareLink(event.currentTarget as HTMLButtonElement)
  })

  // Shared URLs are live application state, not just an initial-load bootstrap. Restoring
  // on hash navigation makes pasted hashes and browser back/forward navigation update the
  // sculpture in-place without requiring a reload. replaceState() above does not emit this
  // event, so normal edits do not feed back into restoreShareState().
  window.addEventListener('hashchange', restoreShareState)
}
