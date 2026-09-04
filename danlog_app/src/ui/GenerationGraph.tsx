import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { hierarchy, tree } from 'd3-hierarchy'
import type { Candidate } from '../store/workbench'

/**
 * The design tree as an actual node-link graph.
 *
 * Layout comes from d3-hierarchy's tidy-tree algorithm, which is the part that
 * is genuinely hard: siblings evenly spaced, subtrees packed without overlap,
 * parents centred over their children. Everything drawn on top is ours -- the
 * edges are one SVG layer and the nodes are ordinary DOM positioned over it,
 * so a molecule card stays a molecule card rather than becoming a picture of
 * one inside a canvas.
 */

export type GraphNode = {
  id: string
  candidate: Candidate | null
  children: GraphNode[]
}

/** Fixed, because a tidy tree needs to know how much room a node occupies. */
const NODE_W = 186
const NODE_H = 190
const GAP_X = 76
const GAP_Y = 18
const PAD = 28

const ZOOM_MIN = 0.4
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.15

/** A smooth left-to-right connector between two node edges. */
function edgePath(sx: number, sy: number, tx: number, ty: number): string {
  const mid = sx + (tx - sx) / 2
  return `M${sx},${sy} C${mid},${sy} ${mid},${ty} ${tx},${ty}`
}

