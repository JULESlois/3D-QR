import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const jsQR = require('jsqr')
const { PNG } = require('pngjs')

const host = '127.0.0.1'
const previewPort = 4173
const debugPort = 9222
const baseUrl = `http://${host}:${previewPort}`
const outputDir = 'browser-smoke'
const userDataDir = '.browser-smoke-chrome'
const expectedQrPayload = 'https://github.com/JULESlois/3D-QR'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome-stable',
    'google-chrome',
    'chromium-browser',
    'chromium',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' })
    if (result.status === 0) return result.stdout.trim()
  }

  throw new Error(`Chrome/Chromium not found. Tried: ${candidates.join(', ')}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 2_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

async function waitForHttp(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let lastError

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch (error) {
      lastError = error
    }
    await sleep(150)
  }

  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError}` : ''}`)
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', () => reject(new Error('Failed to open Chrome DevTools websocket')), { once: true })
  })

  let nextId = 1
  const pending = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id) return
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    if (message.error) request.reject(new Error(message.error.message))
    else request.resolve(message.result)
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

  return { socket, send }
}

async function waitForPage(send, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await send('Runtime.evaluate', {
      expression: `document.readyState === 'complete' && !!document.querySelector('#stage canvas')`,
      returnByValue: true,
    })
    if (result.result?.value === true) return
    await sleep(100)
  }
  throw new Error('Application canvas did not become ready in time')
}

async function evaluateValue(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
  })
  return result.result?.value
}

async function waitForValue(send, expression, expected, label, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  let current
  while (Date.now() < deadline) {
    current = await evaluateValue(send, expression)
    if (current === expected) return current
    await sleep(80)
  }
  throw new Error(`${label} did not settle to ${JSON.stringify(expected)}; got ${JSON.stringify(current)}`)
}

async function navigate(send, width, height) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 600,
  })
  await send('Page.navigate', { url: baseUrl })
  await waitForPage(send)
  await sleep(700)

  const health = await send('Runtime.evaluate', {
    expression: `(() => ({
      mode: document.body.dataset.mode,
      style: document.body.dataset.style,
      canvasWidth: document.querySelector('#stage canvas')?.clientWidth ?? 0,
      canvasHeight: document.querySelector('#stage canvas')?.clientHeight ?? 0,
      qrError: document.querySelector('#qr-meta')?.textContent?.includes('QR ERROR') ?? false,
      sceneDock: !!document.querySelector('.scene-dock'),
      controls: !!document.querySelector('.control-panel')
    }))()`,
    returnByValue: true,
  })

  const value = health.result?.value
  if (!value || value.canvasWidth < 100 || value.canvasHeight < 100 || value.qrError || !value.sceneDock || !value.controls) {
    throw new Error(`Browser smoke health check failed: ${JSON.stringify(value)}`)
  }
}

async function assertExportActionHierarchy(send) {
  const state = await evaluateValue(send, `(() => {
    const png = document.querySelector('#export-png')
    const gif = Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'EXPORT GIF')
    return {
      pngFound: !!png,
      gifFound: !!gif,
      sameParent: !!png && !!gif && png.parentElement === gif.parentElement,
      parentIsFooterActions: png?.parentElement?.classList.contains('footer-actions') ?? false,
      pngInsidePalette: !!png?.closest('.palette-control')
    }
  })()`)

  if (!state?.pngFound || !state.gifFound || !state.sameParent || !state.parentIsFooterActions || state.pngInsidePalette) {
    throw new Error(`PNG and GIF exports are not peer footer actions: ${JSON.stringify(state)}`)
  }
}

async function exerciseMobileUi(send) {
  const initial = await evaluateValue(send, `(() => ({
    style: document.body.dataset.style,
    sceneLabel: document.querySelector('.scene-current-label')?.textContent?.trim(),
    palette: document.querySelector('.palette-swatch.is-active')?.dataset.palette,
    controls: document.body.dataset.controls,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }))()`)

  if (!initial || initial.style !== 'tree' || initial.sceneLabel !== 'TREE' || initial.palette !== 'blossom' || initial.controls !== 'expanded' || initial.overflow) {
    throw new Error(`Unexpected initial mobile UI state: ${JSON.stringify(initial)}`)
  }

  await evaluateValue(send, `document.querySelector('.palette-swatch[data-palette="summer"]')?.click()`)
  await waitForValue(
    send,
    `document.querySelector('.palette-swatch.is-active')?.dataset.palette`,
    'summer',
    'Palette switch',
  )

  await evaluateValue(send, `document.querySelector('.scene-arrow-next')?.click()`)
  await waitForValue(send, `document.body.dataset.style`, 'forest', 'Next-scene navigation')
  await waitForValue(send, `document.querySelector('.scene-current-label')?.textContent?.trim()`, 'FOREST', 'Scene label')

  await evaluateValue(send, `document.querySelector('.panel-collapse-toggle')?.click()`)
  await waitForValue(send, `document.body.dataset.controls`, 'collapsed', 'Control-panel collapse', 5_000)
  const collapsed = await evaluateValue(send, `(() => ({
    restoreVisible: document.querySelector('.panel-restore-toggle')?.getAttribute('aria-hidden') === 'false',
    restoreTabIndex: document.querySelector('.panel-restore-toggle')?.tabIndex,
    dockVisible: getComputedStyle(document.querySelector('.scene-dock')).visibility !== 'hidden'
  }))()`)
  if (!collapsed?.restoreVisible || collapsed.restoreTabIndex !== 0 || !collapsed.dockVisible) {
    throw new Error(`Collapsed controls are not recoverable: ${JSON.stringify(collapsed)}`)
  }

  await evaluateValue(send, `document.querySelector('.panel-restore-toggle')?.click()`)
  await waitForValue(send, `document.body.dataset.controls`, 'expanded', 'Control-panel restore', 5_000)

  const finalState = await evaluateValue(send, `(() => ({
    style: document.body.dataset.style,
    sceneLabel: document.querySelector('.scene-current-label')?.textContent?.trim(),
    palette: document.querySelector('.palette-swatch.is-active')?.dataset.palette,
    controls: document.body.dataset.controls,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }))()`)
  if (!finalState || finalState.style !== 'forest' || finalState.sceneLabel !== 'FOREST' || finalState.palette !== 'summer' || finalState.controls !== 'expanded' || finalState.overflow) {
    throw new Error(`Mobile interaction smoke ended in an invalid state: ${JSON.stringify(finalState)}`)
  }

  return finalState
}

async function capture(send, name) {
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  const bytes = Buffer.from(result.data, 'base64')
  if (bytes.length < 10_000) throw new Error(`${name} screenshot is unexpectedly small (${bytes.length} bytes)`)
  await writeFile(`${outputDir}/${name}.png`, bytes)
  return bytes
}

async function switchToQr(send) {
  await send('Runtime.evaluate', {
    expression: `document.querySelector('#stage canvas')?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 10 }))`,
  })

  const deadline = Date.now() + 4_000
  while (Date.now() < deadline) {
    const result = await send('Runtime.evaluate', {
      expression: `document.body.dataset.mode === 'qr'`,
      returnByValue: true,
    })
    if (result.result?.value === true) break
    await sleep(80)
  }

  const mode = await send('Runtime.evaluate', {
    expression: `document.body.dataset.mode`,
    returnByValue: true,
  })
  if (mode.result?.value !== 'qr') throw new Error('Canvas click did not enter QR projection mode')

  // data-mode flips immediately, while the sculpture continues slerping toward the
  // orthographic QR orientation for roughly two seconds. Capture only after that motion
  // has settled; otherwise jsQR sees the art silhouette covering the projected code.
  await sleep(2_600)
}

async function isolateQrProjection(send) {
  await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.scene-dock, .control-panel, .panel-restore-toggle').forEach((element) => {
      element.style.visibility = 'hidden'
    })`,
  })
  await sleep(80)
}

