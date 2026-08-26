import * as THREE from 'three'

export interface RenderRuntime {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  renderer: THREE.WebGLRenderer
  presentationGroup: THREE.Group
  sculptureRoot: THREE.Group
  clock: THREE.Clock
  resize: (width: number, height: number) => void
}

export function createRenderRuntime(stage: HTMLElement): RenderRuntime {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50)
  camera.position.set(0, 0, 20)
  camera.lookAt(0, 0, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.08
  renderer.domElement.style.cursor = 'pointer'
  stage.appendChild(renderer.domElement)

  scene.add(new THREE.HemisphereLight(0xfff8e9, 0x6f786a, 2.1))

  const keyLight = new THREE.DirectionalLight(0xffead5, 3.0)
  keyLight.position.set(-4.5, 6.5, 10)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xc8ddff, 0.7)
  fillLight.position.set(5, 2, 8)
  scene.add(fillLight)

  const presentationGroup = new THREE.Group()
  scene.add(presentationGroup)

  const sculptureRoot = new THREE.Group()
  presentationGroup.add(sculptureRoot)

  return {
    scene,
    camera,
    renderer,
    presentationGroup,
    sculptureRoot,
    clock: new THREE.Clock(),
    resize(width: number, height: number): void {
      renderer.setSize(Math.max(1, width), Math.max(1, height), false)
    },
  }
}
