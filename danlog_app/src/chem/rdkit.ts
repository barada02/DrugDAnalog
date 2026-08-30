import type { JSMol, RDKitModule } from '@rdkit/rdkit'

/**
 * RDKit lives in `public/rdkit/` rather than going through the bundler: the
 * emscripten glue plus a 6.9 MB .wasm fights every bundler, and we want the
 * wasm at a stable URL so the browser can cache it.
 */
const JS_PATH = '/rdkit/RDKit_minimal.js'
const WASM_PATH = '/rdkit/RDKit_minimal.wasm'

/**
 * Module-level singleton, deliberately NOT React state. Tools invoked by an
 * agent must be able to reach RDKit whether or not anything is mounted.
 */
let modulePromise: Promise<RDKitModule> | null = null

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(el)
  })
}

export function getRDKit(): Promise<RDKitModule> {
  modulePromise ??= (async () => {
    if (!window.initRDKitModule) await loadScript(JS_PATH)
    return window.initRDKitModule({ locateFile: () => WASM_PATH })
  })()
  return modulePromise
}

export class InvalidSmilesError extends Error {
  constructor(smiles: string) {
    super(`Not a valid SMILES string: ${JSON.stringify(smiles)}`)
    this.name = 'InvalidSmilesError'
  }
}

/**
 * The ONLY place `get_mol` is called. Every JSMol is a C++ object on the
 * emscripten heap and leaks unless `.delete()` runs, so the lifetime is owned
 * here and callers only ever borrow the mol.
 */
export async function withMol<T>(smiles: string, fn: (mol: JSMol) => T): Promise<T> {
  const rdkit = await getRDKit()
  let mol: JSMol | null = null
  try {
    mol = rdkit.get_mol(smiles)
  } catch {
    throw new InvalidSmilesError(smiles)
  }
  if (!mol) throw new InvalidSmilesError(smiles)
  try {
    if (!mol.is_valid()) throw new InvalidSmilesError(smiles)
    return fn(mol)
  } finally {
    mol.delete()
  }
}
