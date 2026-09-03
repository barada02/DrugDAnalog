import { useEffect, useState } from 'react'
import { PRESETS, canonicalize } from '../chem/properties'

/**
 * Naming the molecule in focus.
 *
 * PRESETS hold SMILES as a chemist would type them, but a restored session
 * holds the canonical form, so a literal string match silently fails after a
 * reload and every molecule reads as "Custom". Canonicalising the presets once
 * and matching on that is what makes the name survive a refresh.
 */

type Table = Map<string, string>

let cached: Table | null = null
let building: Promise<Table> | null = null

async function presetTable(): Promise<Table> {
  if (cached) return cached
  building ??= (async () => {
    const built: Table = new Map()
    for (const preset of PRESETS) {
      try {
        built.set(await canonicalize(preset.smiles), preset.name)
      } catch {
        // A preset that will not parse is not worth failing the lookup over.
      }
    }
    cached = built
    return built
  })()
  return building
}

/** The preset's name, or null when the molecule is not one of them. */
export function usePresetName(canonicalSmiles: string | null): string | null {
  // Built once per page load. Everything after that is a synchronous map read,
  // so the name is derived during render rather than synced by an effect.
  const [table, setTable] = useState<Table | null>(() => cached)

  useEffect(() => {
    if (table) return
    let cancelled = false
    void presetTable().then((t) => {
      if (!cancelled) setTable(t)
    })
    return () => {
      cancelled = true
    }
  }, [table])

  if (!canonicalSmiles || !table) return null
  return table.get(canonicalSmiles) ?? null
}