function otsuThreshold(gray) {
  const histogram = new Uint32Array(256)
  for (const value of gray) histogram[value] += 1

  let totalWeighted = 0
  for (let value = 0; value < 256; value += 1) totalWeighted += value * histogram[value]

  let backgroundWeight = 0
  let backgroundWeighted = 0
  let bestThreshold = 127
  let bestVariance = -1
  const total = gray.length

  for (let threshold = 0; threshold < 256; threshold += 1) {
    backgroundWeight += histogram[threshold]
    if (backgroundWeight === 0) continue
    const foregroundWeight = total - backgroundWeight
    if (foregroundWeight === 0) break

    backgroundWeighted += threshold * histogram[threshold]
    const backgroundMean = backgroundWeighted / backgroundWeight
    const foregroundMean = (totalWeighted - backgroundWeighted) / foregroundWeight
    const delta = backgroundMean - foregroundMean
    const variance = backgroundWeight * foregroundWeight * delta * delta

    if (variance > bestVariance) {
      bestVariance = variance
      bestThreshold = threshold
    }
  }

  return bestThreshold
}

function closeVoxelGaps(png) {
  const pixelCount = png.width * png.height
  const gray = new Uint8Array(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4
    gray[index] = Math.round(
      png.data[offset] * 0.2126
      + png.data[offset + 1] * 0.7152
      + png.data[offset + 2] * 0.0722,
    )
  }

  const threshold = otsuThreshold(gray)
  const output = new Uint8ClampedArray(pixelCount * 4)
  output.fill(255)
  const radius = 2

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (gray[y * png.width + x] > threshold) continue
      const minY = Math.max(0, y - radius)
      const maxY = Math.min(png.height - 1, y + radius)
      const minX = Math.max(0, x - radius)
      const maxX = Math.min(png.width - 1, x + radius)

      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) {
          const offset = (yy * png.width + xx) * 4
          output[offset] = 0
          output[offset + 1] = 0
          output[offset + 2] = 0
          output[offset + 3] = 255
        }
      }
    }
  }

  return output
}

