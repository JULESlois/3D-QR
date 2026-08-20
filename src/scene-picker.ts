const sceneDock = document.querySelector<HTMLElement>('.scene-dock')
const sceneCurrent = sceneDock?.querySelector<HTMLElement>('.scene-current') ?? null
const sceneOptions = sceneDock?.querySelector<HTMLElement>('.scene-options') ?? null
const sourceButtons = sceneOptions
  ? Array.from(sceneOptions.querySelectorAll<HTMLButtonElement>('button[data-style]'))
  : []

if (sceneDock && sceneCurrent && sourceButtons.length > 1) {
  const label = sceneCurrent.querySelector<HTMLElement>('.scene-current-label')
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = `${sceneCurrent.className} scene-picker-trigger`
  trigger.setAttribute('aria-haspopup', 'dialog')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.setAttribute('aria-label', 'Choose scene')

  while (sceneCurrent.firstChild) trigger.append(sceneCurrent.firstChild)
  sceneCurrent.replaceWith(trigger)

  const picker = document.createElement('div')
  picker.className = 'scene-picker'
  picker.setAttribute('role', 'dialog')
  picker.setAttribute('aria-label', 'Choose scene')
  picker.setAttribute('aria-hidden', 'true')

  const pickerGrid = document.createElement('div')
  pickerGrid.className = 'scene-picker-grid'
  picker.append(pickerGrid)
  sceneDock.append(picker)

  const pickerButtons = sourceButtons.map((source) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'scene-picker-option'
    button.dataset.style = source.dataset.style
    button.textContent = source.textContent?.trim() || source.dataset.style?.toUpperCase() || 'SCENE'
    button.addEventListener('click', () => {
      if (source.disabled) return
      source.click()
      closePicker(false)
    })
    pickerGrid.append(button)
    return button
  })

  const style = document.createElement('style')
  style.textContent = `
    .scene-dock {
      overflow: visible;
    }

    .scene-picker-trigger {
      width: 100%;
      padding: 0 24px 0 12px !important;
      background: transparent;
      cursor: pointer;
      position: relative;
    }

    .scene-picker-trigger::after {
      content: '⌄';
      position: absolute;
      right: 8px;
      top: 50%;
      color: rgba(32, 35, 31, .38);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      transform: translateY(-58%);
      transition: transform 150ms ease, color 150ms ease;
    }

    .scene-picker-trigger:hover::after,
    .scene-picker-trigger:focus-visible::after,
    .scene-picker-trigger[aria-expanded='true']::after {
      color: var(--ink);
    }

    .scene-picker-trigger[aria-expanded='true']::after {
      transform: translateY(-38%) rotate(180deg);
    }

    .scene-picker {
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      width: min(430px, calc(100vw - 24px));
      padding: 8px;
      visibility: hidden;
      opacity: 0;
      transform: translate(-50%, -6px);
      background: color-mix(in srgb, var(--paper-clean) 94%, transparent);
      box-shadow: 0 18px 48px rgba(32, 35, 31, .12);
      backdrop-filter: blur(16px) saturate(.9);
      -webkit-backdrop-filter: blur(16px) saturate(.9);
      pointer-events: none;
      transition: opacity 150ms ease, transform 180ms cubic-bezier(.16, 1, .3, 1), visibility 0s linear 180ms;
    }

    .scene-picker[data-open='true'] {
      visibility: visible;
      opacity: 1;
      transform: translate(-50%, 0);
      pointer-events: auto;
      transition: opacity 150ms ease, transform 180ms cubic-bezier(.16, 1, .3, 1);
    }

    .scene-picker-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 3px;
    }

    .scene-picker-option {
      min-width: 0;
      min-height: 34px;
      padding: 8px 9px !important;
      background: transparent;
      color: rgba(32, 35, 31, .56);
      cursor: pointer;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: .09em;
      line-height: 1;
      text-align: left;
      transition: background-color 130ms ease, color 130ms ease, transform 130ms ease;
    }

    .scene-picker-option:hover,
    .scene-picker-option:focus-visible {
      color: var(--ink);
      background: color-mix(in srgb, var(--ink) 6%, transparent) !important;
      transform: translateY(-1px);
    }

    .scene-picker-option[aria-current='true'] {
      color: var(--ink);
      background: color-mix(in srgb, var(--accent) 12%, transparent) !important;
    }

    .scene-picker-option:disabled {
      cursor: default;
      opacity: .32;
      transform: none;
    }

    @media (max-width: 560px) {
      .scene-picker-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .scene-picker-option {
        min-height: 38px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .scene-picker,
      .scene-picker-trigger::after,
      .scene-picker-option {
        transition: none !important;
      }
    }
  `
  document.head.append(style)

  let open = false

  function syncPickerState(): void {
    const activeStyle = document.body.dataset.style
    const activeIndex = sourceButtons.findIndex((source) => source.dataset.style === activeStyle)

    for (let index = 0; index < pickerButtons.length; index += 1) {
      const pickerButton = pickerButtons[index]
      const source = sourceButtons[index]
      const active = index === activeIndex
      pickerButton.disabled = source.disabled
      if (active) pickerButton.setAttribute('aria-current', 'true')
      else pickerButton.removeAttribute('aria-current')
    }

    if (activeIndex >= 0 && label) {
      const activeSource = sourceButtons[activeIndex]
      label.textContent = activeSource.textContent?.trim()
        || activeSource.dataset.style?.toUpperCase()
        || 'SCENE'
    }
  }

  function openPicker(): void {
    if (open) return
    open = true
    syncPickerState()
    trigger.setAttribute('aria-expanded', 'true')
    picker.dataset.open = 'true'
    picker.setAttribute('aria-hidden', 'false')

    const active = pickerButtons.find((button) => button.getAttribute('aria-current') === 'true')
      ?? pickerButtons.find((button) => !button.disabled)
    active?.focus({ preventScroll: true })
  }

  function closePicker(restoreFocus = true): void {
    if (!open) return
    open = false
    trigger.setAttribute('aria-expanded', 'false')
    delete picker.dataset.open
    picker.setAttribute('aria-hidden', 'true')
    if (restoreFocus) trigger.focus({ preventScroll: true })
  }

  function movePickerFocus(delta: number): void {
    const enabled = pickerButtons.filter((button) => !button.disabled)
    if (enabled.length === 0) return
    const current = document.activeElement instanceof HTMLButtonElement
      ? enabled.indexOf(document.activeElement)
      : -1
    const next = (current + delta + enabled.length) % enabled.length
    enabled[next]?.focus({ preventScroll: true })
  }

  trigger.addEventListener('click', () => {
    if (open) closePicker(false)
    else openPicker()
  })

  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      openPicker()
    }
  })

  picker.addEventListener('keydown', (event) => {
    const columns = window.matchMedia('(max-width: 560px)').matches ? 2 : 3
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      movePickerFocus(1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      movePickerFocus(-1)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      movePickerFocus(columns)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      movePickerFocus(-columns)
    } else if (event.key === 'Home') {
      event.preventDefault()
      pickerButtons.find((button) => !button.disabled)?.focus({ preventScroll: true })
    } else if (event.key === 'End') {
      event.preventDefault()
      [...pickerButtons].reverse().find((button) => !button.disabled)?.focus({ preventScroll: true })
    }
  })

  document.addEventListener('pointerdown', (event) => {
    if (!open) return
    const target = event.target
    if (!(target instanceof Node)) return
    if (!sceneDock.contains(target)) closePicker(false)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) closePicker()
  })

  const styleObserver = new MutationObserver(syncPickerState)
  styleObserver.observe(document.body, { attributes: true, attributeFilter: ['data-style'] })

  const busyObserver = new MutationObserver(syncPickerState)
  for (const source of sourceButtons) {
    busyObserver.observe(source, { attributes: true, attributeFilter: ['disabled'] })
  }

  syncPickerState()
}
