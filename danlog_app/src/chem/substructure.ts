import type { JSMol } from '@rdkit/rdkit'
import { getRDKit, InvalidSmilesError } from './rdkit'

export class InvalidSmartsError extends Error {
  constructor(smarts: string) {
    super('Not a valid SMARTS pattern: ' + JSON.stringify(smarts))
    this.name = 'InvalidSmartsError'
  }
}

/**
 * Atom indices of the first match, or null when the pattern is absent.
 *
 * Both the molecule and the query are C++ objects on the emscripten heap, so
 * both are deleted here regardless of how this exits.
 */
export async function matchSmarts(smiles: string, smarts: string): Promise<number[] | null> {
  const rdkit = await getRDKit()
  let mol: JSMol | null = null
  let query: JSMol | null = null
  try {
    try {
      mol = rdkit.get_mol(smiles)
    } catch {
      throw new InvalidSmilesError(smiles)
    }
    if (!mol || !mol.is_valid()) throw new InvalidSmilesError(smiles)

    try {
      query = rdkit.get_qmol(smarts)
    } catch {
      throw new InvalidSmartsError(smarts)
    }
    if (!query) throw new InvalidSmartsError(smarts)

    const hit = JSON.parse(mol.get_substruct_match(query)) as { atoms?: number[] }
    return hit.atoms ?? null
  } finally {
    mol?.delete()
    query?.delete()
  }
}

export async function countMatches(smiles: string, smarts: string): Promise<number> {
  const rdkit = await getRDKit()
  let mol: JSMol | null = null
  let query: JSMol | null = null
  try {
    mol = rdkit.get_mol(smiles)
    if (!mol || !mol.is_valid()) throw new InvalidSmilesError(smiles)
    query = rdkit.get_qmol(smarts)
    if (!query) throw new InvalidSmartsError(smarts)
    const hits = JSON.parse(mol.get_substruct_matches(query)) as { atoms?: number[] }[] | false
    return Array.isArray(hits) ? hits.length : 0
  } finally {
    mol?.delete()
    query?.delete()
  }
}
