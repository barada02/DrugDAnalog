/**
 * Toxicity Pattern Recognition
 *
 * Identifies structural alerts that correlate with toxicity,
 * using published literature patterns (PAINS, Brenk, custom).
 *
 * References:
 * - PAINS: Baell, J. B., & Holloway, G. A. (2010). "Pan Assay Interference Compounds"
 * - Brenk: Brenk, R., et al. (2008). "Lessons Learned from Pharmaceutical Industry"
 */

import { getRDKit } from './rdkit'

export interface ToxicityAlert {
  label: string
  pattern: string
  reason: string
  severity: 'critical' | 'warning' | 'info'
  category: 'genotoxin' | 'cardiotoxin' | 'reactive' | 'metabolic' | 'assay-interference' | 'other'
}

/**
 * Comprehensive toxicity pattern library.
 * Each pattern is a SMARTS string that matches toxic structural features.
 */
export const TOXICITY_PATTERNS: ToxicityAlert[] = [
  // === GENOTOXIC PATTERNS ===
  // Nitro groups (can form nitroso which is mutagenic)
  {
    label: 'Nitro group (potential genotoxin)',
    pattern: '[NX3](=O)=O',
    reason: 'Nitro groups can be reduced to form mutagenic nitroso metabolites',
    severity: 'warning',
    category: 'genotoxin',
  },
  // Aromatic amines (carcinogenic metabolites)
  {
    label: 'Aromatic amine (carcinogenic metabolite risk)',
    pattern: '[NX3;$([N];!@[#6])][c,n]',
    reason: 'Aromatic amines can be N-oxidized to form carcinogenic metabolites',
    severity: 'warning',
    category: 'genotoxin',
  },
  // Azides (explosive, mutagenic)
  {
    label: 'Azide group (explosive and mutagenic)',
    pattern: '[N-]=[N+]=[N-]',
    reason: 'Azides are explosive and mutagenic',
    severity: 'critical',
    category: 'genotoxin',
  },

  // === REACTIVE/ELECTROPHILIC PATTERNS ===
  // Michael acceptor (alpha/beta unsaturated carbonyl)
  {
    label: 'Michael acceptor (electrophilic, covalent binding)',
    pattern: '[$(C=C-C(=O)),$(C=C-C(=O)N),$(C=C-C(=O)O)]',
    reason: 'Can form covalent adducts with nucleophiles (toxicity, immunogenicity)',
    severity: 'warning',
    category: 'reactive',
  },
  // Epoxides
  {
    label: 'Epoxide (toxic, reactive)',
    pattern: '[CX3]1[OX2][CX3]1',
    reason: 'Epoxides are highly reactive and can form covalent protein adducts',
    severity: 'warning',
    category: 'reactive',
  },
  // Isocyanates
  {
    label: 'Isocyanate (toxic, reactive)',
    pattern: '[NX2]=[CX2]=[OX1]',
    reason: 'Isocyanates are highly reactive and toxic',
    severity: 'warning',
    category: 'reactive',
  },
  // Thiols that can be oxidized (except disulfides)
  {
    label: 'Free thiol (oxidation/covalent binding risk)',
    pattern: '[SX2H]',
    reason: 'Free thiols can be oxidized or form covalent adducts',
    severity: 'info',
    category: 'reactive',
  },

  // === CARDIOTOXIC PATTERNS ===
  // hERG channel blockers (long QT risk)
  // Pattern: Lipophilic bases that can block hERG
  {
    label: 'hERG channel blocker (QT prolongation risk)',
    pattern: '[N;$(N-c),$(N-C-c)][$(c1ccccc1)]',
    reason:
      'Aromatic amines or imidazoles can block hERG K+ channel, causing QT prolongation and arrhythmia',
    severity: 'warning',
    category: 'cardiotoxin',
  },

  // === METABOLIC INSTABILITY PATTERNS ===
  // Esters (easily hydrolyzed)
  {
    label: 'Ester (rapid hydrolysis)',
    pattern: '[CX3](=[OX1])[OX2H0]',
    reason: 'Esters are rapidly hydrolyzed by esterases, reducing half-life',
    severity: 'info',
    category: 'metabolic',
  },

  // === PAINS (Pan-Assay Interference Compounds) ===
  // Compounds that interfere with assay readout
  // Silver bullet compounds (interfere with many assays)
  {
    label: 'Catechol (pan-assay interference)',
    pattern: '[OX2H][c,n][c,n][OX2H]',
    reason: 'Catechols are known to interfere with many biochemical assays',
    severity: 'warning',
    category: 'assay-interference',
  },
  // Hydroquinone variants
  {
    label: 'Hydroquinone variant (assay interference)',
    pattern: '[$(C1=C(O)C=CC=C1),$(C1=C(O)C=C(O)C=C1)]',
    reason: 'Hydroquinone-like compounds can interfere with assay readouts',
    severity: 'info',
    category: 'assay-interference',
  },

  // === BRENK ALERTS ===
  // Highly reactive compounds
  {
    label: 'Aldehyde (highly reactive, toxicity risk)',
    pattern: '[CX3H1](=O)[#6]',
    reason: 'Aldehydes are highly reactive and can form protein adducts',
    severity: 'warning',
    category: 'reactive',
  },
  // Ketones adjacent to electron-withdrawing groups
  {
    label: 'Acyl chloride (highly reactive)',
    pattern: '[Cl][CX3](=[OX1])',
    reason: 'Acyl chlorides are extremely reactive and toxic',
    severity: 'critical',
    category: 'reactive',
  },

  // === HALOGENATION ===
  // High halogen density (bioaccumulation risk)
  {
    label: 'Multiple halogens (bioaccumulation risk)',
    pattern: '[$(Cl),$(Br),$(F)][$(Cl),$(Br),$(I)]',
    reason: 'Multiple halogens can cause bioaccumulation and environmental toxicity',
    severity: 'info',
    category: 'other',
  },

  // === HEAVY METALS ===
  // Metals that can cause toxicity
  {
    label: 'Heavy metal (As, Pb, Hg, etc.)',
    pattern: '[As,Pb,Hg,Cd]',
    reason: 'Heavy metals are toxic and should generally be avoided in drugs',
    severity: 'critical',
    category: 'other',
  },

  // === ADDITIONAL PATTERNS ===
  // Aromatic N-oxides (more stable than nitro)
  {
    label: 'Aromatic N-oxide (metabolic stress)',
    pattern: '[n+][O-]',
    reason: 'N-oxides can reduce lipophilicity but may cause metabolic issues',
    severity: 'info',
    category: 'metabolic',
  },
]

