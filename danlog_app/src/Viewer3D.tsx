import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  if (!viewerLibrary) {
    viewerLibrary = new Promise<void>((resolve, reject) => {
      if (window.$3Dmol) return resolve()
      const script = document.createElement('script')
      script.src = '/vendor/3Dmol-min.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load the 3D viewer bundle.'))
      document.head.appendChild(script)
    }).catch((error: Error) => {
      // Clear the cache so a retry can try again. Holding a rejected promise
      // here would make "Try again" permanently useless.
      viewerLibrary = null
      throw error
    })
  }
  return viewerLibrary
}

type Status = 'idle' | 'working' | 'ready' | 'error'

export function Viewer3D({
  smiles,
  compact = false,
  showShape = true,
  onShape,
}: {
  smiles: string
  compact?: boolean
  /** Hidden when the caller renders the descriptors somewhere of its own. */
  showShape?: boolean
  /** Reports the shape up, so it can be displayed away from the viewer. */
  onShape?: (shape: Shape | null) => void
}) {
  const mount = useRef<HTMLDivElement | null>(null)
  const viewer = useRef<Viewer3DApi | null>(null)
  const [status, setStatus] = useState<Status>(() => (knownConformer(smiles) ? 'ready' : 'idle'))
  const [conformer, setConformer] = useState<Conformer | null>(() => knownConformer(smiles))
  const [error, setError] = useState<string | null>(null)
  const [showInfo, setShowInfo] = useState(false)
  // The draw effect cannot run until 3Dmol is on the page. Tracking that as
  // state is what re-triggers the draw once the bundle lands -- without it a
  // cached conformer renders into an empty box.
  const [libReady, setLibReady] = useState(() => Boolean(window.$3Dmol))
  const [libError, setLibError] = useState<string | null>(null)
  const note = useWorkbench((s) => s.note)

  // Derived, not synchronised. The caller remounts this on a new molecule with
  // a key, so the state initialisers above handle the reset.
  const shape: Shape | null = useMemo(
    () => (conformer ? shapeFromSdf(conformer.sdf) : null),
    [conformer],
  )

  // Reported through a ref so the effect fires on the shape changing and never
  // on the callback's identity. A caller passing an inline arrow would
  // otherwise re-run this every render, and each run sets the caller's state.
  const onShapeRef = useRef(onShape)
  useEffect(() => {
    onShapeRef.current = onShape
  })

  // Null until a conformer lands, which is what lets a panel elsewhere say
  // "not fetched yet" rather than showing a stale molecule's numbers.
  useEffect(() => {
    onShapeRef.current?.(shape)
  }, [shape])

  /**
   * The viewer bundle, fetched alongside the coordinates rather than before
   * them. Keeping the two independent means a slow script cannot hold up a
   * conformer that has already arrived.
   */
  useEffect(() => {
    if (libReady) return
    let cancelled = false
    loadViewerLibrary()
      .then(() => {
        if (!cancelled) setLibReady(true)
      })
      .catch((e: Error) => {
        if (!cancelled) setLibError(e.message)
      })
    return () => {
      cancelled = true
    }
  }, [libReady])

  /**
   * Coordinates for this molecule.
   *
   * Keyed on the molecule ALONE. `status` must stay out of the dependency
   * list: the first thing this does is set it, so including it makes the
   * effect tear itself down mid-flight, abort its own request, and then bail
   * on the re-run -- leaving a spinner that never resolves.
   */
  useEffect(() => {
    if (knownConformer(smiles)) return
    let cancelled = false
    const controller = new AbortController()

    const run = async () => {
      setStatus('working')
      setError(null)
      try {
        const result = await fetchConformer(smiles, controller.signal)
        if (cancelled) return
        rememberConformer(smiles, result)
        setConformer(result)
        setStatus('ready')
        note({
          actor: 'human',
          tool: 'fetch_3d',
          detail: `auto-fetched via ${result.source}`,
          ok: true,
        })
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message)
        setStatus('error')
        note({
          actor: 'human',
          tool: 'fetch_3d',
          detail: `auto-fetch failed: ${(e as Error).message}`,
          ok: false,
        })
      }
    }

    void run()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [smiles, note])

  // Draw whenever we have both a conformer and somewhere to put it.
  useEffect(() => {
    if (status !== 'ready' || !conformer || !mount.current || !libReady || !window.$3Dmol) return
    const instance = window.$3Dmol.createViewer(mount.current, { backgroundColor: 'white' })
    instance.addModel(conformer.sdf, 'sdf')
    instance.setStyle({}, { stick: { radius: 0.14 }, sphere: { scale: 0.24 } })
    instance.zoomTo()
    instance.render()
    viewer.current = instance
    return () => {
      instance.clear()
      viewer.current = null
    }
  }, [status, conformer, libReady])

  const resetView = useCallback(() => {
    viewer.current?.zoomTo()
    viewer.current?.render()
  }, [])

  const retry = async () => {
    setStatus('working')
    setError(null)
    setLibError(null)
    // Nudge the bundle again; its own effect handles the happy path.
    loadViewerLibrary()
      .then(() => setLibReady(true))
      .catch((e: Error) => setLibError(e.message))
    const controller = new AbortController()
    try {
      const result = await fetchConformer(smiles, controller.signal)
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

  const body = (
    <>
      {showInfo && (
        <p className="hint" style={{ marginBottom: '12px' }}>
          RDKit cannot generate 3D coordinates in the browser, so they are automatically fetched
          from a public NIH service (CACTUS, falling back to PubChem). Everything else stays on
          your machine.
        </p>
      )}

      {status === 'working' && (
        <div className="splash splash--inline">
          <div className="spinner" />
          <p>Fetching 3D coordinates…</p>
        </div>
      )}

      {status === 'error' && (
        <>
          <p className="error">{error}</p>
          <button className="btn" onClick={() => void retry()}>
            Try again
          </button>
        </>
      )}

      {status === 'ready' && conformer && (
        <>
          <div className="viewer3d" ref={mount}>
            {!libReady && !libError && (
              <div className="viewer3d__pending">
                <div className="spinner" />
              </div>
            )}
          </div>
          {libError && <p className="error">{libError}</p>}
          <div className="viewer3d__bar">
            <span className="hint hint--mark">Drag to rotate · Scroll to zoom</span>
            <button className="linkbtn" onClick={resetView}>
              Reset view
            </button>
          </div>
          <p className="hint">
            Source: {SOURCE_LABEL[conformer.source]} &middot; {conformer.atoms} atoms with
            hydrogens.
          </p>
          {shape && showShape && (
            <>
              <dl className="props props--three">
                <div
                  className="props__cell props__cell--estimated"
                  title="Normalised principal moment ratios"
                >
                  <dt>NPR1</dt>
                  <dd>{shape.npr1}</dd>
                </div>
                <div className="props__cell props__cell--estimated">
                  <dt>NPR2</dt>
                  <dd>{shape.npr2}</dd>
                </div>
                <div
                  className="props__cell props__cell--estimated"
                  title="Longest interatomic distance"
                >
                  <dt>Span</dt>
                  <dd>{shape.span}</dd>
                </div>
              </dl>
              <p className="hint">
                Shape: <strong>{shape.descriptor}</strong>. Computed exactly from these
                coordinates &mdash; but they are <em>one</em> conformer out of many this molecule
                can adopt, so treat the shape as indicative, not settled.
              </p>
            </>
          )}
        </>
      )}
    </>
  )

  // Inside the drawer the surrounding panel and heading already exist.
  if (compact) return <div className="viewer3d__compact">{body}</div>

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>3D structure</h2>
        <button
          className="iconbtn"
          title="About 3D coordinates"
          aria-label="About 3D coordinates"
          onClick={() => setShowInfo(!showInfo)}
        >
          ℹ
        </button>
      </div>
      {body}
    </section>
  )
}
