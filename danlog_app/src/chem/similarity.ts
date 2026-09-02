import { withMol } from './rdkit'

/**
 * Morgan (ECFP-style) fingerprints and Tanimoto similarity.
 *
 * Two questions this answers that properties alone cannot:
 *
 * 1. Did the agent actually make an analog, or did it drift to a different
 *    chemotype while claiming a small change?
 * 2. Are eight candidates eight ideas, or one idea rewritten eight times?
 *
 * Agents are bad at both, and a number settles them.
 */

/** 2048 bits packed into 256 bytes. Bit order is irrelevant to Tanimoto. */
export type Fingerprint = Uint8Array

export async function fingerprint(smiles: string): Promise<Fingerprint> {
  return withMol(smiles, (mol) => mol.get_morgan_fp_as_uint8array())
}

const BITS = new Uint8Array(256)
for (let i = 0; i < 256; i++) BITS[i] = (i & 1) + BITS[i >> 1]

/**
 * Shared bits over total bits set. 1.0 is identical, 0.0 shares nothing.
 * Returns 0 for two empty fingerprints rather than dividing by zero.
 */
export function tanimoto(a: Fingerprint, b: Fingerprint): number {
  let intersection = 0
  let union = 0
  for (let i = 0; i < a.length; i++) {
    intersection += BITS[a[i] & b[i]]
    union += BITS[a[i] | b[i]]
  }
  return union === 0 ? 0 : Number((intersection / union).toFixed(3))
}

export type SimilarityBand =
  | 'near-identical'
  | 'close analog'
  | 'related'
  | 'different scaffold'

/**
 * Conventional reading of ECFP Tanimoto. Rules of thumb, not constants --
 * nothing branches on these, they exist to make a bare number legible.
 */
export function band(score: number): SimilarityBand {
  if (score >= 0.85) return 'near-identical'
  if (score >= 0.6) return 'close analog'
  if (score >= 0.35) return 'related'
  return 'different scaffold'
}

/**
 * How much genuinely different chemistry is on the board: the mean pairwise
 * distance. Low means the agent is circling one idea. Undefined for fewer than
 * two molecules, which is reported as null rather than a misleading zero.
 */
export function diversity(fingerprints: Fingerprint[]): number | null {
  if (fingerprints.length < 2) return null
  let total = 0
  let pairs = 0
  for (let i = 0; i < fingerprints.length; i++) {
    for (let j = i + 1; j < fingerprints.length; j++) {
      total += 1 - tanimoto(fingerprints[i], fingerprints[j])
      pairs++
    }
  }
  return Number((total / pairs).toFixed(3))
}
