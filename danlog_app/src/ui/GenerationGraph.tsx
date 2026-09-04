import { useEffect, useMemo, type ReactNode } from 'react'
import { hierarchy, tree } from 'd3-hierarchy'
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphNode } from './graph-tree'

/**
 * The design tree as a node-link graph.
 *
 * Two libraries doing two jobs. d3-hierarchy computes a tidy tree layout --
 * siblings evenly spaced, subtrees packed without overlap, parents centred
 * over their children -- which is the part that is genuinely hard. React Flow
 * renders and drives it, which is the part that is merely tedious: wheel zoom,
 * panning, fit-to-view, a minimap, and edges that stay attached.
 *
 * Nodes stay ordinary DOM, so a molecule card is still a molecule card rather
 * than a picture of one baked into a canvas.
 */

/** Fixed, because a tidy tree has to know how much room a node occupies. */
const NODE_W = 200
const NODE_H = 214
const GAP_X = 96
const GAP_Y = 26
/** Room above each column for its heading, so the two can never overlap. */
const HEADER_SPACE = 54

type MoleculeData = { content: ReactNode }
type HeaderData = { title: string; sub: string }

function MoleculeNode({ data }: NodeProps<Node<MoleculeData>>) {
  return (
    <>
      <Handle type="target" position={Position.Left} className="graph__handle" />
      <div className="graph__node">{data.content}</div>
      <Handle type="source" position={Position.Right} className="graph__handle" />
    </>
  )
}

function HeaderNode({ data }: NodeProps<Node<HeaderData>>) {
  return (
    <div className="graph__collabel">
      {data.title}
      <span>{data.sub}</span>
    </div>
  )
}

const nodeTypes = { molecule: MoleculeNode, header: HeaderNode }

function Flow({
  root,
  renderNode,
  promotedIds,
}: {
  root: GraphNode
  renderNode: (node: GraphNode, depth: number) => ReactNode
  promotedIds: Set<string>
}) {
  const { fitView } = useReactFlow()

  const { nodes, edges, shape } = useMemo(() => {
    const laid = tree<GraphNode>().nodeSize([NODE_H + GAP_Y, NODE_W + GAP_X])(
      hierarchy<GraphNode>(root, (d) => d.children),
    )

    const placed = laid.descendants()
    const molecules: Node[] = placed.map((n) => ({
      id: n.data.id,
      type: 'molecule',
      // d3 lays a horizontal tree out with x running across and y along, which
      // is the transpose of what the canvas wants.
      position: { x: n.y, y: n.x },
      data: { content: renderNode(n.data, n.depth) } satisfies MoleculeData,
      draggable: false,
      connectable: false,
      width: NODE_W,
      height: NODE_H,
    }))

    // One heading per column, above the topmost node in that column, so a tall
    // column and a short one both get their label clear of the cards.
    const topOf = new Map<number, number>()
    const countOf = new Map<number, number>()
    for (const n of placed) {
      topOf.set(n.depth, Math.min(topOf.get(n.depth) ?? Infinity, n.x))
      countOf.set(n.depth, (countOf.get(n.depth) ?? 0) + 1)
    }

    const headers: Node[] = [...topOf.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([depth, top]) => {
        const count = countOf.get(depth) ?? 0
        return {
          id: `header-${depth}`,
          type: 'header',
          position: { x: depth * (NODE_W + GAP_X), y: top - HEADER_SPACE },
          data: {
            title: depth === 0 ? 'Origin' : `Generation ${depth}`,
            sub: depth === 0 ? 'starting molecule' : `${count} candidate${count === 1 ? '' : 's'}`,
          } satisfies HeaderData,
          draggable: false,
          selectable: false,
          connectable: false,
          width: NODE_W,
        }
      })

    const links: Edge[] = laid.links().map((l) => {
      const promoted = promotedIds.has(l.target.data.id)
      return {
        id: `${l.source.data.id}->${l.target.data.id}`,
        source: l.source.data.id,
        target: l.target.data.id,
        type: 'smoothstep',
        className: promoted ? 'graph__edge--promoted' : 'graph__edge',
        style: { strokeWidth: promoted ? 2.6 : 1.6 },
      }
    })

    return {
      nodes: [...headers, ...molecules],
      edges: links,
      shape: `${topOf.size}:${placed.length}`,
    }
  }, [root, renderNode, promotedIds])

  // Re-frame when the shape of the board changes, not on every re-render, so
  // the view does not jump while you are reading it.
  useEffect(() => {
    const id = window.setTimeout(() => void fitView({ padding: 0.18, duration: 220 }), 0)
    return () => window.clearTimeout(id)
  }, [shape, fitView])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.18 }}
      minZoom={0.25}
      maxZoom={1.75}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesFocusable={false}
      proOptions={{ hideAttribution: true }}
      // A click on a card must inspect the molecule, not select a graph node.
      elementsSelectable={false}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
      <Controls showInteractive={false} />
      {nodes.length > 8 && (
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          nodeColor="#d9d2f5"
          maskColor="rgba(245,246,250,0.72)"
        />
      )}
      <Panel position="top-right">
        <button
          className="btn btn--ghost"
          onClick={() => void fitView({ padding: 0.18, duration: 220 })}
        >
          Fit to view
        </button>
      </Panel>
    </ReactFlow>
  )
}

export function GenerationGraph(props: {
  root: GraphNode
  renderNode: (node: GraphNode, depth: number) => ReactNode
  promotedIds: Set<string>
}) {
  return (
    <div className="graph">
      <ReactFlowProvider>
        <Flow {...props} />
      </ReactFlowProvider>
      <p className="hint">
        Scroll to zoom · drag the background to pan · click a molecule to inspect it
      </p>
    </div>
  )
}
