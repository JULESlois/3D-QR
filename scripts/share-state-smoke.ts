import { decodeShareHash, encodeShareHash, type ShareState } from '../src/share-state'

const state: ShareState = {
  payload: 'https://example.com/path?q=voxel qr&lang=中文',
  style: 'city',
  palette: 'spectrum',
}

const hash = encodeShareHash(state)
const decoded = decodeShareHash(hash)

if (decoded.payload !== state.payload) throw new Error('Share payload did not round-trip')
if (decoded.style !== state.style) throw new Error('Share style did not round-trip')
if (decoded.palette !== state.palette) throw new Error('Share palette did not round-trip')

const invalid = decodeShareHash('#q=hello&s=not-a-style&p=invalid')
if (invalid.payload !== 'hello') throw new Error('Valid share payload was discarded')
if (invalid.style !== undefined) throw new Error('Invalid style should be ignored')
if (invalid.palette !== undefined) throw new Error('Invalid palette should be ignored')

const empty = decodeShareHash('#q=&s=tree&p=blossom')
if (empty.payload !== undefined) throw new Error('Blank payload should be ignored')
if (empty.style !== 'tree' || empty.palette !== 'blossom') {
  throw new Error('Valid style/palette should survive a blank payload')
}

console.log(`share-state smoke: ${hash.length} chars / codec round-trip passed`)
