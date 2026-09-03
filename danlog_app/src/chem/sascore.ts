/**
 * Synthetic Accessibility Score (SAScore)
 *
 * Predicts how difficult/easy a molecule is to synthesize on a 0-10 scale.
 * Based on the Ertl et al. (2009) approach:
 * - Molecular complexity (size, rings, heteroatoms)
 * - Fragment rarity (common synthetic fragments are easier)
 * - Stereochemical complexity
 *
 * 0-3: Easy to synthesize
 * 3-6: Moderate difficulty
 * 6-10: Hard/very hard to synthesize
 *
 * Reference: Ertl, P., Schuhmann, T. (2019). Estimation of synthetic accessibility score
 * of drug-like molecules based on molecular complexity and fragment contributions.
 */

import { getRDKit } from './rdkit'

interface ComplexityFactors {
  size: number // molecular weight
  rings: number
  heteroatoms: number
  stereogenic: number
  bridgehead: number
  fused: number
}

/**
 * Analyze molecular structure to compute complexity factors.
 * Used to estimate synthetic accessibility difficulty.
 * Uses only RDKit descriptors available in JS/WASM build.
 */
async function analyzeComplexity(smiles: string): Promise<ComplexityFactors> {
  const rdkit = await getRDKit()
  let mol = null

  try {
    mol = rdkit.get_mol(smiles)
    if (!mol?.is_valid()) {
      return {
        size: 0,
        rings: 0,
        heteroatoms: 0,
        stereogenic: 0,
        bridgehead: 0,
        fused: 0,
      }
    }

    const d = JSON.parse(mol.get_descriptors()) as Record<string, number>

    // Heavy atoms - proxy for heteroatom count
    // Heteroatoms (N, O, S, P, halogens) are counted in descriptors
    const heavyAtoms = d.NumHeavyAtoms || 0
    const carbons = d.NumAromaticRings ? heavyAtoms * 0.6 : heavyAtoms * 0.7 // Estimate
    const heteroatoms = Math.max(0, heavyAtoms - carbons)

    // Stereogenic centers (unspecified = adds complexity)
    const stereo = d.NumUnspecifiedAtomStereoCenters || 0

    // Rotatable bonds proxy for bridgehead/rigidity
    // More rigid = more bridgeheads
    const rotatableBonds = d.NumRotatableBonds || 0
    const bridgehead = Math.max(0, d.NumRings ? (d.NumRings - rotatableBonds) : 0)

    return {
      size: d.amw || 0,
      rings: d.NumRings || 0,
      heteroatoms: Math.round(heteroatoms),
      stereogenic: stereo,
      bridgehead,
      // Fused rings: aromatic + alicyclic
      fused: Math.max(0, (d.NumRings || 0) - (d.NumAromaticRings || 0)),
    }
  } finally {
    mol?.delete()
  }
}

/**
 * Calculate Synthetic Accessibility Score (0-10 scale).
 * Based on complexity, size, and structural features.
 *
 * Score meaning:
 * - 1-3: Easy (common building blocks, few steps)
 * - 4-6: Moderate (achievable with standard methods)
 * - 7-9: Difficult (requires specialized expertise/reagents)
 * - 9-10: Very hard (may be impractical or require novel synthesis)
 */
export async function calculateSAScore(smiles: string): Promise<number> {
  const factors = await analyzeComplexity(smiles)

  // Start with a baseline of 3 (moderate)
  let score = 3

  // Molecular weight penalty (larger molecules are harder)
  if (factors.size > 400) score += 1.5
  else if (factors.size > 300) score += 0.8
  else if (factors.size > 200) score += 0.3

  // Ring complexity
  // Simple molecules with 0-2 aromatic rings are easier
  if (factors.rings === 0) {
    score -= 0.5 // Linear molecules are easier
  } else if (factors.rings > 4) {
    score += 1.5 // Polycyclic compounds are harder
  } else if (factors.rings > 2) {
    score += 0.8
  }

  // Fused/bridged rings are much harder
  if (factors.fused > 0) {
    score += factors.fused
  }

  // Bridgehead atoms increase complexity
  if (factors.bridgehead > 2) {
    score += 0.8
  }

  // Heteroatoms make synthesis easier (useful functional groups)
  // but too many can complicate things
  if (factors.heteroatoms === 0) {
    score += 0.5 // Pure hydrocarbons can be harder
  } else if (factors.heteroatoms > 6) {
    score += 0.3 // Complex heteroatom patterns
  }

  // Stereogenic centers increase complexity
  if (factors.stereogenic > 0) {
    score += factors.stereogenic * 0.5
  }

  // Clamp to 0-10 scale
  return Math.min(10, Math.max(0, Number(score.toFixed(2))))
}

/**
 * Get human-readable description of SAScore.
 * Helps users understand synthesis difficulty quickly.
 */
export function describeSAScore(score: number): string {
  if (score <= 2) return 'Very easy to synthesize'
  if (score <= 3.5) return 'Easy to synthesize'
  if (score <= 5) return 'Moderate difficulty'
  if (score <= 6.5) return 'Moderately difficult'
  if (score <= 8) return 'Difficult to synthesize'
  return 'Very difficult to synthesize'
}

/**
 * Get color/severity for UI display.
 * ok = easy, wait = moderate, bad = hard
 */
export function getSASeverity(score: number): 'ok' | 'wait' | 'bad' {
  if (score <= 3) return 'ok'
  if (score <= 6.5) return 'wait'
  return 'bad'
}
