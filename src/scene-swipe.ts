const SWIPE_AXIS_LOCK = 12
const SWIPE_MIN_DISTANCE = 48
const SWIPE_VERTICAL_TOLERANCE = 44

function installSceneSwipe(): boolean {
  const dock = document.querySelector<HTMLElement>('.scene-dock')
  const current = dock?.querySelector<HTMLElement>('.scene-current')
  const previous = dock?.querySelector<HTMLButtonElement>('.scene-arrow-prev')
  const next = dock?.querySelector<HTMLButtonElement>('.scene-arrow-next')
  if (!dock || !current || !previous || !next) return false
  if (current.dataset.swipeReady === 'true') return true

  current.dataset.swipeReady = 'true'
  current.style.touchAction = 'pan-y'
  current.style.cursor = 'grab'
  current.setAttribute('aria-label', 'Current scene. Swipe left or right to change scene.')

  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let deltaX = 0
  let deltaY = 0
  let axis: 'horizontal' | 'vertical' | null = null

  const label = current.querySelector<HTMLElement>('.scene-current-label')

  function renderDrag(): void {
    if (!label) return
    const limited = Math.max(-42, Math.min(42, deltaX * 0.32))
    label.style.transform = `translateX(${limited}px)`
    label.style.opacity = String(Math.max(0.58, 1 - Math.abs(limited) / 100))
  }

  function resetDrag(): void {
    if (label) {
      label.style.transition = 'transform 160ms cubic-bezier(.22,.72,.22,1), opacity 160ms ease'
      label.style.transform = 'translateX(0)'
      label.style.opacity = '1'
      window.setTimeout(() => {
        if (!label) return
        label.style.removeProperty('transition')
        label.style.removeProperty('transform')
        label.style.removeProperty('opacity')
      }, 170)
    }
    current.style.cursor = 'grab'
    pointerId = null
    axis = null
    deltaX = 0
    deltaY = 0
  }

  current.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return
    if (previous.disabled || next.disabled) return

    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    deltaX = 0
    deltaY = 0
    axis = null
    current.style.cursor = 'grabbing'
    current.setPointerCapture(event.pointerId)
  })

  current.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return

    deltaX = event.clientX - startX
    deltaY = event.clientY - startY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)

    if (!axis && Math.max(absX, absY) >= SWIPE_AXIS_LOCK) {
      axis = absX > absY * 1.15 ? 'horizontal' : 'vertical'
    }

    if (axis === 'horizontal') {
      event.preventDefault()
      renderDrag()
    }
  }, { passive: false })

  current.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointerId) return

    const widthThreshold = Math.min(82, current.clientWidth * 0.22)
    const threshold = Math.max(SWIPE_MIN_DISTANCE, widthThreshold)
    const horizontalEnough = axis === 'horizontal'
      && Math.abs(deltaX) >= threshold
      && Math.abs(deltaY) <= SWIPE_VERTICAL_TOLERANCE
      && Math.abs(deltaX) > Math.abs(deltaY) * 1.2

    if (horizontalEnough) {
      if (deltaX < 0 && !next.disabled) next.click()
      if (deltaX > 0 && !previous.disabled) previous.click()
    }

    resetDrag()
  })

  current.addEventListener('pointercancel', resetDrag)
  current.addEventListener('lostpointercapture', () => {
    if (pointerId !== null) resetDrag()
  })

  return true
}

if (!installSceneSwipe()) {
  const observer = new MutationObserver(() => {
    if (!installSceneSwipe()) return
    observer.disconnect()
  })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
