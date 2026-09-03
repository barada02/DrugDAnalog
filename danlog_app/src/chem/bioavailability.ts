/**
 * Bioavailability Predictions
 *
 * BBB (Blood-Brain Barrier) Crossing Probability
 * HIA (Human Intestinal Absorption) Score
 *
 * These are empirically derived predictions based on published literature
 * and commonly used in computational drug design.
 */

/**
 * Blood-Brain Barrier (BBB) Crossing Probability
 *
 * Predicts likelihood a molecule crosses the BBB (0-100%).
 * Important for neurological drugs.
 *
 * Based on:
 * - logP (greasy molecules cross better, but not too greasy)
 * - TPSA (polar molecules don't cross)
 * - MW (smaller = easier crossing)
 * - HBD (hydrogen bond donors reduce crossing)
 *
 * Reference: Di et al. (2003) "Blood-Brain Barrier Penetration of Amines and Amides",
 * Journal of Medicinal Chemistry, 46(16):3273-3278
 */
export function calculateBBBProbability(params: {
  logP: number
  tpsa: number
  mw: number
  hbd: number
}): number {
  const { logP, tpsa, mw, hbd } = params

  // Start with a baseline probability
  let probability = 50 // 50% baseline

  // logP optimum for BBB crossing is around 1.5-2.5
  // Too low (hydrophilic) or too high (lipophilic) both reduce crossing
  if (logP >= 1.5 && logP <= 2.5) {
    probability += 15 // Good range for crossing
  } else if (logP >= 1.0 && logP <= 3.0) {
    probability += 8 // Acceptable range
  } else if (logP >= 0 && logP < 1.0) {
    probability -= 15 // Too hydrophilic
  } else if (logP > 3.0) {
    probability -= 10 // Too lipophilic
  } else {
    probability -= 25 // Extremely hydrophilic
  }

  // TPSA: critical parameter for BBB crossing
  // Sweet spot is 40-90 Ų
  if (tpsa >= 40 && tpsa <= 90) {
    probability += 20 // Excellent range
  } else if (tpsa >= 20 && tpsa <= 110) {
    probability += 10 // Good range
  } else if (tpsa > 110) {
    probability -= 30 // Too polar, won't cross
  } else if (tpsa < 20) {
    probability -= 5 // Very lipophilic
  }

  // Molecular weight: smaller is better for crossing
  if (mw < 300) {
    probability += 8
  } else if (mw < 400) {
    probability += 3
  } else if (mw >= 400 && mw < 500) {
    probability -= 10
  } else {
    probability -= 25
  }

  // HBD count: fewer is better for BBB crossing
  if (hbd === 0) {
    probability += 8
  } else if (hbd === 1) {
    probability += 3
  } else if (hbd === 2) {
    probability -= 2
  } else if (hbd >= 3) {
    probability -= 15
  }

  // Clamp to 0-100 range
  return Math.min(100, Math.max(0, Math.round(probability)))
}

/**
 * Human Intestinal Absorption (HIA) Score
 *
 * Predicts percentage likelihood a molecule is absorbed through the GI tract
 * when taken orally (0-100%).
 *
 * Based on:
 * - TPSA (polar molecules don't absorb well)
 * - MW (larger = harder to absorb)
 * - HBA/HBD (hydrogen bonding patterns)
 * - logP (need some lipophilicity to cross membrane)
 *
 * Reference: Zhao et al. (2002) "Evaluation of Human Intestinal Absorption Data
 * and in Silico Prediction Models Using a Highly Preferable Logistic Regression Model"
 */
export function calculateHIAScore(params: {
  tpsa: number
  mw: number
  hba: number
  hbd: number
  logP: number
}): number {
  const { tpsa, mw, hba, hbd, logP } = params

  // Start with a baseline
  let probability = 50

  // TPSA is most critical for HIA
  // Good absorption typically needs TPSA < 140, optimal < 100
  if (tpsa < 60) {
    probability += 20 // Excellent range
  } else if (tpsa < 100) {
    probability += 15 // Good range
  } else if (tpsa < 140) {
    probability += 5 // Marginal
  } else if (tpsa < 180) {
    probability -= 15 // Poor
  } else {
    probability -= 30 // Very poor
  }

  // Molecular weight limits
  // Lipinski's rule: MW < 500 for good oral absorption
  if (mw < 300) {
    probability += 10
  } else if (mw < 400) {
    probability += 5
  } else if (mw < 500) {
    probability += 0 // At limit
  } else if (mw < 600) {
    probability -= 10
  } else {
    probability -= 20
  }

  // HBA count: more than 10 reduces absorption
  if (hba <= 10) {
    probability += 5
  } else if (hba <= 12) {
    probability -= 5
  } else {
    probability -= 15
  }

  // HBD count: high counts reduce absorption
  if (hbd <= 3) {
    probability += 5
  } else if (hbd <= 5) {
    probability += 0
  } else {
    probability -= 10
  }

  // logP balance: need some lipophilicity
  if (logP < 0) {
    probability -= 10 // Too hydrophilic
  } else if (logP > 5) {
    probability -= 5 // Too lipophilic (may precipitate)
  } else if (logP >= 0 && logP <= 3) {
    probability += 8 // Sweet spot
  }

  // Clamp to 0-100 range
  return Math.min(100, Math.max(0, Math.round(probability)))
}

/**
 * Describe BBB crossing probability in user-friendly terms.
 */
export function describeBBBCrossing(probability: number): string {
  if (probability >= 70) return 'High BBB penetration'
  if (probability >= 40) return 'Moderate BBB penetration'
  if (probability >= 20) return 'Low BBB penetration'
  return 'Very low/no BBB penetration'
}

/**
 * Describe HIA score in user-friendly terms.
 */
export function describeHIAAbsorption(probability: number): string {
  if (probability >= 80) return 'Excellent oral absorption'
  if (probability >= 60) return 'Good oral absorption'
  if (probability >= 40) return 'Moderate oral absorption'
  if (probability >= 20) return 'Poor oral absorption'
  return 'Very poor oral absorption'
}

/**
 * Determine severity level for UI display.
 * Used for coloring and alerting.
 */
export function getBBBSeverity(
  probability: number,
  userNeedsBBB?: boolean
): 'ok' | 'wait' | 'bad' | null {
  // If user doesn't need BBB crossing (e.g., peripheral target), no concern
  if (userNeedsBBB === false) return null

  if (probability >= 50) return 'ok'
  if (probability >= 25) return 'wait'
  return 'bad'
}

export function getHIASeverity(probability: number): 'ok' | 'wait' | 'bad' {
  if (probability >= 70) return 'ok'
  if (probability >= 40) return 'wait'
  return 'bad'
}
