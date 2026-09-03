/**
 * Metabolic Stability Prediction
 *
 * Predicts how quickly a drug will be metabolized by the liver.
 * Based on structural features that correlate with metabolism rate.
 *
 * References:
 * - Obach, R. S. (1999). "Prediction of Human Clearance of Twenty Drugs from Hepatic Clearance Data"
 * - Smith, D. A., et al. (2010). "Pharmacokinetics and Metabolism in Drug Design"
 */

import type { Properties } from './properties'

export interface MetabolicProfile {
  stabilityScore: number // 0-100, higher = more stable
  halfLife: 'very short' | 'short' | 'moderate' | 'long' | 'very long'
  metabolismRate: 'very fast' | 'fast' | 'moderate' | 'slow' | 'very slow'
  softSites: string[]
  cyp450Likely: boolean
  estimatedClipClCrit: string // Predicted clearance category
}

/**
 * Calculate metabolic stability score (0-100).
 * Estimates how quickly the liver will metabolize the drug.
 *
 * Factors considered:
 * - Molecular weight (larger = harder to metabolize)
 * - Lipophilicity (logP - very lipophilic drugs metabolized differently)
 * - Rotatable bonds (flexible = more sites for metabolism)
 * - Aromatic rings (sites of oxidative metabolism)
 * - Heteroatoms (sites for conjugation metabolism)
 * - Heteroatom density (more heteroatoms = more sites)
 *
 * Score meaning:
 * - 0-25: Very fast metabolism (minutes)
 * - 25-50: Fast metabolism (hours)
 * - 50-75: Moderate metabolism (hours-days)
 * - 75-90: Slow metabolism (days)
 * - 90-100: Very slow metabolism (very stable)
 */
export function calculateMetabolicStability(properties: Properties): MetabolicProfile {
  let score = 50 // Start at neutral

  // === Molecular Weight Impact ===
  // Very small molecules (<200) are metabolized quickly
  // Larger molecules (>500) are metabolized more slowly
  if (properties.mw < 200) {
    score -= 15
  } else if (properties.mw < 300) {
    score -= 8
  } else if (properties.mw > 500) {
    score += 5
  } else if (properties.mw > 450) {
    score += 2
  }

  // === Lipophilicity (logP) Impact ===
  // Moderate logP (1.5-3) = good substrate for CYP
  // Very lipophilic or hydrophilic = harder to metabolize
  if (Math.abs(properties.logP - 2.0) < 1.0) {
    score -= 10 // Perfect substrate for CYP
  } else if (properties.logP > 4 || properties.logP < 0) {
    score += 8 // Outlier logP = harder to metabolize
  }

  // === Rotatable Bonds ===
  // More flexible molecules have more sites exposed to metabolism
  if (properties.rotatableBonds > 10) {
    score -= 15 // Highly flexible, many metabolic sites
  } else if (properties.rotatableBonds > 6) {
    score -= 8
  } else if (properties.rotatableBonds < 2) {
    score += 5 // Very rigid, fewer sites
  }

  // === Aromatic Rings ===
  // Aromatic rings are sites for oxidative metabolism (Phase I)
  if (properties.aromaticRings > 2) {
    score -= 10 // Multiple aromatic rings = rapid metabolism
  } else if (properties.aromaticRings === 2) {
    score -= 5
  } else if (properties.aromaticRings === 0) {
    score += 5 // Aliphatic = slower oxidative metabolism
  }

  // === Heteroatom Content ===
  // Heteroatoms (N, O, S) are sites for Phase I and Phase II metabolism
  const heteroatoms = properties.heavyAtoms - (properties.mw * 0.12) // Rough estimate
  if (heteroatoms > 5) {
    score -= 12 // Many heteroatoms = many conjugation sites
  } else if (heteroatoms > 3) {
    score -= 6
  }

  // === Fsp3 (3D character) ===
  // More 3D character = more shielded from metabolism
  if (properties.fsp3 > 0.4) {
    score += 8
  } else if (properties.fsp3 > 0.2) {
    score += 3
  }

  // === TPSA (Polar Surface Area) ===
  // Very polar molecules: may be excluded from metabolism
  // TPSA > 140 = poor absorption = metabolized less
  if (properties.tpsa > 140) {
    score += 10 // Too polar to be absorbed/metabolized efficiently
  } else if (properties.tpsa > 100) {
    score += 5
  } else if (properties.tpsa < 20) {
    score -= 5 // Very apolar = easy substrate
  }

  // === Number of Rings ===
  // Polycyclic compounds are slower to metabolize (harder to access)
  if (properties.rings > 4) {
    score += 12
  } else if (properties.rings > 2) {
    score += 6
  }

  // Clamp to 0-100
  score = Math.min(100, Math.max(0, score))

  // === Determine Categories ===
  let halfLife: MetabolicProfile['halfLife']
  if (score < 25) halfLife = 'very short' // Minutes
  else if (score < 50) halfLife = 'short' // ~1 hour
  else if (score < 70) halfLife = 'moderate' // ~6 hours
  else if (score < 85) halfLife = 'long' // ~24 hours
  else halfLife = 'very long' // >24 hours

  let metabolismRate: MetabolicProfile['metabolismRate']
  if (score < 25) metabolismRate = 'very fast'
  else if (score < 50) metabolismRate = 'fast'
  else if (score < 70) metabolismRate = 'moderate'
  else if (score < 85) metabolismRate = 'slow'
  else metabolismRate = 'very slow'

  const cyp450Likely = properties.logP >= 1.0 && properties.logP <= 4.0

  return {
    stabilityScore: Math.round(score),
    halfLife,
    metabolismRate,
    softSites: identifySoftSites(properties),
    cyp450Likely,
    estimatedClipClCrit: estimateClearance(score),
  }
}

