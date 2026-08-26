import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'

const require = createRequire(import.meta.url)
const jsQR = require('jsqr')
const { PNG } = require('pngjs')

const host = '127.0.0.1'
const previewPort = 4177
const debugPort = 9226
const baseUrl = `http://${host}:${previewPort}`
const outputDir = 'all-scenes-qr-smoke'
const userDataDir = '.all-scenes-qr-smoke-chrome'
const expectedPayload = 'https://github.com/JULESlois/3D-QR'
const styles = [
  'tree',
  'forest',
  'mountain',
  'station',
  'house',
  'castle',
  'glyph',
  'city',
  'lighthouse',
  'pagoda',
  'temple',
  'crystal',
]

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

async function evaluateValue(send, expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  return result.result?.value
}

async function waitForValue(send, expression, predicate, label, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  let value

  while (Date.now() < deadline) {
    value = await evaluateValue(send, expression)
    if (predicate(value)) return value
    await sleep(80)
  }

  throw new Error(`${label} did not settle; got ${JSON.stringify(value)}`)
}

async function waitForPage(send) {
  await waitForValue(
    send,
    `document.readyState === 'complete' && !!document.querySelector('#stage canvas')`,
    (value) => value === true,
    'Application canvas',
    10_000,
  )
}

async function capture(send, style) {
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  const bytes = Buffer.from(result.data, 'base64')
  if (bytes.length < 10_000) {
    throw new Error(`${style} QR screenshot is unexpectedly small (${bytes.length} bytes)`)
  }
  await writeFile(`${outputDir}/${style}-qr.png`, bytes)
  return bytes
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

function decodeQr(bytes, style) {
  const png = PNG.sync.read(bytes)
  const pixels = new Uint8ClampedArray(
    png.data.buffer,
    png.data.byteOffset,
    png.data.byteLength,
  )
  const raw = jsQR(pixels, png.width, png.height, { inversionAttempts: 'attemptBoth' })
  const decoded = raw ?? jsQR(closeVoxelGaps(png), png.width, png.height, { inversionAttempts: 'attemptBoth' })

  if (!decoded) throw new Error(`jsQR could not decode ${style} QR projection`)
  if (decoded.data !== expectedPayload) {
    throw new Error(`${style} QR projection decoded unexpected payload: ${JSON.stringify(decoded.data)}`)
  }
  return decoded.data
}

async function enterQrView(send) {
  await evaluateValue(send, `document.querySelector('#stage canvas')?.click()`)
  await waitForValue(
    send,
    `document.body.dataset.mode`,
    (value) => value === 'qr',
    'QR projection mode',
  )
  await sleep(2_600)
}

async function isolateProjection(send) {
  await evaluateValue(send, `(() => {
    document.querySelectorAll('.scene-dock, .control-panel, .panel-restore-toggle').forEach((element) => {
      element.style.visibility = 'hidden'
    })
    return true
  })()`)
  await sleep(80)
}

async function selectStyle(send, style) {
  const clicked = await evaluateValue(send, `(() => {
    const button = document.querySelector('[data-style="${style}"]')
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false
    button.click()
    return true
  })()`)
  if (!clicked) throw new Error(`Could not activate ${style} scene button`)

  await waitForValue(
    send,
    `document.body.dataset.style`,
    (value) => value === style,
    `${style} scene`,
  )
  await waitForValue(
    send,
    `document.querySelector('#qr-meta')?.textContent?.includes('QR ERROR') ?? false`,
    (value) => value === false,
    `${style} QR build`,
  )
  await sleep(900)
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1024,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: baseUrl })
  await waitForPage(send)
  await sleep(700)
  await enterQrView(send)
  await isolateProjection(send)

  const results = []
  for (const style of styles) {
    if (style !== 'tree') await selectStyle(send, style)
    const bytes = await capture(send, style)
    const payload = decodeQr(bytes, style)
    results.push(`${style}:${bytes.length}:${payload.length}`)
  }

  console.log(`all-scenes QR smoke: ${styles.length} scenes decoded / ${results.join(' | ')}`)
} finally {
  socket?.close()
  await Promise.all([stopProcess(chrome), stopProcess(preview)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
}
