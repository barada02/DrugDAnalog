import { ALERTS, BIOISOSTERES, FUNCTIONAL_GROUPS, SUPERSEDES } from './catalog'
import type { Alert, Bioisostere } from './catalog'
import { getRDKit } from './rdkit'

/**
 * Running the catalog against a molecule.
 *
 * Every function here opens one molecule and reuses it across all patterns.
 * Building a fresh JSMol per pattern would mean ~40 parses of the same
 * structure per card.
 */

export type GroupHit = { label: string; about: string; count: number }
export type AlertHit = Alert & { count: number }

export type Profile = {
  groups: GroupHit[]
  alerts: AlertHit[]
}

type Pattern = { label: string; smarts: string }

/** Every place a pattern hit, as sets of atom indices. */
type Sites = Map<string, number[][]>

/** Opens the molecule once, then walks the patterns against it. */
async function scan(smiles: string, patterns: Pattern[]): Promise<Sites> {
  const rdkit = await getRDKit()
  const found: Sites = new Map()
  let mol = null
  try {
    mol = rdkit.get_mol(smiles)
    if (!mol?.is_valid()) return found
    for (const pattern of patterns) {
      let query = null
      try {
        query = rdkit.get_qmol(pattern.smarts)
        if (!query?.is_valid()) continue
        // No match comes back as {} rather than an empty array.
        const matches = JSON.parse(mol.get_substruct_matches(query)) as unknown
        if (!Array.isArray(matches) || matches.length === 0) continue
        const sites = (matches as { atoms?: number[] }[])
          .map((m) => m.atoms ?? [])
          .filter((atoms) => atoms.length > 0)
        if (sites.length > 0) found.set(pattern.label, sites)
      } finally {
        query?.delete()
      }
    }
  } finally {
    mol?.delete()
  }
  return found
}

const isSubsetOf = (inner: number[], outer: number[]) => {
  const set = new Set(outer)
  return inner.every((atom) => set.has(atom))
}

/**
 * Named groups present, with the general suppressed by the specific.
 *
 * Suppression is PER SITE, not per molecule. Aspirin contains a real ester and
 * a separate real carboxylic acid; vorinostat contains a hydroxamic acid and a
 * distinct anilide amide. Suppressing a label wherever a more specific one
 * appears anywhere would silently delete those. So a general match is dropped
 * only where its atoms sit inside a specific match's atoms.
 */
export async function functionalGroups(smiles: string): Promise<GroupHit[]> {
  const found = await scan(smiles, FUNCTIONAL_GROUPS)

  // For each general label, the sites of every specific group that outranks it.
  const covering = new Map<string, number[][]>()
  for (const [specific, sites] of found) {
    for (const general of SUPERSEDES[specific] ?? []) {
      covering.set(general, [...(covering.get(general) ?? []), ...sites])
    }
  }

  return FUNCTIONAL_GROUPS.flatMap((group) => {
    const sites = found.get(group.label)
    if (!sites) return []
    const shadows = covering.get(group.label) ?? []
    const surviving = sites.filter(
      (site) => !shadows.some((shadow) => isSubsetOf(site, shadow)),
    )
    if (surviving.length === 0) return []
    return [{ label: group.label, about: group.about, count: surviving.length }]
  })
}

export async function alerts(smiles: string): Promise<AlertHit[]> {
  const found = await scan(smiles, ALERTS)
  return ALERTS.filter((a) => found.has(a.label)).map((a) => ({
    ...a,
    count: found.get(a.label)?.length ?? 0,
  }))
}

export async function profile(smiles: string): Promise<Profile> {
  const [groups, hits] = await Promise.all([functionalGroups(smiles), alerts(smiles)])
  return { groups, alerts: hits }
}

/** Replacements available for the groups this molecule actually has. */
export function suggestionsFor(groups: GroupHit[]): Bioisostere[] {
  const present = new Set(groups.map((g) => g.label))
  return BIOISOSTERES.filter((b) => present.has(b.replaces))
}
