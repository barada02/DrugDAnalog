import { useEffect, useState } from 'react'
import { fetchIupacName, knownIupacName } from '../chem/iupac'
import { useWorkbench } from '../store/workbench'

/**
 * A molecule's systematic name, once the service has answered.
 *
 * Returns null until then, so callers render whatever they had before rather
 * than a placeholder that shifts. Respects the naming setting: with it off,
 * nothing is requested and nothing leaves the browser.
 */
export function useIupacName(smiles: string | null): string | null {
  const enabled = useWorkbench((s) => s.iupacLookup)

  // Held with the molecule it belongs to, so a slow answer for one candidate
  // cannot be painted onto whichever card you opened in the meantime.
  const [resolved, setResolved] = useState<{ smiles: string; name: string | null } | null>(() =>
    smiles && knownIupacName(smiles) ? { smiles, name: knownIupacName(smiles) } : null,
  )

  useEffect(() => {
    if (!enabled || !smiles) return
    let cancelled = false
    const controller = new AbortController()
    void fetchIupacName(smiles, controller.signal).then((name) => {
      if (!cancelled) setResolved({ smiles, name })
    })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [smiles, enabled])

  if (!enabled || !smiles) return null
  return resolved?.smiles === smiles ? resolved.name : null
}
