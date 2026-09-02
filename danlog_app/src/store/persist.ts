import type { Candidate, CandidateStatus, Prediction, Scaffold } from './workbench'

/**
 * Session persistence in localStorage.
 *
 * We save a SEED, not the state. Every candidate carries an SVG of a few
 * kilobytes and a 256-byte fingerprint, and a board of thirty would push past
 * the storage quota for data we can regenerate exactly. RDKit is
 * deterministic, so recomputing on load is both cheaper and safer than
 * trusting a stale cache -- and it means a change to how we compute properties
 * cannot leave old numbers lying around.
 */

const KEY = 'analog.workbench.v1'

type SavedCandidate = {
  id: string
  smiles: string
  rationale: string
  source: Candidate['source']
  status: CandidateStatus
  prediction: Prediction | null
  parentId: string | null
  createdAt: number
  decidedAt: number | null
}

export type Saved = {
  version: 1
  goal: string
  scaffold: Scaffold | null
  focusSmiles: string | null
  focusId: string | null
  candidates: SavedCandidate[]
}

export function toSeed(state: {
  goal: string
  scaffold: Scaffold | null
  focusSmiles: string | null
  focusId: string | null
  candidates: Candidate[]
}): Saved {
  return {
    version: 1,
    goal: state.goal,
    scaffold: state.scaffold,
    focusSmiles: state.focusSmiles,
    focusId: state.focusId,
    candidates: state.candidates.map((c) => ({
      id: c.id,
      smiles: c.smiles,
      rationale: c.rationale,
      source: c.source,
      status: c.status,
      prediction: c.prediction,
      parentId: c.parentId,
      createdAt: c.createdAt,
      decidedAt: c.decidedAt,
    })),
  }
}

/**
 * Writes are best-effort. A full or disabled localStorage (private windows,
 * blocked site data) must never take the app down -- losing persistence is an
 * inconvenience, throwing during a design session is not.
 */
export function save(seed: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seed))
  } catch {
    /* quota exceeded or storage unavailable; the session still works */
  }
}

export function load(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Saved
    // Anything not written by this exact version is discarded rather than
    // guessed at. A wrong board is worse than an empty one.
    if (parsed?.version !== 1 || !Array.isArray(parsed.candidates)) return null
    return parsed
  } catch {
    return null
  }
}

export function clear(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do */
  }
}
