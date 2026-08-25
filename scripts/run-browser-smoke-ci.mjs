import { spawn } from 'node:child_process'
import process from 'node:process'

const script = process.argv[2]
if (!script) {
  console.error('Usage: node scripts/run-browser-smoke-ci.mjs <smoke-script>')
  process.exit(2)
}

const RETRYABLE_CDP_TIMEOUT = /Timed out waiting for http:\/\/127\.0\.0\.1:922\d\/json\/version/
const RETRY_DELAY_MS = 1500

function runOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: ['inherit', 'pipe', 'pipe'],
    })
    let output = ''

    const forward = (chunk, stream) => {
      const text = chunk.toString()
      output += text
      stream.write(chunk)
    }

    child.stdout.on('data', (chunk) => forward(chunk, process.stdout))
    child.stderr.on('data', (chunk) => forward(chunk, process.stderr))
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolve({ code: code ?? 1, signal, output })
    })
  })
}

const first = await runOnce()
if (first.code === 0) process.exit(0)

if (!RETRYABLE_CDP_TIMEOUT.test(first.output)) {
  process.exit(first.code)
}

console.error(`Transient Chrome DevTools startup timeout in ${script}; retrying once after ${RETRY_DELAY_MS}ms.`)
await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))

const second = await runOnce()
if (second.code !== 0 && second.signal) {
  console.error(`${script} terminated by ${second.signal} on retry.`)
}
process.exit(second.code)
