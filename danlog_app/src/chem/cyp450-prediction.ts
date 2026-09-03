/**
 * CYP450 Enzyme Substrate Prediction
 *
 * Predicts which cytochrome P450 enzymes are likely to metabolize a drug.
 * Based on published substrate specificity patterns.
 *
 * References:
 * - Ogilvie, B. W., et al. (2006). "Identification of the Functional Domains of Cytochrome P450 Enzymes"
 * - Jaime-Figueroa, J. C., et al. (2008). "Using CYP450 Prediction to Guide Drug Design"
 */

import type { Properties } from './properties'

export interface CYP450Profile {
  cyp3a4: { likelihood: number; reason: string } // Most common (30-40% of drugs)
  cyp2d6: { likelihood: number; reason: string } // Important (20% of drugs)
  cyp2c9: { likelihood: number; reason: string } // Moderate (10% of drugs)
  cyp2c19: { likelihood: number; reason: string } // Moderate (5% of drugs)
  cyp1a2: { likelihood: number; reason: string } // Smaller percentage
  dominantEnzyme: 'CYP3A4' | 'CYP2D6' | 'CYP2C9' | 'CYP2C19' | 'CYP1A2' | 'other'
}

/**
 * Predict CYP450 substrate specificity.
 *
 * Each CYP has different substrate preferences:
 * - CYP3A4: Large, lipophilic, basic compounds
 * - CYP2D6: Basic, planar, aromatic compounds
 * - CYP2C9: Acidic, highly lipophilic compounds
 * - CYP2C19: Less selective, various substrates
 * - CYP1A2: Planar aromatic hydrocarbons
 */
export function predictCYP450Profile(properties: Properties): CYP450Profile {
  // Start with baseline probabilities (reflect population prevalence)
  let cyp3a4 = 20 // Most common enzyme
  let cyp2d6 = 15 // Important for amines
  let cyp2c9 = 10 // Acidic substrates
  let cyp2c19 = 8 // General
  let cyp1a2 = 5 // Specific substrates

  // === CYP3A4 Substrate Prediction ===
  // Prefers: Large (MW 300-600), lipophilic (logP 2-6), basic
  if (properties.mw > 300 && properties.mw < 600) cyp3a4 += 20
  else if (properties.mw > 200) cyp3a4 += 10

  if (properties.logP > 1.5 && properties.logP < 5) cyp3a4 += 15
  else if (properties.logP > 5) cyp3a4 -= 10 // Too lipophilic may affect absorption

  if (properties.hba > 3) cyp3a4 += 8 // Hydrogen bonding = CYP3A4 substrate
  if (properties.rotatableBonds > 5) cyp3a4 += 5 // Flexibility

  // === CYP2D6 Substrate Prediction ===
  // Prefers: Basic amines (pKa 8-12), planar, aromatic
  if (properties.hba >= 2 && properties.hba <= 6) cyp2d6 += 20 // Nitrogen in right range
  if (properties.aromaticRings >= 2) cyp2d6 += 15 // Aromatic preference
  if (properties.mw < 400) cyp2d6 += 10 // Smaller substrates

  if (properties.logP < 0 || properties.logP > 5) cyp2d6 -= 10 // Extreme logP not ideal

  // === CYP2C9 Substrate Prediction ===
  // Prefers: Acidic compounds, highly lipophilic
  if (properties.logP > 3.5) cyp2c9 += 20 // Very lipophilic
  if (properties.tpsa < 100) cyp2c9 += 10 // Not too polar

  if (properties.rotatableBonds < 5) cyp2c9 += 8 // Relatively rigid

  // === CYP2C19 Substrate Prediction ===
  // General, less selective
  if (properties.logP > 2 && properties.logP < 4) cyp2c19 += 10
  if (properties.mw > 200 && properties.mw < 400) cyp2c19 += 8

  // === CYP1A2 Substrate Prediction ===
  // Prefers: Planar aromatics, polycyclic
  if (properties.aromaticRings > 2) cyp1a2 += 15
  if (properties.fsp3 < 0.2) cyp1a2 += 10 // Planar molecules

  // === General metabolic accessibility ===
  // If molecule is very hydrophilic (TPSA > 150), all CYPs reduced
  if (properties.tpsa > 150) {
    cyp3a4 *= 0.6
    cyp2d6 *= 0.5
    cyp2c9 *= 0.4
    cyp2c19 *= 0.5
    cyp1a2 *= 0.3
  }

  // If molecule is very hydrophobic, CYP3A4 advantage
  if (properties.logP > 5) {
    cyp3a4 += 10
  }

  // Normalize to 0-100
  cyp3a4 = Math.min(100, Math.max(0, cyp3a4))
  cyp2d6 = Math.min(100, Math.max(0, cyp2d6))
  cyp2c9 = Math.min(100, Math.max(0, cyp2c9))
  cyp2c19 = Math.min(100, Math.max(0, cyp2c19))
  cyp1a2 = Math.min(100, Math.max(0, cyp1a2))

  // Determine dominant enzyme
  const scores = {
    CYP3A4: cyp3a4,
    CYP2D6: cyp2d6,
    CYP2C9: cyp2c9,
    CYP2C19: cyp2c19,
    CYP1A2: cyp1a2,
  }
  const dominantEnzyme = Object.entries(scores).reduce((a, b) =>
    a[1] > b[1] ? a : b,
  )[0] as keyof typeof scores

  return {
    cyp3a4: {
      likelihood: Math.round(cyp3a4),
      reason: getCYP3A4Reason(properties, cyp3a4),
    },
    cyp2d6: {
      likelihood: Math.round(cyp2d6),
      reason: getCYP2D6Reason(properties, cyp2d6),
    },
    cyp2c9: {
      likelihood: Math.round(cyp2c9),
      reason: getCYP2C9Reason(properties, cyp2c9),
    },
    cyp2c19: {
      likelihood: Math.round(cyp2c19),
      reason: getCYP2C19Reason(properties, cyp2c19),
    },
    cyp1a2: {
      likelihood: Math.round(cyp1a2),
      reason: getCYP1A2Reason(properties, cyp1a2),
    },
    dominantEnzyme,
  }
}

