const SWIPE_AXIS_LOCK = 12
const SWIPE_MIN_DISTANCE = 48
const SWIPE_VERTICAL_TOLERANCE = 44

function installSceneSwipe(): void {
  const dock = document.querySelector<HTMLElement>('.scene-dock')
  const current = dock?.querySelector<HTMLElement>('.scene-current')
  const previous = dock?.querySelector<HTMLButtonElement>('.scene-arrow-prev')
  const next = dock?.querySelector<HTMLButtonElement>('.scene-arrow-next')
  const currentLabel = current?.querySelector<HTMLElement>('.scene-current-label')

  if (!dock || !current || !previous || !next || !currentLabel) {
    throw new Error('Static scene stepper markup is incomplete; scene swipe could not bind.')
  }

  const sceneCurrent = current
  const previousButton = previous
  const nextButton = next
  const label = currentLabel

  sceneCurrent.style.touchAction = 'pan-y'
  sceneCurrent.style.cursor = 'grab'
  sceneCurrent.setAttribute(
    'aria-label',
    'Current scene. Swipe left or right, or use the left and right arrow keys, to change scene.',
  )

  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let deltaX = 0
  let deltaY = 0
  let axis: 'horizontal' | 'vertical' | null = null

  function renderDrag(): void {
    const limited = Math.max(-42, Math.min(42, deltaX * 0.32))
    label.style.transform = `translateX(${limited}px)`
    label.style.opacity = String(Math.max(0.58, 1 - Math.abs(limited) / 100))
  }

  function resetDrag(): void {
    label.style.transition = 'transform 160ms cubic-bezier(.22,.72,.22,1), opacity 160ms ease'
    label.style.transform = 'translateX(0)'
    label.style.opacity = '1'
    window.setTimeout(() => {
      label.style.removeProperty('transition')
      label.style.removeProperty('transform')
      label.style.removeProperty('opacity')
    }, 170)

    sceneCurrent.style.cursor = 'grab'
    pointerId = null
    axis = null
    deltaX = 0
    deltaY = 0
  }

  sceneCurrent.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.pointerType === 'mouse') return
    if (previousButton.disabled || nextButton.disabled) return

    pointerId = event.pointerId
    startX = event.clientX
    startY = event.clientY
    deltaX = 0
    deltaY = 0
    axis = null
    sceneCurrent.style.cursor = 'grabbing'
    sceneCurrent.setPointerCapture(event.pointerId)
  })

  sceneCurrent.addEventListener('pointermove', (event) => {
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

  sceneCurrent.addEventListener('pointerup', (event) => {
    if (event.pointerId !== pointerId) return

    const widthThreshold = Math.min(82, sceneCurrent.clientWidth * 0.22)
    const threshold = Math.max(SWIPE_MIN_DISTANCE, widthThreshold)
    const horizontalEnough = axis === 'horizontal'
      && Math.abs(deltaX) >= threshold
      && Math.abs(deltaY) <= SWIPE_VERTICAL_TOLERANCE
      && Math.abs(deltaX) > Math.abs(deltaY) * 1.2

    if (horizontalEnough) {
      if (deltaX < 0 && !nextButton.disabled) nextButton.click()
      if (deltaX > 0 && !previousButton.disabled) previousButton.click()
    }

    resetDrag()
  })

  sceneCurrent.addEventListener('pointercancel', resetDrag)
  sceneCurrent.addEventListener('lostpointercapture', () => {
    if (pointerId !== null) resetDrag()
  })

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }

    const target = event.target
    if (target instanceof HTMLElement) {
      const tagName = target.tagName
      if (target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return
      }
    }

    if (event.key === 'ArrowLeft' && !previousButton.disabled) {
      event.preventDefault()
      previousButton.click()
    } else if (event.key === 'ArrowRight' && !nextButton.disabled) {
      event.preventDefault()
      nextButton.click()
    }
  })
}

installSceneSwipe()
