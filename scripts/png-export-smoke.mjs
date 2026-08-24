import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import process from 'node:process'

const require = createRequire(import.meta.url)
const jsQR = require('jsqr')
const { PNG } = require('pngjs')

const host = '127.0.0.1'
const previewPort = 4174
const debugPort = 9223
const baseUrl = `http://${host}:${previewPort}`
const userDataDir = '.png-export-smoke-chrome'
const downloadDir = resolve('png-export-smoke')
const expectedFilename = '3d-qr-tree-art-qr.png'
const expectedPayload = 'https://github.com/JULESlois/3D-QR'

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

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

  await new Promise((resolvePromise) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 2_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolvePromise()
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
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener('open', resolvePromise, { once: true })
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

  const send = (method, params = {}) => new Promise((resolvePromise, reject) => {
    const id = nextId++
    pending.set(id, { resolve: resolvePromise, reject })
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

async function waitForValue(send, expression, predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  let current

  while (Date.now() < deadline) {
    current = await evaluateValue(send, expression)
    if (predicate(current)) return current
    await sleep(100)
  }

  throw new Error(`${label} did not settle; got ${JSON.stringify(current)}`)
}

async function waitForDownload(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = await readdir(downloadDir).catch(() => [])
    const pngs = files.filter((file) => file.endsWith('.png') && !file.endsWith('.crdownload'))
    if (pngs.length === 1) {
      const path = resolve(downloadDir, pngs[0])
      const info = await stat(path)
      if (info.size > 20_000) return { path, filename: pngs[0], bytes: info.size }
    }
    await sleep(120)
  }
  throw new Error('PNG export download did not complete in time')
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

function decodeQrPanel(pair) {
  const panelSize = 1024
  const qrData = Buffer.alloc(panelSize * panelSize * 4)

  for (let y = 0; y < panelSize; y += 1) {
    const sourceStart = (y * pair.width + panelSize) * 4
    const targetStart = y * panelSize * 4
    pair.data.copy(qrData, targetStart, sourceStart, sourceStart + panelSize * 4)
  }

  const qrPanel = { width: panelSize, height: panelSize, data: qrData }
  const pixels = new Uint8ClampedArray(qrData.buffer, qrData.byteOffset, qrData.byteLength)
  const raw = jsQR(pixels, panelSize, panelSize, { inversionAttempts: 'attemptBoth' })
  const decoded = raw ?? jsQR(closeVoxelGaps(qrPanel), panelSize, panelSize, { inversionAttempts: 'attemptBoth' })

  if (!decoded) throw new Error('jsQR could not decode the QR panel in the exported PNG pair')
  if (decoded.data !== expectedPayload) {
    throw new Error(`Exported QR panel decoded unexpected payload: ${JSON.stringify(decoded.data)}`)
  }
  return decoded.data
}

let preview
let chrome
let socket

try {
  await rm(downloadDir, { recursive: true, force: true })
  await rm(userDataDir, { recursive: true, force: true })
  await mkdir(downloadDir, { recursive: true })

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
  await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir })
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1200,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await send('Page.navigate', { url: baseUrl })

  await waitForValue(
    send,
    `document.readyState === 'complete' && !!document.querySelector('#stage canvas') && !!document.querySelector('#export-png')`,
    (value) => value === true,
    'PNG export UI readiness',
  )
  await sleep(800)

  await evaluateValue(send, `(() => {
    window.__pngExportSmoke = null
    document.addEventListener('png-export-complete', (event) => {
      window.__pngExportSmoke = event.detail
    }, { once: true })
    document.querySelector('#export-png')?.click()
    return true
  })()`)

  const eventDetail = await waitForValue(
    send,
    `window.__pngExportSmoke`,
    (value) => value?.width === 2048 && value?.height === 1024 && value?.bytes > 20_000,
    'PNG export completion event',
    18_000,
  )
  const download = await waitForDownload(8_000)
  if (download.filename !== expectedFilename) {
    throw new Error(`PNG export used unexpected filename: ${download.filename}`)
  }

  const pair = PNG.sync.read(await readFile(download.path))
  if (pair.width !== 2048 || pair.height !== 1024) {
    throw new Error(`PNG export has unexpected dimensions ${pair.width}×${pair.height}`)
  }
  const decodedPayload = decodeQrPanel(pair)

  const restored = await waitForValue(
    send,
    `(() => ({
      mode: document.body.dataset.mode,
      exporting: document.body.dataset.pngExporting ?? null,
      buttonDisabled: document.querySelector('#export-png')?.disabled ?? true,
      inputDisabled: document.querySelector('#qr-input')?.disabled ?? true
    }))()`,
    (value) => value?.mode === 'art'
      && value?.exporting === null
      && value?.buttonDisabled === false
      && value?.inputDisabled === false,
    'PNG export state restoration',
    8_000,
  )

  console.log(
    `png export smoke: ${download.filename} / ${download.bytes} bytes / ${pair.width}×${pair.height} / `
      + `event ${eventDetail.bytes} bytes / jsQR decoded ${JSON.stringify(decodedPayload)} / restored ${restored.mode}`,
  )
} finally {
  socket?.close()
  await Promise.all([stopProcess(chrome), stopProcess(preview)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
}