// === Reason Generators ===

function getCYP3A4Reason(props: Properties, likelihood: number): string {
  if (likelihood < 30) return 'Poor substrate for CYP3A4'
  if (props.mw > 500) return 'Large, lipophilic substrate (typical CYP3A4)'
  if (props.logP > 3) return 'Lipophilic molecule (CYP3A4 common)'
  return 'Possible CYP3A4 substrate'
}

function getCYP2D6Reason(props: Properties, likelihood: number): string {
  if (likelihood < 30) return 'Poor substrate for CYP2D6'
  if (props.hba >= 2 && props.aromaticRings >= 1) return 'Basic amine + aromatic (CYP2D6 target)'
  if (props.aromaticRings >= 2) return 'Planar aromatic (typical CYP2D6)'
  return 'Potential CYP2D6 substrate'
}

function getCYP2C9Reason(props: Properties, likelihood: number): string {
  if (likelihood < 30) return 'Poor substrate for CYP2C9'
  if (props.logP > 4) return 'Highly lipophilic (CYP2C9 preference)'
  return 'Possible CYP2C9 substrate'
}

function getCYP2C19Reason(props: Properties, likelihood: number): string {
  if (likelihood < 30) return 'Low probability for CYP2C19'
  return 'Possible CYP2C19 substrate (less selective)'
}

function getCYP1A2Reason(props: Properties, likelihood: number): string {
  if (likelihood < 30) return 'Poor substrate for CYP1A2'
  if (props.fsp3 < 0.2 && props.aromaticRings > 1) return 'Planar polycyclic (CYP1A2 specific)'
  return 'Possible CYP1A2 substrate'
}

/**
 * Get severity for UI display based on drug-drug interaction risk.
 */
export function getCYP450Severity(
  profile: CYP450Profile,
): 'ok' | 'wait' | 'bad' {
  const topLikelihood =
    Math.max(
      profile.cyp3a4.likelihood,
      profile.cyp2d6.likelihood,
      profile.cyp2c9.likelihood,
    ) || 0

  if (topLikelihood > 70) return 'bad' // High likelihood = drug-drug interaction risk
  if (topLikelihood > 50) return 'wait' // Moderate
  return 'ok' // Low risk
}

/**
 * Check if enzyme is clinically important and has inhibitor concerns.
 */
export function getClinicallySensitiveEnzyme(
  profile: CYP450Profile,
): string | null {
  if (profile.cyp2d6.likelihood > 60) return 'CYP2D6 (many known inhibitors)'
  if (profile.cyp2c19.likelihood > 60) return 'CYP2C19 (genetic polymorphisms)'
  if (profile.cyp3a4.likelihood > 70) return 'CYP3A4 (high interaction risk)'
  return null
}
