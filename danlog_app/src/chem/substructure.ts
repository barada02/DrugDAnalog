import { getRDKit, InvalidSmartsError, InvalidSmilesError } from './rdkit'

/**
 * The result of asking "does this molecule still contain that group?".
 *
 * `atoms` and `bonds` are indices into the molecule, which is exactly what the
 * SVG renderer wants in order to shade the matched region.
 */
export type Match = {
  matched: boolean
  atoms: number[]
  bonds: number[]
  /** How many separate times the pattern appears. Aspirin has one ester, not two. */
  count: number
}

const NO_MATCH: Match = { matched: false, atoms: [], bonds: [], count: 0 }

type RawMatch = { atoms?: number[]; bonds?: number[] }

/**
 * Deliberately NOT written as `withMol(smiles, () => withQMol(...))`.
 *
 * Those helpers free their object in a `finally` that runs the moment the
 * callback returns. Hand one an async callback and it returns a pending
 * promise, the `finally` fires immediately, and the rest of the work runs
 * against freed memory. Both objects are therefore owned by this one scope.
 */
export async function matchPattern(smiles: string, smarts: string): Promise<Match> {
  const rdkit = await getRDKit()
  let mol = null
  let qmol = null
  try {
    try {
      mol = rdkit.get_mol(smiles)
    } catch {
      throw new InvalidSmilesError(smiles)
    }
    if (!mol?.is_valid()) throw new InvalidSmilesError(smiles)

    try {
      qmol = rdkit.get_qmol(smarts)
    } catch {
      throw new InvalidSmartsError(smarts)
    }
    if (!qmol?.is_valid()) throw new InvalidSmartsError(smarts)

    // Returns `{}` for no match, so the atoms key is the thing to test.
    const first = JSON.parse(mol.get_substruct_match(qmol)) as RawMatch
    if (!first.atoms?.length) return NO_MATCH

    const all = JSON.parse(mol.get_substruct_matches(qmol)) as RawMatch[]
    return {
      matched: true,
      atoms: first.atoms,
      bonds: first.bonds ?? [],
      count: Array.isArray(all) ? all.length : 1,
    }
  } finally {
    mol?.delete()
    qmol?.delete()
  }
}

/** Cheap validity check for a pattern the human typed, before we store it. */
export async function isValidPattern(smarts: string): Promise<boolean> {
  if (!smarts.trim()) return false
  const rdkit = await getRDKit()
  let qmol = null
  try {
    qmol = rdkit.get_qmol(smarts)
    return Boolean(qmol?.is_valid())
  } catch {
    return false
  } finally {
    qmol?.delete()
  }
}
