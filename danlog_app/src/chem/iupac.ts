/**
 * Systematic chemical names.
 *
 * The second thing in this app that touches the network, and it carries the
 * same cost as the first: the structure leaves the browser. RDKit has no name
 * generator -- naming is a rule engine nobody ships to WebAssembly -- so a real
 * name can only come from a service.
 *
 * Unlike 3D coordinates this runs across a whole board at once, so it is
 * gated by a setting, capped in concurrency, cached for the session, and never
 * reachable by a WebMCP tool. A molecule with no name available is reported as
 * having none rather than falling back to something invented.
 */

const url = (smiles: string) =>
  `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(smiles)}/iupac_name`

/**
 * Session cache, keyed by canonical SMILES. A null value means "asked, and no
 * name is available" -- distinct from a missing key, which means "not asked".
 * Not persisted, for the same reason conformers are not.
 */
const names = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()

export const knownIupacName = (smiles: string): string | null => names.get(smiles) ?? null
export const iupacLookedUp = (smiles: string): boolean => names.has(smiles)
export const iupacCacheSize = () => names.size

/** CACTUS answers a failure with an HTML page and a 200, so the body is checked. */
function plausibleName(text: string): string | null {
  const first = text.split('\n')[0]?.trim() ?? ''
  if (!first || first.length > 250) return null
  if (first.startsWith('<')) return null
  if (/^page not found/i.test(first)) return null
  // A name has letters in it; an error string of pure punctuation does not.
  if (!/[a-z]/i.test(first)) return null
  return first
}

/**
 * At most this many requests in flight. A board of thirty candidates firing
 * thirty simultaneous requests at a free public service gets throttled, and
 * deserves to be.
 */
const MAX_PARALLEL = 3
let active = 0
const waiting: (() => void)[] = []

async function acquire(): Promise<void> {
  if (active < MAX_PARALLEL) {
    active++
    return
  }
  await new Promise<void>((resolve) => waiting.push(resolve))
  active++
}

function release(): void {
  active--
  waiting.shift()?.()
}

/**
 * The name, or null when the service has none. Never throws: a naming failure
 * is cosmetic and must not disturb a design session.
 */
export async function fetchIupacName(
  smiles: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const cached = names.get(smiles)
  if (cached !== undefined) return cached

  const pending = inflight.get(smiles)
  if (pending) return pending

  const run = (async (): Promise<string | null> => {
    await acquire()
    try {
      const response = await fetch(url(smiles), { signal })
      if (!response.ok) {
        names.set(smiles, null)
        return null
      }
      const name = plausibleName(await response.text())
      names.set(smiles, name)
      return name
    } catch (error) {
      // An abort is the human moving on, not a result worth caching.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        names.set(smiles, null)
      }
      return null
    } finally {
      release()
      inflight.delete(smiles)
    }
  })()

  inflight.set(smiles, run)
  return run
}
