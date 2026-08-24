import { decodeShareHash, encodeShareHash, type ShareState } from '../src/share-state'

const state: ShareState = {
  payload: 'https://example.com/path?q=voxel qr&lang=中文',
  style: 'city',
  palette: 'spectrum',
  view: 'qr',
}

const hash = encodeShareHash(state)
const decoded = decodeShareHash(hash)

if (decoded.payload !== state.payload) throw new Error('Share payload did not round-trip')
if (decoded.style !== state.style) throw new Error('Share style did not round-trip')
if (decoded.palette !== state.palette) throw new Error('Share palette did not round-trip')
if (decoded.view !== state.view) throw new Error('Share projection view did not round-trip')

const invalid = decodeShareHash('#q=hello&s=not-a-style&p=invalid&v=sideways')
if (invalid.payload !== 'hello') throw new Error('Valid share payload was discarded')
if (invalid.style !== undefined) throw new Error('Invalid style should be ignored')
if (invalid.palette !== undefined) throw new Error('Invalid palette should be ignored')
if (invalid.view !== undefined) throw new Error('Invalid projection view should be ignored')

const empty = decodeShareHash('#q=&s=tree&p=blossom&v=art')
if (empty.payload !== undefined) throw new Error('Blank payload should be ignored')
if (empty.style !== 'tree' || empty.palette !== 'blossom' || empty.view !== 'art') {
  throw new Error('Valid style/palette/view should survive a blank payload')
}

const legacy = decodeShareHash('#q=legacy&s=forest&p=summer')
if (legacy.payload !== 'legacy' || legacy.style !== 'forest' || legacy.palette !== 'summer') {
  throw new Error('Legacy share hash without a view should remain readable')
}
if (legacy.view !== undefined) throw new Error('Legacy share hash should not invent a projection view')

console.log(`share-state smoke: ${hash.length} chars / codec round-trip passed with projection view`)
