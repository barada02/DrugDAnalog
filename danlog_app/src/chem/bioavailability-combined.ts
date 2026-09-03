/**
 * Combined Oral Bioavailability Prediction (F%)
 *
 * Combines HIA (gut absorption) + metabolic stability + other factors
 * to estimate actual oral bioavailability (F%).
 *
 * Real bioavailability = HIA% × (1 - first-pass metabolism) × absorption window
 */

import type { Properties } from './properties'
import type { MetabolicProfile } from './metabolic-stability'

export interface BioavailabilityEstimate {
  fPercent: number // 0-100, estimated oral bioavailability %
  category: 'excellent' | 'good' | 'moderate' | 'poor' | 'very poor'
  explanation: string
  limitingFactor: string | null // What's the main issue, if any
}

/**
 * Estimate oral bioavailability (F%) combining multiple factors.
 */
export function estimateOralBioavailability(
  properties: Properties,
  metabolicStability: MetabolicProfile,
  hiaScore: number, // From bioavailability.ts (0-100)
): BioavailabilityEstimate {
  // Start with HIA score (absorption through gut)
  let fPercent = hiaScore * 0.01 // Convert percentage to 0-1 scale

  // === First-Pass Metabolism Adjustment ===
  // Metabolic stability score (0-100) represents how much survives metabolism
  // Low stability (fast metabolism) = large first-pass effect
  const survivalRate = 0.3 + (metabolicStability.stabilityScore / 100) * 0.7
  // If stability=0, survivalRate=0.3 (30% survives)
  // If stability=100, survivalRate=1.0 (100% survives)

  fPercent *= survivalRate

  // === Efflux Pump Reduction ===
  // Some molecules are pumped back out
  // Rough estimate: if very lipophilic, efflux is more likely
  let effluxFactor = 1.0
  if (properties.logP > 4) {
    effluxFactor = 0.7 // 30% pumped back
  } else if (properties.logP > 3) {
    effluxFactor = 0.85 // 15% pumped back
  }

  fPercent *= effluxFactor

  // === Absorption Window Considerations ===
  // Molecules that are very hydrophobic may not be well absorbed
  // despite passing HIA test (precipitation risk)
  if (properties.logP > 5 || properties.logP < -1) {
    fPercent *= 0.8
  }

  // === Metabolism by Intestinal Wall ===
  // Gut contains CYP3A4, CYP2D6, etc. (pre-absorption metabolism)
  // If molecule is prone to CYP metabolism and lipophilic, gut metabolism occurs
  if (properties.logP > 2 && metabolicStability.metabolismRate === 'very fast') {
    fPercent *= 0.85
  }

  // Convert back to percentage (0-100)
  fPercent = Math.min(100, Math.max(0, fPercent * 100))

  // Categorize
  let category: BioavailabilityEstimate['category']
  if (fPercent >= 80) category = 'excellent'
  else if (fPercent >= 60) category = 'good'
  else if (fPercent >= 40) category = 'moderate'
  else if (fPercent >= 20) category = 'poor'
  else category = 'very poor'

  // Identify limiting factor
  let limitingFactor: string | null = null
  if (hiaScore < 50) limitingFactor = 'Poor GI absorption (HIA)'
  else if (metabolicStability.stabilityScore < 40) limitingFactor = 'Rapid hepatic metabolism'
  else if (properties.logP > 4.5) limitingFactor = 'Efflux pump risk'
  else if (properties.logP < 0) limitingFactor = 'Too hydrophilic for absorption'

  const explanation = generateExplanation(fPercent, hiaScore, metabolicStability, limitingFactor)

  return {
    fPercent: Math.round(fPercent),
    category,
    explanation,
    limitingFactor,
  }
}

function generateExplanation(
  fPercent: number,
  hiaScore: number,
  metabolic: MetabolicProfile,
  limitingFactor: string | null,
): string {
  const parts: string[] = []

  parts.push(`Predicted oral bioavailability: ${Math.round(fPercent)}%`)
  parts.push(`(HIA: ${hiaScore}% × Metabolism survival: ${metabolic.stabilityScore}%)`)

  if (limitingFactor) {
    parts.push(`⚠️ Limiting factor: ${limitingFactor}`)
  }

  if (fPercent > 70) {
    parts.push('✅ Good oral absorption expected')
  } else if (fPercent > 40) {
    parts.push('⚠️ Moderate oral absorption—variable bioavailability')
  } else {
    parts.push(
      '❌ Poor oral absorption—consider alternative formulation or route',
    )
  }

  return parts.join('\n')
}

/**
 * Get color severity for UI.
 */
export function getBioavailabilitySeverity(
  fPercent: number,
): 'ok' | 'wait' | 'bad' {
  if (fPercent >= 60) return 'ok'
  if (fPercent >= 30) return 'wait'
  return 'bad'
}
