import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const host = '127.0.0.1'
const previewPort = 4175
const debugPort = 9224
const baseUrl = `http://${host}:${previewPort}`
const userDataDir = '.gif-export-smoke-chrome'
const downloadDir = resolve('gif-export-smoke')
const expectedFilename = '3d-qr-tree-reveal.gif'

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

async function waitForDownload(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const files = await readdir(downloadDir).catch(() => [])
    const gifs = files.filter((file) => file.endsWith('.gif') && !file.endsWith('.crdownload'))
    if (gifs.length === 1) {
      const path = resolve(downloadDir, gifs[0])
      const info = await stat(path)
      if (info.size > 50_000) return { path, filename: gifs[0], bytes: info.size }
    }
    await sleep(150)
  }
  throw new Error('GIF export download did not complete in time')
}

function readSubBlocks(bytes, start) {
  let offset = start
  const chunks = []

  while (offset < bytes.length) {
    const size = bytes[offset]
    offset += 1
    if (size === 0) return { offset, chunks }
    if (offset + size > bytes.length) throw new Error('GIF sub-block exceeds file length')
    chunks.push(bytes.subarray(offset, offset + size))
    offset += size
  }

  throw new Error('GIF sub-block stream is missing its terminator')
}

function parseGif(bytes) {
  if (bytes.length < 14) throw new Error('GIF export is too small to contain a valid stream')

  const signature = bytes.subarray(0, 6).toString('ascii')
  if (signature !== 'GIF89a' && signature !== 'GIF87a') {
    throw new Error(`GIF export has invalid signature ${JSON.stringify(signature)}`)
  }

  const width = bytes.readUInt16LE(6)
  const height = bytes.readUInt16LE(8)
  const packed = bytes[10]
  let offset = 13

  if (packed & 0x80) {
    const entries = 1 << ((packed & 0x07) + 1)
    offset += entries * 3
  }

  let frames = 0
  const delays = []
  let looping = false
  let trailer = false

  while (offset < bytes.length) {
    const introducer = bytes[offset]
    offset += 1

    if (introducer === 0x3b) {
      trailer = true
      break
    }

    if (introducer === 0x2c) {
      if (offset + 9 > bytes.length) throw new Error('GIF image descriptor is truncated')
      const imagePacked = bytes[offset + 8]
      offset += 9

      if (imagePacked & 0x80) {
        const entries = 1 << ((imagePacked & 0x07) + 1)
        offset += entries * 3
      }

      if (offset >= bytes.length) throw new Error('GIF image data is missing LZW code size')
      offset += 1
      offset = readSubBlocks(bytes, offset).offset
      frames += 1
      continue
    }

    if (introducer !== 0x21) {
      throw new Error(`Unexpected GIF block introducer 0x${introducer.toString(16)}`)
    }

    if (offset >= bytes.length) throw new Error('GIF extension block is truncated')
    const label = bytes[offset]
    offset += 1

    if (label === 0xf9) {
      const blockSize = bytes[offset]
      offset += 1
      if (blockSize !== 4 || offset + blockSize >= bytes.length) {
        throw new Error('GIF graphic control extension is malformed')
      }
      delays.push(bytes[offset + 1] | (bytes[offset + 2] << 8))
      offset += blockSize
      if (bytes[offset] !== 0) throw new Error('GIF graphic control extension is missing terminator')
      offset += 1
      continue
    }

    if (label === 0xff || label === 0x01) {
      const blockSize = bytes[offset]
      offset += 1
      if (offset + blockSize > bytes.length) throw new Error('GIF fixed extension block is truncated')
      const identifier = label === 0xff ? bytes.subarray(offset, offset + blockSize).toString('ascii') : ''
      offset += blockSize
      const subBlocks = readSubBlocks(bytes, offset)
      offset = subBlocks.offset

      if (identifier === 'NETSCAPE2.0' || identifier === 'ANIMEXTS1.0') {
        looping = subBlocks.chunks.some((chunk) => chunk.length >= 3 && chunk[0] === 1)
      }
      continue
    }

    offset = readSubBlocks(bytes, offset).offset
  }

  return { signature, width, height, frames, delays, looping, trailer }
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
    `document.readyState === 'complete'
      && !!document.querySelector('#stage canvas')
      && Array.from(document.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'EXPORT GIF')`,
    (value) => value === true,
    'GIF export UI readiness',
  )
  await sleep(800)

  await evaluateValue(send, `(() => {
    const button = document.querySelector('#export-gif')
    const pngButton = document.querySelector('#export-png')
    const shareButton = document.querySelector('#copy-share-link')
    if (!button || !pngButton || !shareButton) throw new Error('Footer export controls were not found')

    const overlay = document.querySelector('.export-overlay')
    window.__gifExportSmoke = {
      overlaySeen: overlay?.dataset.open === 'true',
      competingActionsDisabledSeen: false,
      labels: []
    }
    const sample = () => {
      const label = button.textContent?.trim() ?? ''
      if (window.__gifExportSmoke.labels.at(-1) !== label) window.__gifExportSmoke.labels.push(label)
      if (overlay?.dataset.open === 'true') window.__gifExportSmoke.overlaySeen = true
      if (button.disabled && pngButton.disabled && shareButton.disabled) {
        window.__gifExportSmoke.competingActionsDisabledSeen = true
      }
    }
    const observer = new MutationObserver(sample)
    observer.observe(button, { attributes: true, childList: true, characterData: true, subtree: true })
    observer.observe(pngButton, { attributes: true, attributeFilter: ['disabled', 'aria-busy'] })
    observer.observe(shareButton, { attributes: true, attributeFilter: ['disabled', 'aria-busy'] })
    if (overlay) observer.observe(overlay, { attributes: true, attributeFilter: ['data-open', 'aria-hidden'] })
    sample()
    button.click()
    return true
  })()`)

  const download = await waitForDownload()
  if (download.filename !== expectedFilename) {
    throw new Error(`GIF export used unexpected filename: ${download.filename}`)
  }

  const parsed = parseGif(await readFile(download.path))
  if (parsed.width !== 512 || parsed.height !== 512) {
    throw new Error(`GIF export has unexpected dimensions ${parsed.width}×${parsed.height}`)
  }
  if (parsed.frames !== 54) {
    throw new Error(`GIF export encoded ${parsed.frames} frames; expected 54`)
  }
  if (parsed.delays.length !== parsed.frames || parsed.delays.some((delay) => delay <= 0)) {
    throw new Error(`GIF export has invalid frame delays: ${parsed.delays.length} delays for ${parsed.frames} frames`)
  }
  if (!parsed.looping) throw new Error('GIF export omitted its looping application extension')
  if (!parsed.trailer) throw new Error('GIF export omitted the GIF trailer')

  const restored = await waitForValue(
    send,
    `(() => {
      const button = document.querySelector('#export-gif')
      const pngButton = document.querySelector('#export-png')
      const shareButton = document.querySelector('#copy-share-link')
      const overlay = document.querySelector('.export-overlay')
      return {
        mode: document.body.dataset.mode,
        label: button?.textContent?.trim() ?? null,
        buttonDisabled: button?.disabled ?? true,
        pngDisabled: pngButton?.disabled ?? true,
        shareDisabled: shareButton?.disabled ?? true,
        inputDisabled: document.querySelector('#qr-input')?.disabled ?? true,
        overlayHidden: !overlay || overlay.getAttribute('aria-hidden') === 'true',
        overlaySeen: window.__gifExportSmoke?.overlaySeen ?? false,
        competingActionsDisabledSeen: window.__gifExportSmoke?.competingActionsDisabledSeen ?? false,
        labels: window.__gifExportSmoke?.labels ?? []
      }
    })()`,
    (value) => value?.mode === 'art'
      && value?.label === 'EXPORT GIF'
      && value?.buttonDisabled === false
      && value?.pngDisabled === false
      && value?.shareDisabled === false
      && value?.inputDisabled === false
      && value?.overlayHidden === true
      && value?.overlaySeen === true
      && value?.competingActionsDisabledSeen === true,
    'GIF export state restoration',
    10_000,
  )

  if (!restored.labels.some((label) => /^GIF\s+\d+%$/.test(label))) {
    throw new Error(`GIF export never exposed frame progress: ${restored.labels.join(' -> ')}`)
  }
  if (!restored.labels.some((label) => label.startsWith('EXPORTED'))) {
    throw new Error(`GIF export never exposed completion feedback: ${restored.labels.join(' -> ')}`)
  }

  console.log(
    `gif export browser smoke: ${download.filename} / ${download.bytes} bytes / ${parsed.width}×${parsed.height} / `
      + `${parsed.frames} frames / ${parsed.delays[0]} cs delay / looping / competing actions locked / UI restored`,
  )
} finally {
  socket?.close()
  await Promise.all([stopProcess(chrome), stopProcess(preview)])
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 })
}
