import { readFile } from 'node:fs/promises'

const [
  html,
  main,
  appInteractions,
  exportControls,
  appUi,
  uiControls,
  sceneSwipe,
  styles,
  pngExport,
  gifExport,
  exportScene,
  shareState,
  projectionView,
] = await Promise.all([
  readFile('index.html', 'utf8'),
  readFile('src/main.ts', 'utf8'),
  readFile('src/app-interactions.ts', 'utf8'),
  readFile('src/export-controls.ts', 'utf8'),
  readFile('src/app-ui.ts', 'utf8'),
  readFile('src/ui-controls.ts', 'utf8'),
  readFile('src/scene-swipe.ts', 'utf8'),
  readFile('src/styles.css', 'utf8'),
  readFile('src/png-export.ts', 'utf8'),
  readFile('src/gif-export.ts', 'utf8'),
  readFile('src/export-scene.ts', 'utf8'),
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
for (const [source, label] of [
  [main, 'src/main.ts'],
  [appInteractions, 'src/app-interactions.ts'],
  [exportControls, 'src/export-controls.ts'],
  [appUi, 'src/app-ui.ts'],
  [uiControls, 'src/ui-controls.ts'],
]) {
  forbidText(source, "document.createElement('button')", label)
  forbidText(source, 'document.createElement("button")', label)
  forbidText(source, "document.createElement('nav')", label)
  forbidText(source, 'document.createElement("nav")', label)
  forbidText(source, "document.createElement('style')", label)
  forbidText(source, 'document.createElement("style")', label)
}

// main.ts owns render/sculpture orchestration. app-interactions.ts owns application-level
// DOM commands while app-ui.ts owns static DOM bindings and presentation/busy state.
requireText(main, 'createAppUiController()', 'src/main.ts')
requireText(main, 'bindAppInteractions({', 'src/main.ts')
requireText(appInteractions, "context.pointerSurface.addEventListener('click'", 'src/app-interactions.ts')
requireText(appInteractions, 'document.addEventListener(PROJECTION_VIEW_REQUEST_EVENT', 'src/app-interactions.ts')
requireText(appInteractions, "context.styleRow.addEventListener('click'", 'src/app-interactions.ts')
requireText(appInteractions, "context.input.addEventListener('input'", 'src/app-interactions.ts')
requireText(appInteractions, 'new AbortController()', 'src/app-interactions.ts')
requireText(appInteractions, 'window.setTimeout(() => context.rebuild(context.input.value), 180)', 'src/app-interactions.ts')
for (const text of [
  "renderer.domElement.addEventListener('click'",
  'document.addEventListener(PROJECTION_VIEW_REQUEST_EVENT',
  "styleRow.addEventListener('click'",
  "input.addEventListener('input'",
  'let rebuildTimer =',
]) {
  forbidText(main, text, 'src/main.ts interaction ownership')
}
requireText(appUi, "requiredElement<HTMLButtonElement>('#export-gif')", 'src/app-ui.ts')
requireText(appUi, "requiredElement<HTMLButtonElement>('#export-png')", 'src/app-ui.ts')
requireText(appUi, "requiredElement<HTMLButtonElement>('#copy-share-link')", 'src/app-ui.ts')
forbidText(main, "requiredElement<HTMLButtonElement>('#export-gif')", 'src/main.ts')
forbidText(main, "requiredElement<HTMLButtonElement>('#export-png')", 'src/main.ts')
requireText(uiControls, "requiredElement<HTMLButtonElement>('#export-gif')", 'src/ui-controls.ts')
requireText(styles, '.footer-actions', 'src/styles.css')
requireText(styles, '.export-overlay', 'src/styles.css')

// Keyboard navigation belongs to the scene behavior controller so it shares changeSceneBy()
// with visible arrows and scene-transition/busy guards. scene-swipe.ts remains gesture-only.
requireText(uiControls, "document.addEventListener('keydown'", 'src/ui-controls.ts')
requireText(uiControls, "event.key === 'ArrowRight' ? 1 : -1", 'src/ui-controls.ts')
requireText(uiControls, "target.matches('input, textarea, select, [contenteditable=\"true\"]')", 'src/ui-controls.ts')
requireText(uiControls, 'sceneButtons.some((button) => button.disabled)', 'src/ui-controls.ts')
requireText(uiControls, 'event.preventDefault()', 'src/ui-controls.ts')
forbidText(sceneSwipe, "document.addEventListener('keydown'", 'src/scene-swipe.ts')
requireText(sceneSwipe, "sceneCurrent.addEventListener('pointerdown'", 'src/scene-swipe.ts')

// Interactive/hash consumers request an exact Art/QR pose through a semantic command.
// Export controls settle transient palette state, then exporters clone the current render
// hierarchy and mutate only that snapshot so capture cannot corrupt the live presentation.
requireText(projectionView, "PROJECTION_VIEW_REQUEST_EVENT = 'projection-view-request'", 'src/projection-view.ts')
requireText(appInteractions, 'document.addEventListener(PROJECTION_VIEW_REQUEST_EVENT', 'src/app-interactions.ts')
requireText(main, 'bindExportControls({', 'src/main.ts')
forbidText(main, 'void exportPngPair({', 'src/main.ts')
forbidText(main, 'void exportRevealGif({', 'src/main.ts')
requireText(exportControls, 'context.finishPaletteTransition()', 'src/export-controls.ts')
requireText(exportControls, 'void exportPngPair({', 'src/export-controls.ts')
requireText(exportControls, 'void exportRevealGif({', 'src/export-controls.ts')
requireText(exportScene, 'scene.clone(true)', 'src/export-scene.ts')
requireText(exportScene, 'InstancedMesh.clone()', 'src/export-scene.ts')
for (const [source, label] of [[pngExport, 'src/png-export.ts'], [gifExport, 'src/gif-export.ts']]) {
  requireText(source, 'createExportSceneSnapshot(', label)
  requireText(source, 'presentationGroup: livePresentationGroup', label)
  requireText(source, 'sculptureRoot: liveSculptureRoot', label)
  requireText(source, 'exportSnapshot.presentationGroup', label)
  requireText(source, 'exportSnapshot.sculptureRoot', label)
  forbidText(source, 'pauseAnimation', label)
  forbidText(source, 'resumeAnimation', label)
  forbidText(source, 'liveSculptureRoot.quaternion.', label)
  forbidText(source, 'livePresentationGroup.position.', label)
  forbidText(source, 'livePresentationGroup.scale.', label)
  forbidText(source, 'livePresentationGroup.rotation.', label)
}
forbidText(main, 'pauseAnimation:', 'src/main.ts')
forbidText(main, 'resumeAnimation:', 'src/main.ts')

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

console.log('ui architecture smoke: static shell, app UI ownership, app interaction ownership, scene interaction ownership, export control ownership, export hierarchy, stylesheet ownership, projection commands, and isolated export scene ownership passed')
