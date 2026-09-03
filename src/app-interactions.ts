import { isPaletteKey, type PaletteKey } from './palettes'
import {
  PROJECTION_VIEW_REQUEST_EVENT,
  isProjectionView,
  type ProjectionView,
  type ProjectionViewRequestDetail,
} from './projection-view'
import { isStyleId, type StyleId } from './styles'

export interface AppInteractionContext {
  readonly pointerSurface: HTMLElement
  readonly input: HTMLInputElement
  readonly meta: HTMLElement
  readonly styleRow: HTMLElement
  readonly paletteButtons: readonly HTMLButtonElement[]
  isBusy(): boolean
  getView(): ProjectionView
  setView(view: ProjectionView): void
  requestStyle(styleId: StyleId): void
  requestPalette(paletteKey: PaletteKey): void
  rebuild(value: string): void
}

/**
 * Bind user-facing application commands without owning render or sculpture state.
 * Returning a disposer keeps the bindings explicit and makes teardown deterministic.
 */
export function bindAppInteractions(context: AppInteractionContext): () => void {
  const abortController = new AbortController()
  const { signal } = abortController
  let rebuildTimer = 0

  context.pointerSurface.addEventListener('click', () => {
    if (context.isBusy()) return
    context.setView(context.getView() === 'art' ? 'qr' : 'art')
  }, { signal })

  document.addEventListener(PROJECTION_VIEW_REQUEST_EVENT, (event) => {
    const request = event as CustomEvent<ProjectionViewRequestDetail>
    if (!request.detail || !isProjectionView(request.detail.view)) return
    context.setView(request.detail.view)
  }, { signal })

  context.styleRow.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const button = target.closest<HTMLButtonElement>('[data-style]')
    if (!button || button.disabled || !context.styleRow.contains(button)) return
    const requested = button.dataset.style
    if (!requested || !isStyleId(requested)) return
    context.requestStyle(requested)
  }, { signal })

  for (const button of context.paletteButtons) {
    button.addEventListener('click', () => {
      const requested = button.dataset.palette
      if (!requested || !isPaletteKey(requested)) return
      context.requestPalette(requested)
    }, { signal })
  }

  context.input.addEventListener('input', () => {
    if (context.isBusy()) return
    window.clearTimeout(rebuildTimer)
    context.meta.textContent = 'REBUILDING VOXEL FIELD…'
    rebuildTimer = window.setTimeout(() => context.rebuild(context.input.value), 180)
  }, { signal })

  return () => {
    abortController.abort()
    window.clearTimeout(rebuildTimer)
  }
}