/**
 * Identify structural features likely to be metabolized.
 */
function identifySoftSites(properties: Properties): string[] {
  const sites: string[] = []

  // Aliphatic positions near heteroatoms
  if (properties.rotatableBonds > 4) {
    sites.push('Aliphatic carbons')
  }

  // Aromatic rings subject to oxidation
  if (properties.aromaticRings > 0) {
    sites.push('Aromatic rings (hydroxylation)')
  }

  // Ether/ester groups (oxidative cleavage)
  if (properties.mw > 200 && properties.heavyAtoms > 10) {
    sites.push('Ether/ester groups')
  }

  // N-oxidation sites
  if (properties.hba > 2) {
    sites.push('Nitrogen atoms (N-oxidation)')
  }

  // S-oxidation sites
  if (properties.mw > 300 && properties.tpsa < 100) {
    sites.push('Sulfur atoms (S-oxidation)')
  }

  return sites.length > 0 ? sites : ['Standard CYP metabolism sites']
}

/**
 * Estimate hepatic clearance category.
 */
function estimateClearance(score: number): string {
  if (score < 20) return 'High clearance (>15 mL/min/kg)'
  if (score < 40) return 'Moderate-high clearance (10-15 mL/min/kg)'
  if (score < 60) return 'Moderate clearance (5-10 mL/min/kg)'
  if (score < 75) return 'Low-moderate clearance (2-5 mL/min/kg)'
  return 'Low clearance (<2 mL/min/kg)'
}

/**
 * Get human-readable description of metabolic stability.
 */
export function describeMetabolicStability(profile: MetabolicProfile): string {
  const halfLifeEmoji = {
    'very short': '⚡',
    short: '🔥',
    moderate: '⚙️',
    long: '⏱️',
    'very long': '⏳',
  }

  return `${halfLifeEmoji[profile.halfLife]} ${profile.halfLife} half-life — ${profile.metabolismRate} metabolism`
}

/**
 * Get severity for UI display.
 */
export function getMetabolicStabilitySeverity(
  score: number,
): 'ok' | 'wait' | 'bad' {
  if (score >= 60) return 'ok' // Stable
  if (score >= 40) return 'wait' // Moderate
  return 'bad' // Very fast metabolism
}
