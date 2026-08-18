import { createRequire } from 'node:module'
import type * as GifencModule from 'gifenc'

const require = createRequire(import.meta.url)
const { GIFEncoder, applyPalette, quantize } = require('gifenc') as typeof GifencModule

const width = 2
const height = 2
const firstFrame = new Uint8Array([
  242, 240, 231, 255,
  32, 35, 31, 255,
  239, 127, 159, 255,
  32, 35, 31, 255,
])
const secondFrame = new Uint8Array([
  32, 35, 31, 255,
  242, 240, 231, 255,
  32, 35, 31, 255,
  111, 149, 164, 255,
])

const combinedPixels = new Uint8Array(firstFrame.length + secondFrame.length)
combinedPixels.set(firstFrame)
combinedPixels.set(secondFrame, firstFrame.length)
const palette = quantize(combinedPixels, 8)
const firstIndexed = applyPalette(firstFrame, palette)
const secondIndexed = applyPalette(secondFrame, palette)
const gif = GIFEncoder()

gif.writeFrame(firstIndexed, width, height, { palette, delay: 50, repeat: 0 })
gif.writeFrame(secondIndexed, width, height, { palette, delay: 80 })
gif.finish()

const output = gif.bytes()
const signature = String.fromCharCode(...output.slice(0, 6))
const trailer = output[output.length - 1]
const encodedWidth = output[6] | (output[7] << 8)
const encodedHeight = output[8] | (output[9] << 8)
const ascii = String.fromCharCode(...output)

let imageDescriptorCount = 0
const frameDelays: number[] = []
for (let index = 0; index < output.length; index += 1) {
  if (output[index] === 0x2c) imageDescriptorCount += 1

  if (
    output[index] === 0x21
    && output[index + 1] === 0xf9
    && output[index + 2] === 0x04
  ) {
    frameDelays.push(output[index + 4] | (output[index + 5] << 8))
  }
}

if (signature !== 'GIF89a' || trailer !== 0x3b || output.length < 64) {
  throw new Error('gifenc smoke test produced an invalid GIF89a stream')
}
if (encodedWidth !== width || encodedHeight !== height) {
  throw new Error(`gifenc smoke test encoded ${encodedWidth}x${encodedHeight}; expected ${width}x${height}`)
}
if (imageDescriptorCount !== 2) {
  throw new Error(`gifenc smoke test encoded ${imageDescriptorCount} image frames; expected 2`)
}
if (frameDelays.length !== 2 || frameDelays.some((delay) => delay <= 0)) {
  throw new Error(`gifenc smoke test produced invalid frame delays: ${frameDelays.join(', ')}`)
}
if (!ascii.includes('NETSCAPE2.0') && !ascii.includes('ANIMEXTS1.0')) {
  throw new Error('gifenc smoke test omitted the looping application extension')
}

console.log(
  `gif smoke: ${signature} / ${output.length} bytes / ${imageDescriptorCount} frames / `
  + `${frameDelays.join(',')} cs delays / looping`,
)
