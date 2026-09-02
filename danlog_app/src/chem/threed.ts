/**
 * 3D coordinates.
 *
 * This is the one part of the app that touches the network, and it breaks the
 * promise every other part keeps: the structure leaves the browser. That is
 * not a detail to bury -- it is why every path here requires a human click,
 * why no WebMCP tool can trigger it, and why the source is always reported
 * back alongside the result.
 *
 * The reason we cannot avoid it: RDKit's minimal WASM build has no conformer
 * generation. Verified directly -- after `set_new_coords(true)` every z
 * coordinate is still exactly zero. There is nothing to fall back on locally.
 */

/** Where a conformer came from. Always surfaced, never implied. */
export type CoordinateSource = 'cactus' | 'pubchem'

export type Conformer = {
  /** MDL SDF with real 3D coordinates and explicit hydrogens. */
  sdf: string
  source: CoordinateSource
  atoms: number
}

export const SOURCE_LABEL: Record<CoordinateSource, string> = {
  cactus: 'NCI CACTUS (generated)',
  pubchem: 'PubChem (experimental record)',
}

/**
 * Conformers fetched this session, keyed by canonical SMILES.
 *
 * Deliberately NOT persisted: a saved board rebuilds from SMILES alone, and
 * silently restoring network results across sessions would blur the line this
 * feature exists to keep sharp. Read-only access is exposed to tools; nothing
 * outside a human click ever writes here.
 */
const conformers = new Map<string, Conformer>()

export const rememberConformer = (smiles: string, c: Conformer) => conformers.set(smiles, c)
export const knownConformer = (smiles: string): Conformer | null => conformers.get(smiles) ?? null
export const conformerCount = () => conformers.size

export class NoConformerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoConformerError'
  }
}

const cactusUrl = (smiles: string) =>
  `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/file` +
  `?format=sdf&get3d=true`

const pubchemUrl = (smiles: string) =>
  `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(smiles)}` +
  `/SDF?record_type=3d`

/** Atom count from the MDL counts line, and a check that the block is real. */
function atomCount(sdf: string): number {
  const counts = sdf.split('\n')[3]
  const n = counts ? Number.parseInt(counts.slice(0, 3), 10) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Rejects a flat record. A conformer with every z at zero is not 3D. */
function isThreeDimensional(sdf: string): boolean {
  const lines = sdf.split('\n')
  const n = atomCount(sdf)
  if (n === 0) return false
  return lines
    .slice(4, 4 + n)
    .some((line) => Math.abs(Number.parseFloat(line.slice(20, 30))) > 1e-6)
}

async function tryFetch(url: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return null
    const text = await response.text()
    return isThreeDimensional(text) ? text : null
  } catch (error) {
    // An aborted request is the human changing their mind, not a failure.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    return null
  }
}

/**
 * CACTUS first, because it is the only one that works for molecules nobody has
 * made yet -- and agent-generated analogs are by definition not in a database.
 * Verified: PubChem answers a novel structure with
 * `PUGREST.Unimplemented -- Cannot (yet) generate 3D coordinates for structures
 * without an existing CID`, so it is a fallback for known compounds only.
 */
export async function fetchConformer(smiles: string, signal: AbortSignal): Promise<Conformer> {
  const cactus = await tryFetch(cactusUrl(smiles), signal)
  if (cactus) return { sdf: cactus, source: 'cactus', atoms: atomCount(cactus) }

  const pubchem = await tryFetch(pubchemUrl(smiles), signal)
  if (pubchem) return { sdf: pubchem, source: 'pubchem', atoms: atomCount(pubchem) }

  throw new NoConformerError(
    'Neither NCI CACTUS nor PubChem returned 3D coordinates for this structure. ' +
      'Both are free public services with no uptime guarantee, and CACTUS can refuse ' +
      'a structure it cannot build. The 2D view is unaffected.',
  )
}