export function GenerationGraph({
  root,
  renderNode,
  promotedIds,
}: {
  root: GraphNode
  renderNode: (node: GraphNode, depth: number) => ReactNode
  /** Edges into a promoted molecule are drawn as the spine. */
  promotedIds: Set<string>
}) {
  const [zoom, setZoom] = useState(1)
  // The cursor is rendered output, so it has to be state. A ref read during
  // render would never re-render and the grab cursor would never change.
  const [panning, setPanning] = useState(false)
  const surface = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const layout = useMemo(() => {
    // nodeSize is [across, along] for a horizontal tree: the first value spaces
    // siblings vertically, the second spaces generations horizontally. The
    // layout's return value is what carries resolved coordinates -- reading x
    // and y off the input hierarchy would be reading positions that, as far as
    // the types are concerned, do not exist yet.
    const laid = tree<GraphNode>().nodeSize([NODE_H + GAP_Y, NODE_W + GAP_X])(
      hierarchy<GraphNode>(root, (d) => d.children),
    )

    const nodes = laid.descendants()
    const links = laid.links()

    // d3 centres the root at x=0 and grows in both directions, so shift into
    // positive space before anything is positioned.
    const minX = Math.min(...nodes.map((n) => n.x))
    const maxX = Math.max(...nodes.map((n) => n.x))
    const maxY = Math.max(...nodes.map((n) => n.y))

    const offsetX = -minX + PAD
    const offsetY = PAD

    const placed = nodes.map((n) => ({
      node: n.data,
      depth: n.depth,
      top: n.x + offsetX,
      left: n.y + offsetY,
    }))

    const edges = links.map((l) => ({
      id: `${l.source.data.id}->${l.target.data.id}`,
      promoted: promotedIds.has(l.target.data.id),
      d: edgePath(
        l.source.y + offsetY + NODE_W,
        l.source.x + offsetX + NODE_H / 2,
        l.target.y + offsetY,
        l.target.x + offsetX + NODE_H / 2,
      ),
    }))

    // One label per generation column, placed above the highest node in it.
    const byDepth = new Map<number, number>()
    for (const p of placed) {
      byDepth.set(p.depth, Math.min(byDepth.get(p.depth) ?? Infinity, p.top))
    }
    const columns = [...byDepth.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, top]) => ({
        depth,
        top: top - 26,
        left: depth * (NODE_W + GAP_X) + offsetY,
        count: placed.filter((p) => p.depth === depth).length,
      }))

    return {
      placed,
      edges,
      columns,
      width: maxY + offsetY + NODE_W + PAD,
      height: maxX + offsetX + NODE_H + PAD,
    }
  }, [root, promotedIds])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Let clicks on a node card through; only empty space pans.
    if ((e.target as HTMLElement).closest('[data-graph-node]')) return
    const el = surface.current
    if (!el) return
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop }
    setPanning(true)
    el.setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const el = surface.current
    const start = drag.current
    if (!el || !start) return
    el.scrollLeft = start.left - (e.clientX - start.x)
    el.scrollTop = start.top - (e.clientY - start.y)
  }, [])

  const endDrag = useCallback((e: React.PointerEvent) => {
    drag.current = null
    setPanning(false)
    surface.current?.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div className="graph">
      <div className="graph__controls">
        <button
          className="btn btn--icon"
          onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))}
          disabled={zoom <= ZOOM_MIN}
          aria-label="Zoom out"
          title="Zoom out"
        >
          −
        </button>
        <span className="graph__zoom">{Math.round(zoom * 100)}%</span>
        <button
          className="btn btn--icon"
          onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))}
          disabled={zoom >= ZOOM_MAX}
          aria-label="Zoom in"
          title="Zoom in"
        >
          +
        </button>
        <button className="btn btn--ghost" onClick={() => setZoom(1)} disabled={zoom === 1}>
          Reset
        </button>
      </div>

      <div
        className={'graph__surface' + (panning ? ' graph__surface--dragging' : '')}
        ref={surface}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div
          className="graph__canvas"
          style={{
            width: layout.width * zoom,
            height: layout.height * zoom,
          }}
        >
          <div
            className="graph__scale"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `scale(${zoom})`,
            }}
          >
            <svg className="graph__edges" width={layout.width} height={layout.height}>
              {layout.edges.map((edge) => (
                <path
                  key={edge.id}
                  className={'graph__edge' + (edge.promoted ? ' graph__edge--promoted' : '')}
                  d={edge.d}
                />
              ))}
            </svg>

            {layout.columns.map((col) => (
              <div
                key={col.depth}
                className="graph__collabel"
                style={{ top: col.top, left: col.left, width: NODE_W }}
              >
                {col.depth === 0 ? 'Origin' : `Generation ${col.depth}`}
                <span>{col.depth === 0 ? 'starting molecule' : `${col.count} candidates`}</span>
              </div>
            ))}

            {layout.placed.map((p) => (
              <div
                key={p.node.id}
                data-graph-node
                className="graph__node"
                style={{ top: p.top, left: p.left, width: NODE_W, height: NODE_H }}
              >
                {renderNode(p.node, p.depth)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="hint">Drag the background to pan · {layout.placed.length - 1} candidates</p>
    </div>
  )
}

/**
 * Board into tree. Candidates with no parent hang off the origin, and anything
 * whose parent is missing is re-rooted there too rather than vanishing from the
 * picture entirely.
 */
export function buildGraph(candidates: Candidate[], originId = 'origin'): GraphNode {
  const nodes = new Map<string, GraphNode>()
  for (const c of candidates) nodes.set(c.id, { id: c.id, candidate: c, children: [] })

  const root: GraphNode = { id: originId, candidate: null, children: [] }
  const ordered = [...candidates].sort((a, b) => a.createdAt - b.createdAt)

  for (const c of ordered) {
    const self = nodes.get(c.id)!
    const parent = c.parentId ? nodes.get(c.parentId) : undefined
    // A cycle would make a node its own ancestor; parenting to the root keeps
    // the layout finite rather than recursing forever.
    if (parent && parent.id !== self.id && !isDescendant(self, parent)) parent.children.push(self)
    else root.children.push(self)
  }

  return root
}

function isDescendant(ancestor: GraphNode, maybe: GraphNode): boolean {
  if (ancestor.children.length === 0) return false
  const stack = [...ancestor.children]
  while (stack.length) {
    const next = stack.pop()!
    if (next.id === maybe.id) return true
    stack.push(...next.children)
  }
  return false
}
