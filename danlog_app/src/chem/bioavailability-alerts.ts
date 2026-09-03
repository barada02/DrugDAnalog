/**
 * Bioavailability-based alerts for the design board.
 *
 * These alerts help chemists quickly identify molecules with poor
 * synthesis or absorption properties, allowing early filtering
 * before expensive lab work.
 */

import type { Candidate } from '../store/workbench'
import { describeSAScore, getSASeverity } from './sascore'
import { describeHIAAbsorption } from './bioavailability'

export interface BiavailabilityAlert {
  label: string
  why: string
  severity: 'info' | 'warning' | 'critical'
}

/**
 * Generate alerts based on synthesis and bioavailability scores.
 * These are intended as helpful flags, not hard rejections.
 */
export function generateBioavailabilityAlerts(properties: Candidate['properties']): BiavailabilityAlert[] {
  const alerts: BiavailabilityAlert[] = []

  // SAScore alerts: very hard to synthesize molecules waste lab time
  if (properties.saScore > 8) {
    alerts.push({
      label: 'Extremely hard to synthesize',
      why: `SAScore ${properties.saScore} suggests this molecule would be impractical or impossible to synthesize. Consider simplifying the structure.`,
      severity: 'critical',
    })
  } else if (properties.saScore > 6.5) {
    alerts.push({
      label: 'Difficult to synthesize',
      why: `SAScore ${properties.saScore} — ${describeSAScore(properties.saScore)}. This will require specialized expertise or novel synthesis methods.`,
      severity: 'warning',
    })
  }

  // BBB alerts: only relevant if crossing is needed
  // (displayed as info, not warning, because not all drugs need brain penetration)
  if (properties.bbaCrossing < 20) {
    alerts.push({
      label: 'Low brain penetration',
      why: `BBB crossing probability is only ${properties.bbaCrossing}%. Good for peripheral targets, problematic for neurological diseases.`,
      severity: 'info',
    })
  }

  // HIA alerts: poor oral absorption is a hard blocker for oral drugs
  if (properties.hiaScore < 30) {
    alerts.push({
      label: 'Poor oral absorption',
      why: `HIA score ${properties.hiaScore}% suggests this molecule will not be absorbed through the GI tract. Consider intravenous administration instead.`,
      severity: 'warning',
    })
  } else if (properties.hiaScore < 50) {
    alerts.push({
      label: 'Moderate oral absorption',
      why: `HIA score ${properties.hiaScore}%. ${describeHIAAbsorption(properties.hiaScore)}. Bioavailability may be a concern.`,
      severity: 'info',
    })
  }

  return alerts
}

/**
 * Generate badges for card display.
 * Shows key information about synthesis and bioavailability at a glance.
 */
export function generateBioavailabilityBadges(properties: Candidate['properties']): Array<{
  label: string
  tone: 'ok' | 'wait' | 'bad'
}> {
  const badges: Array<{ label: string; tone: 'ok' | 'wait' | 'bad' }> = []

  // SAScore badge
  const saSeverity = getSASeverity(properties.saScore)
  if (saSeverity === 'ok') {
    badges.push({ label: 'Easy synthesis', tone: 'ok' })
  } else if (saSeverity === 'wait') {
    if (properties.saScore < 5) {
      badges.push({ label: 'Moderate synthesis', tone: 'ok' })
    } else {
      badges.push({ label: 'Hard synthesis', tone: 'wait' })
    }
  } else {
    badges.push({ label: 'Very hard synthesis', tone: 'bad' })
  }

  // HIA badge (only show if concerning)
  if (properties.hiaScore < 50) {
    badges.push({
      label: `${properties.hiaScore}% oral absorption`,
      tone: properties.hiaScore < 30 ? 'bad' : 'wait',
    })
  } else {
    badges.push({ label: 'Good oral absorption', tone: 'ok' })
  }

  // BBB badge (only if high - low is contextual)
  if (properties.bbaCrossing > 60) {
    badges.push({ label: 'BBB+', tone: 'ok' })
  }

  return badges
}
