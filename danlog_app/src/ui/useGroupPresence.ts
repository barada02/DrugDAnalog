import { useEffect, useState } from 'react'
import { GROUPS } from '../chem/groups'
import { matchPattern } from '../chem/substructure'

/**
 * Which of the pinnable groups a molecule actually contains.
 *
 * Matched with the pattern the Preserve chips themselves use, not by comparing
 * labels against the profile catalog. The two lists share names but not always
 * SMARTS -- the catalog's "primary amine" excludes amide nitrogens and the
 * pinnable one does not -- so a label match would occasionally claim a group is
 * present that pinning it would then fail to find.
 */
export type GroupPresence = Record<string, boolean>

export function useGroupPresence(smiles: string | null): GroupPresence | null {
  // Stored with the molecule it was measured on, so a result arriving after the
  // focus has moved on is discarded rather than shown against the wrong one.
  const [resolved, setResolved] = useState<{ smiles: string; map: GroupPresence } | null>(null)

  useEffect(() => {
    if (!smiles) return
    let cancelled = false

    const run = async () => {
      const entries = await Promise.all(
        GROUPS.map(async (group) => {
          try {
            const match = await matchPattern(smiles, group.smarts)
            return [group.label, match.matched] as const
          } catch {
            // An unparseable molecule is not a reason to fail the whole panel.
            return [group.label, false] as const
          }
        }),
      )
      if (!cancelled) setResolved({ smiles, map: Object.fromEntries(entries) })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [smiles])

  return resolved?.smiles === smiles ? resolved.map : null
}
