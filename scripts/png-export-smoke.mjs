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
const expectedPayload = `https://example.invalid/high-density-qr?data=${'0123456789abcdef'.repeat(24)}`
const minimumExpectedVersion = 18
const transitionPalette = 'summer'

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

function decodeQrPanel(pair) {
  const panelSize = 1024
  const qrData = Buffer.alloc(panelSize * panelSize * 4)

  for (let y = 0; y < panelSize; y += 1) {
    const sourceStart = (y * pair.width + panelSize) * 4
    const targetStart = y * panelSize * 4
    pair.data.copy(qrData, targetStart, sourceStart, sourceStart + panelSize * 4)
  }

  const pixels = new Uint8ClampedArray(qrData.buffer, qrData.byteOffset, qrData.byteLength)
  const decoded = jsQR(pixels, panelSize, panelSize, { inversionAttempts: 'attemptBoth' })

  if (!decoded) {
    throw new Error('jsQR could not directly decode the high-density QR panel in the exported PNG pair')
  }
  if (decoded.data !== expectedPayload) {
    throw new Error(`Exported QR panel decoded unexpected payload: ${JSON.stringify(decoded.data)}`)
  }
  return decoded.data
}

function assertIdenticalPixels(immediatePair, settledPair) {
  if (immediatePair.width !== settledPair.width || immediatePair.height !== settledPair.height) {
    throw new Error(
      `Immediate/settled palette exports have different dimensions: `
        + `${immediatePair.width}×${immediatePair.height} vs ${settledPair.width}×${settledPair.height}`,
    )
  }
  if (!immediatePair.data.equals(settledPair.data)) {
    throw new Error('PNG export captured transitional palette colors instead of the selected settled palette')
  }
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

  await evaluateValue(send, `(() => {
    const input = document.querySelector('#qr-input')
    if (!input) return false
    input.value = ${JSON.stringify(expectedPayload)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)

  const qrMeta = await waitForValue(
    send,
    `document.querySelector('#qr-meta')?.textContent ?? ''`,
    (value) => /^QR V\d+/.test(value),
    'high-density QR rebuild',
  )
  const qrVersion = Number(qrMeta.match(/^QR V(\d+)/)?.[1])
  if (!Number.isFinite(qrVersion) || qrVersion < minimumExpectedVersion) {
    throw new Error(`PNG export smoke expected QR version >= ${minimumExpectedVersion}, got ${JSON.stringify(qrMeta)}`)
  }

  const startedImmediateExport = await evaluateValue(send, `(() => {
    const palette = document.querySelector('[data-palette="${transitionPalette}"]')
    const exportButton = document.querySelector('#export-png')
    if (!(palette instanceof HTMLButtonElement) || !(exportButton instanceof HTMLButtonElement)) return false
    window.__pngExportSmoke = null
    document.addEventListener('png-export-complete', (event) => {
      window.__pngExportSmoke = event.detail
    }, { once: true })
    palette.click()
    exportButton.click()
    return palette.classList.contains('is-active')
  })()`)
  if (!startedImmediateExport) {
    throw new Error(`Could not start immediate PNG export for ${transitionPalette} palette`)
  }

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

  const immediatePair = PNG.sync.read(await readFile(download.path))
  if (immediatePair.width !== 2048 || immediatePair.height !== 1024) {
    throw new Error(`PNG export has unexpected dimensions ${immediatePair.width}×${immediatePair.height}`)
  }
  const decodedPayload = decodeQrPanel(immediatePair)

  const restored = await waitForValue(
    send,
    `(() => ({
      mode: document.body.dataset.mode,
      exporting: document.body.dataset.pngExporting ?? null,
      buttonDisabled: document.querySelector('#export-png')?.disabled ?? true,
      inputDisabled: document.querySelector('#qr-input')?.disabled ?? true,
      paletteActive: document.querySelector('[data-palette="${transitionPalette}"]')?.classList.contains('is-active') ?? false
    }))()`,
    (value) => value?.mode === 'art'
      && value?.exporting === null
      && value?.buttonDisabled === false
      && value?.inputDisabled === false
      && value?.paletteActive === true,
    'PNG export state restoration',
    8_000,
  )

  await rm(download.path, { force: true })
  await evaluateValue(send, `document.querySelector('[data-palette="blossom"]')?.click()`)
  await sleep(650)
  await evaluateValue(send, `document.querySelector('[data-palette="${transitionPalette}"]')?.click()`)
  await sleep(650)
  await evaluateValue(send, `document.querySelector('#export-png')?.click()`)

  const settledDownload = await waitForDownload(8_000)
  const settledPair = PNG.sync.read(await readFile(settledDownload.path))
  assertIdenticalPixels(immediatePair, settledPair)
  decodeQrPanel(settledPair)

  console.log(
    `png export smoke: ${download.filename} / ${download.bytes} bytes / ${immediatePair.width}×${immediatePair.height} / `
      + `QR V${qrVersion} / event ${eventDetail.bytes} bytes / direct jsQR decoded ${JSON.stringify(decodedPayload)} / `
      + `immediate ${transitionPalette} export matched settled palette pixels / restored ${restored.mode}`,
  )
} finally {
  socket?.close()
  await Promise.all([stopProcess(chrome), stopProcess(preview)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
}
