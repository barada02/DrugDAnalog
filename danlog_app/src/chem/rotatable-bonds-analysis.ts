/**
 * Rotatable Bonds Analysis & Interpretation
 *
 * Interprets what rotatable bond count means for drug properties.
 * Already computed by RDKit, but we add clinical interpretation.
 */

export interface RotatableBondsProfile {
  count: number
  category: 'very rigid' | 'rigid' | 'moderate' | 'flexible' | 'very flexible'
  concern: string
  implication: string
}

/**
 * Analyze rotatable bonds and provide interpretation.
 */
export function analyzeRotatableBonds(count: number): RotatableBondsProfile {
  let category: RotatableBondsProfile['category']
  let concern: string
  let implication: string

  if (count <= 2) {
    category = 'very rigid'
    concern = '✅ Rigid structure'
    implication =
      'Reduced conformational flexibility. Good for target specificity, but may have poor oral bioavailability.'
  } else if (count <= 5) {
    category = 'rigid'
    concern = '✅ Relatively rigid'
    implication =
      'Good balance. Specific binding expected, with reasonable flexibility for absorption.'
  } else if (count <= 10) {
    category = 'moderate'
    concern = '⚠️ Moderate flexibility'
    implication =
      'Multiple conformations possible. May reduce target specificity but improve bioavailability.'
  } else if (count <= 15) {
    category = 'flexible'
    concern = '⚠️ Highly flexible'
    implication =
      'Many conformations. Risk of poor target specificity (multiple binding modes). May have good oral bioavailability.'
  } else {
    category = 'very flexible'
    concern = '❌ Very flexible (chain-like)'
    implication =
      'Excessive flexibility. Likely poor target selectivity and binding affinity. Suggest rigidifying the structure.'
  }

  return {
    count,
    category,
    concern,
    implication,
  }
}

/**
 * Get clinical recommendation based on rotatable bonds.
 */
export function getRotatableBondsRecommendation(count: number): string | null {
  if (count > 15) {
    return 'Consider reducing rotatable bonds by constraining the molecule or using conformationally-restricted scaffolds.'
  }
  if (count > 12) {
    return 'High flexibility may reduce binding specificity. Validate target engagement experimentally.'
  }
  if (count < 2) {
    return 'Very rigid structure may have poor oral bioavailability. Consider slight increase in flexibility if absorption is an issue.'
  }
  return null
}

/**
 * Get severity for UI (balance between specificity and bioavailability).
 */
export function getRotatableBondsSeverity(count: number): 'ok' | 'wait' | 'bad' {
  if (count >= 3 && count <= 10) return 'ok' // Sweet spot
  if (count <= 15) return 'wait' // Acceptable but suboptimal
  return 'bad' // Too flexible
}
