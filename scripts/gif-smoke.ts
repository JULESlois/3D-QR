import { GIFEncoder, applyPalette, quantize } from 'gifenc'

const width = 2
const height = 2
const rgba = new Uint8Array([
  242, 240, 231, 255,
  32, 35, 31, 255,
  239, 127, 159, 255,
  32, 35, 31, 255,
])

const palette = quantize(rgba, 8)
const indexed = applyPalette(rgba, palette)
const gif = GIFEncoder()

gif.writeFrame(indexed, width, height, { palette, delay: 50, repeat: 0 })
gif.writeFrame(indexed, width, height, { palette, delay: 50 })
gif.finish()

const output = gif.bytes()
const signature = String.fromCharCode(...output.slice(0, 6))
const trailer = output[output.length - 1]

if (!signature.startsWith('GIF8') || trailer !== 0x3b || output.length < 32) {
  throw new Error('gifenc smoke test produced an invalid GIF stream')
}

console.log(`gif smoke: ${signature} / ${output.length} bytes / valid trailer`)