/**
 * Detect toxicity alerts in a molecule.
 * Returns all matched patterns with descriptions.
 */
export async function detectToxicityPatterns(smiles: string): Promise<ToxicityAlert[]> {
  const rdkit = await getRDKit()
  let mol = null
  let query = null
  const alerts: ToxicityAlert[] = []

  try {
    mol = rdkit.get_mol(smiles)
    if (!mol?.is_valid()) {
      return []
    }

    // Test each pattern
    for (const pattern of TOXICITY_PATTERNS) {
      query = rdkit.get_qmol(pattern.pattern)
      if (!query?.is_valid()) {
        continue
      }

      const matches = JSON.parse(mol.get_substruct_matches(query)) as unknown
      if (Array.isArray(matches) && matches.length > 0) {
        alerts.push(pattern)
      }

      query.delete()
      query = null
    }
  } catch (error) {
    // Pattern matching failed for this molecule
    console.error('Toxicity pattern matching error:', error)
  } finally {
    mol?.delete()
    query?.delete()
  }

  // Sort by severity (critical first)
  return alerts.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 }
    return severityOrder[a.severity] - severityOrder[b.severity]
  })
}

/**
 * Get a summary of toxicity concerns.
 * Returns categories and counts.
 */
export function summarizeToxicity(alerts: ToxicityAlert[]): {
  critical: number
  warnings: number
  info: number
  categories: Record<string, number>
} {
  const summary = {
    critical: 0,
    warnings: 0,
    info: 0,
    categories: {} as Record<string, number>,
  }

  for (const alert of alerts) {
    if (alert.severity === 'critical') summary.critical++
    else if (alert.severity === 'warning') summary.warnings++
    else summary.info++

    summary.categories[alert.category] = (summary.categories[alert.category] || 0) + 1
  }

  return summary
}
