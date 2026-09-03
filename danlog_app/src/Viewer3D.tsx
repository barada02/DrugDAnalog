import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchConformer, knownConformer, rememberConformer, SOURCE_LABEL } from './chem/threed'
import type { Conformer } from './chem/threed'
import { shapeFromSdf } from './chem/shape'
import type { Shape } from './chem/shape'
import { useWorkbench } from './store/workbench'

/**
 * The 3D view, and the only part of this app that talks to the network.
 *
 * Three rules it exists under:
 *   - a human clicks, every time, per molecule
 *   - the warning is visible BEFORE the click, not after
 *   - no WebMCP tool can reach any of this
 */

type Viewer3DApi = {
  addModel: (data: string, format: string) => void
  setStyle: (selector: object, style: object) => void
  zoomTo: () => void
  render: () => void
  clear: () => void
  resize: () => void
}

declare global {
  interface Window {
    $3Dmol?: {
      createViewer: (element: HTMLElement, config: object) => Viewer3DApi
    }
  }
}

/** 538 KB, so it loads on opt-in only and never enters the main bundle. */
let viewerLibrary: Promise<void> | null = null
function loadViewerLibrary(): Promise<void> {
  viewerLibrary ??= new Promise((resolve, reject) => {
    if (window.$3Dmol) return resolve()
    const script = document.createElement('script')
    script.src = '/vendor/3Dmol-min.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load the 3D viewer bundle.'))
    document.head.appendChild(script)
  })
  return viewerLibrary
}

type Status = 'idle' | 'working' | 'ready' | 'error'

export function Viewer3D({ smiles }: { smiles: string }) {
  const mount = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState<Status>(() => (knownConformer(smiles) ? 'ready' : 'idle'))
  const [conformer, setConformer] = useState<Conformer | null>(() => knownConformer(smiles))
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  const note = useWorkbench((s) => s.note)

  // Derived, not synchronised. The caller remounts this on a new molecule with
  // a key, so the state initialisers above handle the reset.
  const shape: Shape | null = useMemo(
    () => (conformer ? shapeFromSdf(conformer.sdf) : null),
    [conformer],
  )

  // Auto-fetch 3D coordinates when component mounts and no cached conformer exists
  useEffect(() => {
    if (status !== 'idle' || knownConformer(smiles)) return
    const autoFetch = async () => {
      setStatus('working')
      setError(null)
      const controller = new AbortController()
      try {
        const result = await fetchConformer(smiles, controller.signal)
        rememberConformer(smiles, result)
        setConformer(result)
        setStatus('ready')
        note({ actor: 'human', tool: 'fetch_3d', detail: `auto-fetched via ${result.source}`, ok: true })
      } catch (e) {
        setError((e as Error).message)
        setStatus('error')
        note({ actor: 'human', tool: 'fetch_3d', detail: `auto-fetch failed: ${(e as Error).message}`, ok: false })
      }
    }
    autoFetch()
  }, [smiles, status, note])

  // Draw whenever we have both a conformer and somewhere to put it.
  useEffect(() => {
    if (status !== 'ready' || !conformer || !mount.current || !window.$3Dmol) return
    const viewer = window.$3Dmol.createViewer(mount.current, { backgroundColor: 'white' })
    viewer.addModel(conformer.sdf, 'sdf')
    viewer.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.24 } })
    viewer.zoomTo()
    viewer.render()
    return () => viewer.clear()
  }, [status, conformer])

  const fetchIt = async () => {
    setStatus('working')
    setError(null)
    const controller = new AbortController()
    try {
      const [, result] = await Promise.all([
        loadViewerLibrary(),
        fetchConformer(smiles, controller.signal),
      ])
      rememberConformer(smiles, result)
      setConformer(result)
      setStatus('ready')
      note({ actor: 'human', tool: 'fetch_3d', detail: `${smiles} via ${result.source}`, ok: true })
    } catch (e) {
      setError((e as Error).message)
      setStatus('error')
      note({ actor: 'human', tool: 'fetch_3d', detail: (e as Error).message, ok: false })
    }
  }

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>3D structure</h2>
        <button
          className="info-btn"
          title="About 3D coordinates"
          onClick={() => setShowInfo(!showInfo)}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
        >
          ℹ
        </button>
      </div>

      {showInfo && (
        <p className="hint" style={{ marginBottom: '12px' }}>
          RDKit cannot generate 3D coordinates in the browser, so they are automatically fetched from a public NIH service (CACTUS, falling back to PubChem). Everything else stays on your machine.
        </p>
      )}

      {status === 'working' && (
        <div className="splash splash--inline">
          <div className="spinner" />
          <p>Generating 3D structure...</p>
        </div>
      )}

      {status === 'error' && (
        <>
          <p className="error">{error}</p>
          <button onClick={() => void fetchIt()}>Try again</button>
        </>
      )}

      {status === 'ready' && conformer && (
        <>
          <div className="viewer3d" ref={mount} />
          <p className="hint hint--mark">
            Source: {SOURCE_LABEL[conformer.source]} &middot; {conformer.atoms} atoms with
            hydrogens. Drag to rotate.
          </p>
          {shape && (
            <>
              <dl className="props">
                <div className="props__cell props__cell--estimated" title="Normalised principal moment ratios">
                  <dt>NPR1</dt><dd>{shape.npr1}</dd>
                </div>
                <div className="props__cell props__cell--estimated">
                  <dt>NPR2</dt><dd>{shape.npr2}</dd>
                </div>
                <div className="props__cell props__cell--estimated" title="Longest interatomic distance">
                  <dt>Span</dt><dd>{shape.span}</dd>
                </div>
              </dl>
              <p className="hint">
                Shape: <strong>{shape.descriptor}</strong>. Computed exactly from these
                coordinates &mdash; but they are <em>one</em> conformer out of many this
                molecule can adopt, so treat the shape as indicative, not settled.
              </p>
            </>
          )}
        </>
      )}
    </section>
  )
}