function decodeQrScreenshot(bytes) {
  const png = PNG.sync.read(bytes)
  const pixels = new Uint8ClampedArray(
    png.data.buffer,
    png.data.byteOffset,
    png.data.byteLength,
  )
  const raw = jsQR(pixels, png.width, png.height, { inversionAttempts: 'attemptBoth' })
  const decoded = raw ?? jsQR(closeVoxelGaps(png), png.width, png.height, { inversionAttempts: 'attemptBoth' })

  if (!decoded) {
    throw new Error(`jsQR could not decode the ${png.width}×${png.height} QR projection screenshot`)
  }
  if (decoded.data !== expectedQrPayload) {
    throw new Error(`QR projection decoded unexpected payload: ${JSON.stringify(decoded.data)}`)
  }

  return decoded.data
}

let preview
let chrome
let socket

try {
  await rm(outputDir, { recursive: true, force: true })
  await rm(userDataDir, { recursive: true, force: true })
  await mkdir(outputDir, { recursive: true })

  preview = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host', host,
    '--port', String(previewPort),
    '--strictPort',
  ], { stdio: 'ignore' })
  await waitForHttp(baseUrl)

  const chromePath = findChrome()
  chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })

  await waitForHttp(`http://${host}:${debugPort}/json/version`)
  const targetsResponse = await waitForHttp(`http://${host}:${debugPort}/json/list`)
  const targets = await targetsResponse.json()
  const page = targets.find((target) => target.type === 'page')
  if (!page?.webSocketDebuggerUrl) throw new Error('Chrome DevTools page target was not found')

  const cdp = await connectCdp(page.webSocketDebuggerUrl)
  socket = cdp.socket
  const { send } = cdp
  await send('Page.enable')
  await send('Runtime.enable')

  await navigate(send, 1440, 900)
  await assertExportActionHierarchy(send)
  const desktopBytes = await capture(send, 'desktop-art')

  await navigate(send, 390, 844)
  const mobileState = await exerciseMobileUi(send)
  const mobileBytes = await capture(send, 'mobile-art')

  await navigate(send, 1024, 1024)
  await switchToQr(send)
  await isolateQrProjection(send)
  const qrBytes = await capture(send, 'qr-view')
  const decodedPayload = decodeQrScreenshot(qrBytes)

  console.log(
    `browser smoke: desktop ${desktopBytes.length} bytes / mobile ${mobileBytes.length} bytes (${mobileState.style}/${mobileState.palette}) / QR ${qrBytes.length} bytes / `
      + `jsQR decoded ${JSON.stringify(decodedPayload)}`,
  )
} finally {
  socket?.close()
  await Promise.all([stopProcess(chrome), stopProcess(preview)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
}
