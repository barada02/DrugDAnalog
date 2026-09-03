/**
 * P-glycoprotein (MDR1) Efflux Prediction
 *
 * Predicts if a molecule will be pumped OUT of the brain by P-gp,
 * even if it crosses the blood-brain barrier.
 *
 * Critical for neurological drugs—many molecules cross BBB but
 * are immediately exported, reducing brain exposure.
 *
 * References:
 * - Csépe, K., et al. (2020). "Current Approaches to Predict Drug Transport"
 */

import type { Properties } from './properties'

export interface PGpProfile {
  effluxProbability: number // 0-100, likelihood of P-gp substrate
  netBrainPenetration: number // BBB crossing after accounting for efflux
  substrate: 'high affinity' | 'moderate' | 'low affinity' | 'unlikely'
  concern: string
}

/**
 * Predict P-gp efflux likelihood.
 *
 * P-gp substrates typically have:
 * - Moderate to high lipophilicity (1.5 < logP < 5)
 * - Aromatic rings
 * - Hydrogen bond acceptors/donors
 * - Molecular weight 300-600
 *
 * Classic P-gp substrates: verapamil, digoxin, daun

omycin, taxol
 */
export function predictPGpEfflux(properties: Properties): PGpProfile {
  let effluxScore = 30 // Baseline for average molecule

  // === Lipophilicity (logP) ===
  // P-gp prefers moderately lipophilic compounds (1-4)
  if (properties.logP > 1.5 && properties.logP < 4.5) {
    effluxScore += 30 // High risk
  } else if (properties.logP > 4.5) {
    effluxScore += 15 // Very lipophilic, good substrate
  } else if (properties.logP < 0) {
    effluxScore -= 20 // Too hydrophilic, poor substrate
  }

  // === Molecular Weight ===
  // P-gp recognizes large molecules (300-600)
  if (properties.mw > 300 && properties.mw < 600) {
    effluxScore += 20
  } else if (properties.mw > 600) {
    effluxScore += 10 // Very large, sometimes substrate
  } else if (properties.mw < 250) {
    effluxScore -= 15 // Too small
  }

  // === Aromatic Rings ===
  // P-gp recognizes aromatic substrates
  if (properties.aromaticRings > 1) {
    effluxScore += 15
  }

  // === Hydrogen Bonding ===
  // Multiple H-bond acceptors = P-gp substrate feature
  if (properties.hba > 3) {
    effluxScore += 10
  }

  // === Flexibility ===
  // More rigid molecules are better P-gp substrates
  if (properties.rotatableBonds < 5) {
    effluxScore += 5
  }

  // === TPSA ===
  // Moderate TPSA (40-130) = good substrate
  if (properties.tpsa > 40 && properties.tpsa < 130) {
    effluxScore += 8
  }

  // === Fsp3 ===
  // Both flat and 3D can be substrates
  if (properties.fsp3 > 0.3 && properties.fsp3 < 0.7) {
    effluxScore += 5
  }

  // Normalize
  effluxScore = Math.min(100, Math.max(0, effluxScore))

  // Determine substrate type
  let substrate: PGpProfile['substrate']
  if (effluxScore > 70) substrate = 'high affinity'
  else if (effluxScore > 50) substrate = 'moderate'
  else if (effluxScore > 30) substrate = 'low affinity'
  else substrate = 'unlikely'

  // Concern message
  const concern = generatePGpConcern(substrate, effluxScore, properties)

  return {
    effluxProbability: effluxScore,
    netBrainPenetration: calculateNetBrainPenetration(effluxScore),
    substrate,
    concern,
  }
}

/**
 * Calculate net brain penetration after accounting for P-gp efflux.
 *
 * If P-gp efflux probability is high, the net penetration is reduced
 * significantly.
 */
function calculateNetBrainPenetration(pgpProbability: number): number {
  // If high efflux probability, dramatic reduction in brain levels
  // Even if BBB crossing is 70%, if P-gp exports 80%, net is 14%

  // Assume 50% baseline BBB crossing for moderate molecule
  const baseBBB = 50

  // With efflux, effective penetration drops
  const survivalRate = 1 - pgpProbability / 100 // If 70% efflux, 30% survives
  const netPenetration = baseBBB * survivalRate

  return Math.round(netPenetration)
}

function generatePGpConcern(
  substrate: PGpProfile['substrate'],
  _score: number,
  _props: Properties,
): string {
  if (substrate === 'high affinity') {
    return `⚠️ Strong P-gp substrate—will be actively exported from brain despite BBB crossing. Net brain penetration severely reduced.`
  } else if (substrate === 'moderate') {
    return `⚠️ Moderate P-gp substrate—may be partially exported from brain, reducing neurological effectiveness.`
  } else if (substrate === 'low affinity') {
    return `✓ Low P-gp substrate risk—likely to reach and remain in brain tissue.`
  } else {
    return `✓ Unlikely P-gp substrate—should have good brain penetration if BBB crossing achieved.`
  }
}

/**
 * Get severity for UI.
 * High efflux = bad (molecule won't stay in brain).
 */
export function getPGpSeverity(probability: number): 'ok' | 'wait' | 'bad' {
  if (probability < 30) return 'ok'
  if (probability < 60) return 'wait'
  return 'bad'
}

/**
 * Clinical note for highly effluxed substrates.
 */
export function getPGpClinicalNote(probability: number): string | null {
  if (probability > 70) {
    return 'This molecule may need P-gp inhibition (e.g., coadministration with inhibitors) to achieve brain exposure.'
  }
  if (probability > 50) {
    return 'P-gp interaction possible—monitor for variable brain exposure.'
  }
  return null
}
