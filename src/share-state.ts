import { isPaletteKey, type PaletteKey } from './palettes'
import {
  isProjectionView,
  requestProjectionView,
  type ProjectionView,
} from './projection-view'
import { isStyleId, type StyleId } from './styles'

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
const EXPORT_BUSY_CHANGE_EVENT = 'export-busy-change'

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

function clearShareHashForEmptyPayload(): void {
  const input = document.querySelector<HTMLInputElement>('#qr-input')
  if (!input || input.value.trim() || !window.location.hash) return
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

function replaceShareHash(): boolean {
  if (document.body.dataset.exportBusy === 'true') return false

  const state = currentState()
  if (!state) {
    clearShareHashForEmptyPayload()
    return false
  }

  const hash = encodeShareHash(state)
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
  }
  return true
}

function clickStyle(style: StyleId): void {
  document.querySelector<HTMLButtonElement>(`[data-style="${style}"]`)?.click()
}

function clickPalette(palette: PaletteKey): void {
  document.querySelector<HTMLButtonElement>(`[data-palette="${palette}"]`)?.click()
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

/**
 * Bind URL/hash sharing as an explicit application lifecycle instead of module-import side effects.
 * The disposer aborts DOM listeners and clears pending timers so tests or future remounts cannot
 * leave duplicate hash synchronization behind.
 */
export function bindShareState(): () => void {
  const abortController = new AbortController()
  const { signal } = abortController
  let pendingShareRestore = false
  let inputTimer = 0
  const buttonRestoreTimers = new Set<number>()

  function restoreShareState(): void {
    if (document.body.dataset.exportBusy === 'true') {
      pendingShareRestore = true
      return
    }
    pendingShareRestore = false

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
      queueMicrotask(() => {
        if (!signal.aborted) clickPalette(state.palette!)
      })
    }

    if (state.view) {
      queueMicrotask(() => {
        if (!signal.aborted) requestProjectionView(state.view!)
      })
    }
  }

  function restoreShareButton(button: HTMLButtonElement): void {
    const timer = window.setTimeout(() => {
      buttonRestoreTimers.delete(timer)
      if (signal.aborted) return
      button.textContent = SHARE_BUTTON_LABEL
      button.title = SHARE_BUTTON_TITLE
    }, 1800)
    buttonRestoreTimers.add(timer)
  }

  async function copyShareLink(button: HTMLButtonElement): Promise<void> {
    if (!replaceShareHash()) {
      button.textContent = 'ADD CONTENT'
      button.title = 'Enter URL or text before copying a share link'
      document.dispatchEvent(new CustomEvent('share-link-copy', {
        detail: { url: null, copied: false, reason: 'empty-payload' },
      }))
      restoreShareButton(button)
      return
    }

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

    if (signal.aborted) return
    if (!copied) copied = fallbackCopyText(url)

    button.textContent = copied ? 'COPIED ✓' : 'COPY FAILED'
    button.title = copied ? 'Share link copied' : 'Could not copy share link'
    document.dispatchEvent(new CustomEvent('share-link-copy', {
      detail: { url, copied },
    }))

    restoreShareButton(button)
  }

  restoreShareState()

  document.querySelector<HTMLInputElement>('#qr-input')?.addEventListener('input', () => {
    window.clearTimeout(inputTimer)
    inputTimer = window.setTimeout(() => {
      if (!signal.aborted) replaceShareHash()
    }, 240)
  }, { signal })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (!target.closest('[data-style], [data-palette], #stage canvas')) return
    queueMicrotask(() => {
      if (!signal.aborted) replaceShareHash()
    })
  }, { signal })

  document.querySelector<HTMLButtonElement>('#copy-share-link')?.addEventListener('click', (event) => {
    void copyShareLink(event.currentTarget as HTMLButtonElement)
  }, { signal })

  window.addEventListener('hashchange', restoreShareState, { signal })

  document.addEventListener(EXPORT_BUSY_CHANGE_EVENT, (event) => {
    const change = event as CustomEvent<{ busy?: boolean }>
    if (change.detail?.busy === false && pendingShareRestore) restoreShareState()
  }, { signal })

  return () => {
    abortController.abort()
    window.clearTimeout(inputTimer)
    for (const timer of buttonRestoreTimers) window.clearTimeout(timer)
    buttonRestoreTimers.clear()
  }
}
