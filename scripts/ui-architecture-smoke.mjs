import { readFile } from 'node:fs/promises'

const [html, main, uiControls, styles] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('src/main.ts', 'utf8'),
  readFile('src/ui-controls.ts', 'utf8'),
  readFile('src/styles.css', 'utf8'),
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
requireText(uiControls, "requiredElement<HTMLButtonElement>('#export-gif')", 'src/ui-controls.ts')
requireText(styles, '.footer-actions', 'src/styles.css')
requireText(styles, '.export-overlay', 'src/styles.css')

console.log('ui architecture smoke: static scene shell, export hierarchy, and stylesheet ownership passed')
