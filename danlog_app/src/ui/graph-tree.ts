import type { Candidate } from '../store/workbench'

/**
 * Shaping the board into a tree, kept separate from drawing it.
 *
 * The renderer pulls in React Flow, which is worth its weight on the Evolution
 * page and nowhere else. Keeping the data shape here means the Evolution page
 * can build a tree without that cost landing in the initial bundle.
 */
export type GraphNode = {
  id: string
  candidate: Candidate | null
  children: GraphNode[]
}

/**
 * Candidates with no parent hang off the origin, and anything whose parent is
 * missing is re-rooted there too rather than vanishing from the picture.
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
