import { readFile } from 'node:fs/promises'

const [html, main, uiControls, styles, pngExport, shareState, projectionView] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('src/main.ts', 'utf8'),
  readFile('src/ui-controls.ts', 'utf8'),
  readFile('src/styles.css', 'utf8'),
  readFile('src/png-export.ts', 'utf8'),
  readFile('src/share-state.ts', 'utf8'),
  readFile('src/projection-view.ts', 'utf8'),
])

function requireText(source, text, label) {
  if (!source.includes(text)) throw new Error(`${label} is missing ${JSON.stringify(text)}`)
}

function forbidText(source, text, label) {
  if (source.includes(text)) throw new Error(`${label} must not contain ${JSON.stringify(text)}`)
}

function sliceBetween(source, start, end, label) {
  const startIndex = source.indexOf(start)
  if (startIndex < 0) throw new Error(`${label} start marker ${JSON.stringify(start)} was not found`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  if (endIndex < 0) throw new Error(`${label} end marker ${JSON.stringify(end)} was not found`)
  return source.slice(startIndex, endIndex)
}

const staticShell = [
  'class="scene-window"',
  'class="scene-dock"',
  'class="panel-restore-toggle"',
  'class="export-overlay"',
  'class="footer-actions"',
  'id="export-gif"',
  'id="export-png"',
  'id="copy-share-link"',
]
for (const marker of staticShell) requireText(html, marker, 'index.html static UI shell')

const footerActions = sliceBetween(html, '<div class="footer-actions">', '</div>', 'footer actions')
for (const id of ['export-gif', 'export-png', 'copy-share-link']) {
  requireText(footerActions, `id="${id}"`, 'footer actions')
}

const paletteControl = sliceBetween(html, '<div class="palette-control">', '</div>', 'palette control')
for (const id of ['export-gif', 'export-png', 'copy-share-link']) {
  forbidText(paletteControl, `id="${id}"`, 'palette control')
}

// UI structure belongs in static HTML. Runtime scripts may bind state/events, but they
// should not regress to rebuilding the shell or injecting style elements.
for (const [source, label] of [[main, 'src/main.ts'], [uiControls, 'src/ui-controls.ts']]) {
  forbidText(source, "document.createElement('button')", label)
  forbidText(source, 'document.createElement("button")', label)
  forbidText(source, "document.createElement('nav')", label)
  forbidText(source, 'document.createElement("nav")', label)
  forbidText(source, "document.createElement('style')", label)
  forbidText(source, 'document.createElement("style")', label)
}

requireText(main, "requiredElement<HTMLButtonElement>('#export-gif')", 'src/main.ts')
requireText(main, "requiredElement<HTMLButtonElement>('#export-png')", 'src/main.ts')
requireText(uiControls, "requiredElement<HTMLButtonElement>('#export-gif')", 'src/ui-controls.ts')
requireText(styles, '.footer-actions', 'src/styles.css')
requireText(styles, '.export-overlay', 'src/styles.css')

// Interactive/hash consumers request an exact Art/QR pose through a semantic command.
// PNG export is different: it owns an offscreen square renderer and receives both final
// quaternions directly, so it must not drive or wait for the live projection view.
requireText(projectionView, "PROJECTION_VIEW_REQUEST_EVENT = 'projection-view-request'", 'src/projection-view.ts')
requireText(main, 'document.addEventListener(PROJECTION_VIEW_REQUEST_EVENT', 'src/main.ts')
requireText(main, 'void exportPngPair({', 'src/main.ts')
requireText(pngExport, 'artQuaternion: THREE.Quaternion', 'src/png-export.ts')
requireText(pngExport, 'qrQuaternion: THREE.Quaternion', 'src/png-export.ts')
requireText(pngExport, 'new THREE.WebGLRenderer({', 'src/png-export.ts')
forbidText(pngExport, 'requestProjectionView(', 'src/png-export.ts')
forbidText(pngExport, 'document.body.dataset.mode', 'src/png-export.ts')
requireText(shareState, 'requestProjectionView(state.view!)', 'src/share-state.ts')
for (const [source, label] of [[pngExport, 'src/png-export.ts'], [shareState, 'src/share-state.ts']]) {
  forbidText(source, "new MouseEvent('click'", label)
  forbidText(source, 'new MouseEvent("click"', label)
}

console.log('ui architecture smoke: static shell, export hierarchy, stylesheet ownership, projection commands, and offscreen PNG ownership passed')