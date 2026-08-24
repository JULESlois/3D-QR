import { isPaletteKey, type PaletteKey } from './palettes'
import { isStyleId, type StyleId } from './styles'

export interface ShareState {
  payload: string
  style: StyleId
  palette: PaletteKey
}

const PAYLOAD_KEY = 'q'
const STYLE_KEY = 's'
const PALETTE_KEY = 'p'

export function encodeShareHash(state: ShareState): string {
  const params = new URLSearchParams()
  params.set(PAYLOAD_KEY, state.payload)
  params.set(STYLE_KEY, state.style)
  params.set(PALETTE_KEY, state.palette)
  return `#${params.toString()}`
}

export function decodeShareHash(hash: string): Partial<ShareState> {
  const source = hash.startsWith('#') ? hash.slice(1) : hash
  if (!source) return {}

  const params = new URLSearchParams(source)
  const payload = params.get(PAYLOAD_KEY)
  const style = params.get(STYLE_KEY)
  const palette = params.get(PALETTE_KEY)
  const state: Partial<ShareState> = {}

  if (payload?.trim()) state.payload = payload
  if (style && isStyleId(style)) state.style = style
  if (palette && isPaletteKey(palette)) state.palette = palette
  return state
}

function currentState(): ShareState | null {
  const input = document.querySelector<HTMLInputElement>('#qr-input')
  const style = document.body.dataset.style
  const activePalette = document.querySelector<HTMLButtonElement>('[data-palette].is-active')?.dataset.palette

  if (!input || !style || !isStyleId(style) || !activePalette || !isPaletteKey(activePalette)) return null
  const payload = input.value.trim()
  if (!payload) return null
  return { payload, style, palette: activePalette }
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
    if (!target.closest('[data-style], [data-palette]')) return
    queueMicrotask(replaceShareHash)
  })

  // Shared URLs are live application state, not just an initial-load bootstrap. Restoring
  // on hash navigation makes pasted hashes and browser back/forward navigation update the
  // sculpture in-place without requiring a reload. replaceState() above does not emit this
  // event, so normal edits do not feed back into restoreShareState().
  window.addEventListener('hashchange', restoreShareState)
}
