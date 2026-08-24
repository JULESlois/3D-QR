import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const host = '127.0.0.1'
const previewPort = 4173
const debugPort = 9222
const baseUrl = `http://${host}:${previewPort}`
const outputDir = 'browser-smoke'
const userDataDir = '.browser-smoke-chrome'

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

async function capture(send, name) {
  const result = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    fromSurface: true,
  })
  const bytes = Buffer.from(result.data, 'base64')
  if (bytes.length < 10_000) throw new Error(`${name} screenshot is unexpectedly small (${bytes.length} bytes)`)
  await writeFile(`${outputDir}/${name}.png`, bytes)
  return bytes.length
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
  await sleep(900)
}

async function tryNativeQrDecode(send) {
  const result = await send('Runtime.evaluate', {
    expression: `(async () => {
      if (!('BarcodeDetector' in window)) return { supported: false, count: 0 }
      try {
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const canvas = document.querySelector('#stage canvas')
        const codes = canvas ? await detector.detect(canvas) : []
        return { supported: true, count: codes.length, values: codes.map((code) => code.rawValue) }
      } catch (error) {
        return { supported: true, count: 0, error: String(error) }
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })

  const value = result.result?.value ?? { supported: false, count: 0 }
  if (value.supported && value.count < 1) {
    throw new Error(`Native BarcodeDetector is available but did not decode QR view: ${JSON.stringify(value)}`)
  }
  return value
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
  const desktopBytes = await capture(send, 'desktop-art')

  await navigate(send, 390, 844)
  const mobileBytes = await capture(send, 'mobile-art')

  await navigate(send, 1024, 1024)
  await switchToQr(send)
  const qrBytes = await capture(send, 'qr-view')
  const decode = await tryNativeQrDecode(send)

  console.log(
    `browser smoke: desktop ${desktopBytes} bytes / mobile ${mobileBytes} bytes / QR ${qrBytes} bytes / `
      + (decode.supported ? `BarcodeDetector decoded ${decode.count}` : 'BarcodeDetector unavailable; QR screenshot retained'),
  )
} finally {
  socket?.close()
  await Promise.all([stopProcess(chrome), stopProcess(preview)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
}
