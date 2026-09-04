import { fetchConformer, knownConformer, rememberConformer } from '../chem/threed'

/**
 * Turning a molecule into a 3D picture a report can carry.
 *
 * The on-screen viewer is a live WebGL canvas and a document cannot hold one,
 * so each molecule is rendered once into an offscreen viewer and read back as
 * a PNG. `preserveDrawingBuffer` is the reason this works at all: without it
 * the browser is free to discard the buffer the moment the frame is composited
 * and the read-back comes out blank.
 *
 * Fetching coordinates sends the structure to a public service, so nothing
 * here happens without a human asking for it.
 */

type CaptureViewer = {
  addModel: (data: string, format: string) => void
  setStyle: (selector: object, style: object) => void
  setBackgroundColor: (color: string, alpha?: number) => void
  zoomTo: () => void
  render: () => void
  pngURI: () => string
  clear: () => void
}

/**
 * Window.$3Dmol is declared by Viewer3D with the subset it needs. Redeclaring
 * it here would conflict, so the extra methods this module uses are reached
 * through a local cast instead.
 */
type Factory = { createViewer: (element: HTMLElement, config: object) => CaptureViewer }
const factory = (): Factory | null => (window.$3Dmol as unknown as Factory | undefined) ?? null

let library: Promise<void> | null = null

function loadLibrary(): Promise<void> {
  if (!library) {
    library = new Promise<void>((resolve, reject) => {
      if (window.$3Dmol) return resolve()
      const script = document.createElement('script')
      script.src = '/vendor/3Dmol-min.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load the 3D viewer bundle.'))
      document.head.appendChild(script)
    }).catch((error: Error) => {
      library = null
      throw error
    })
  }
  return library
}

/** Rendered images, keyed by canonical SMILES. Session only, like conformers. */
const images = new Map<string, string>()

export const knownImage3d = (smiles: string): string | null => images.get(smiles) ?? null

/** How many of these molecules already have coordinates, so nothing is fetched. */
export function cachedCount(smilesList: string[]): number {
  return smilesList.filter((s) => knownConformer(s) !== null).length
}

const SIZE = 420

/**
 * One molecule, drawn offscreen and read back. Returns null rather than
 * throwing: a missing picture should cost a report a figure, not the report.
 */
export async function captureImage3d(
  smiles: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cached = images.get(smiles)
  if (cached) return cached

  let host: HTMLDivElement | null = null
  let viewer: CaptureViewer | null = null

  try {
    let conformer = knownConformer(smiles)
    if (!conformer) {
      conformer = await fetchConformer(smiles, signal ?? new AbortController().signal)
      rememberConformer(smiles, conformer)
    }

    await loadLibrary()
    const make = factory()
    if (!make) return null

    // Offscreen but laid out: a zero-size or display:none container gives the
    // renderer no dimensions and produces an empty image.
    host = document.createElement('div')
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${SIZE}px;height:${SIZE}px;`
    document.body.appendChild(host)

    viewer = make.createViewer(host, {
      backgroundColor: 'white',
      preserveDrawingBuffer: true,
    })
    viewer.addModel(conformer.sdf, 'sdf')
    viewer.setStyle({}, { stick: { radius: 0.15 }, sphere: { scale: 0.26 } })
    viewer.zoomTo()
    viewer.render()

    const uri = viewer.pngURI()
    // A blank canvas still encodes to a valid but tiny data URI.
    if (!uri || uri.length < 1000) return null
    images.set(smiles, uri)
    return uri
  } catch {
    return null
  } finally {
    viewer?.clear()
    host?.remove()
  }
}

/**
 * Captures a list in sequence rather than in parallel. Several WebGL contexts
 * at once is how a browser starts dropping them, and the coordinate service is
 * a free one that does not deserve a burst.
 */
export async function captureAll3d(
  smilesList: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, string>> {
  const unique = [...new Set(smilesList)]
  const out = new Map<string, string>()
  for (const [i, smiles] of unique.entries()) {
    const uri = await captureImage3d(smiles)
    if (uri) out.set(smiles, uri)
    onProgress?.(i + 1, unique.length)
  }
  return out
}
