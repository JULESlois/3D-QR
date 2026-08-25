import { spawn, spawnSync } from 'node:child_process'
import process from 'node:process'

const host = '127.0.0.1'
const previewPort = 4176
const debugPort = 9225
const baseUrl = `http://${host}:${previewPort}`
const userDataDir = '.share-link-smoke-chrome'
const payload = 'https://example.com/shared?from=3d-qr&mode=test'

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed')
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

let preview
let chrome
let socket

try {
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
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.__copiedShareLink = value } } })`,
  })
  await send('Page.navigate', { url: baseUrl })

  await waitForValue(
    send,
    `document.readyState === 'complete'
      && !!document.querySelector('#stage canvas')
      && !!document.querySelector('#copy-share-link')`,
    (value) => value === true,
    'share UI readiness',
  )

  await evaluateValue(send, `(() => {
    window.__shareCopyEvent = null
    document.addEventListener('share-link-copy', (event) => {
      window.__shareCopyEvent = event.detail
    }, { once: true })

    const input = document.querySelector('#qr-input')
    input.value = ${JSON.stringify(payload)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('[data-style="city"]').click()
    document.querySelector('[data-palette="spectrum"]').click()
    document.querySelector('#stage canvas').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 2, clientY: 2 }))
    return true
  })()`)

  const canonical = await waitForValue(
    send,
    `({
      payload: document.querySelector('#qr-input')?.value,
      style: document.body.dataset.style,
      palette: document.querySelector('[data-palette].is-active')?.dataset.palette,
      view: document.body.dataset.mode,
      hash: location.hash
    })`,
    (value) => value?.payload === payload
      && value?.style === 'city'
      && value?.palette === 'spectrum'
      && value?.view === 'qr'
      && value?.hash.includes('s=city')
      && value?.hash.includes('p=spectrum')
      && value?.hash.includes('v=qr'),
    'canonical share state',
  )

  await evaluateValue(send, `document.querySelector('#copy-share-link').click()`)
  const copied = await waitForValue(
    send,
    `({ event: window.__shareCopyEvent, copied: window.__copiedShareLink, href: location.href })`,
    (value) => value?.event?.copied === true
      && value?.event?.url === value?.href
      && value?.copied === value?.href,
    'share-link copy',
  )

  await evaluateValue(send, `location.hash = '#q=restored-state&s=tree&p=blossom&v=art'`)
  const restored = await waitForValue(
    send,
    `({
      payload: document.querySelector('#qr-input')?.value,
      style: document.body.dataset.style,
      palette: document.querySelector('[data-palette].is-active')?.dataset.palette,
      view: document.body.dataset.mode
    })`,
    (value) => value?.payload === 'restored-state'
      && value?.style === 'tree'
      && value?.palette === 'blossom'
      && value?.view === 'art',
    'hash-navigation restoration',
  )

  console.log(`share-link browser smoke: ${canonical.style}/${canonical.palette}/${canonical.view} copied and restored to ${restored.style}/${restored.palette}/${restored.view}; ${copied.href.length} URL chars`)
} finally {
  socket?.close()
  await stopProcess(chrome)
  await stopProcess(preview)
}
