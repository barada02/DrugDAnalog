/**
 * Molecular shape from a real conformer.
 *
 * Principal moments of inertia describe whether a molecule is shaped like a
 * rod, a disc, or a sphere. It is the standard way to ask "is this thing flat"
 * with a number instead of an opinion, and it is the one thing 3D gives us
 * that 2D cannot -- without it the 3D view is decoration.
 *
 * The maths is deterministic: eigenvalues of the inertia tensor. The INPUT is
 * not. It is one conformer, chosen by whichever service generated it, out of
 * many a flexible molecule can adopt. That caveat travels with every number
 * this file produces.
 */

export type Shape = {
  /** Normalised principal moment ratios, both between 0 and 1. */
  npr1: number
  npr2: number
  /** Where the molecule sits between the three extremes. */
  descriptor: 'rod-like' | 'disc-like' | 'sphere-like' | 'intermediate'
  /** Largest interatomic distance, in angstroms. */
  span: number
  atoms: number
}

/** Enough of the periodic table for organic molecules; anything else weighs 12. */
const MASS: Record<string, number> = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974,
  S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904, B: 10.81, Si: 28.085,
}

type Atom = { x: number; y: number; z: number; mass: number }

/** MDL fixed-width columns, which is why this slices rather than splits. */
export function parseSdfAtoms(sdf: string): Atom[] {
  const lines = sdf.split('\n')
  const count = Number.parseInt(lines[3]?.slice(0, 3) ?? '', 10)
  if (!Number.isFinite(count) || count <= 0) return []
  return lines.slice(4, 4 + count).flatMap((line) => {
    const x = Number.parseFloat(line.slice(0, 10))
    const y = Number.parseFloat(line.slice(10, 20))
    const z = Number.parseFloat(line.slice(20, 30))
    const element = line.slice(31, 34).trim()
    if (![x, y, z].every(Number.isFinite) || !element) return []
    return [{ x, y, z, mass: MASS[element] ?? 12 }]
  })
}

/**
 * Eigenvalues of a real symmetric 3x3 matrix, in closed form.
 *
 * Deliberately not an iterative solver: the inertia tensor is always 3x3 and
 * always symmetric, so the trigonometric solution is exact, allocation-free
 * and cannot fail to converge. Handles the degenerate case where the matrix is
 * already diagonal, which happens for linear and highly symmetric molecules.
 */
function symmetricEigenvalues(m: number[][]): [number, number, number] {
  const p1 = m[0][1] ** 2 + m[0][2] ** 2 + m[1][2] ** 2
  const trace = m[0][0] + m[1][1] + m[2][2]
  if (p1 === 0) {
    return [m[0][0], m[1][1], m[2][2]].sort((a, b) => a - b) as [number, number, number]
  }
  const q = trace / 3
  const p2 = (m[0][0] - q) ** 2 + (m[1][1] - q) ** 2 + (m[2][2] - q) ** 2 + 2 * p1
  const p = Math.sqrt(p2 / 6)
  const b = [
    [(m[0][0] - q) / p, m[0][1] / p, m[0][2] / p],
    [m[1][0] / p, (m[1][1] - q) / p, m[1][2] / p],
    [m[2][0] / p, m[2][1] / p, (m[2][2] - q) / p],
  ]
  const det =
    b[0][0] * (b[1][1] * b[2][2] - b[1][2] * b[2][1]) -
    b[0][1] * (b[1][0] * b[2][2] - b[1][2] * b[2][0]) +
    b[0][2] * (b[1][0] * b[2][1] - b[1][1] * b[2][0])
  // Clamp guards against floating point pushing this just outside [-1, 1].
  const phi = Math.acos(Math.min(1, Math.max(-1, det / 2))) / 3
  const e1 = q + 2 * p * Math.cos(phi)
  const e3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3)
  const e2 = trace - e1 - e3
  return [e1, e2, e3].sort((a, b) => a - b) as [number, number, number]
}

function classify(npr1: number, npr2: number): Shape['descriptor'] {
  // Corners of the Sauer-Schwarz triangle: rod (0,1), disc (0.5,0.5), sphere (1,1).
  const toRod = Math.hypot(npr1 - 0, npr2 - 1)
  const toDisc = Math.hypot(npr1 - 0.5, npr2 - 0.5)
  const toSphere = Math.hypot(npr1 - 1, npr2 - 1)
  const nearest = Math.min(toRod, toDisc, toSphere)
  if (nearest > 0.25) return 'intermediate'
  if (nearest === toRod) return 'rod-like'
  if (nearest === toDisc) return 'disc-like'
  return 'sphere-like'
}

export function shapeFromSdf(sdf: string): Shape | null {
  const atoms = parseSdfAtoms(sdf)
  if (atoms.length < 3) return null

  const total = atoms.reduce((sum, a) => sum + a.mass, 0)
  const cx = atoms.reduce((s, a) => s + a.mass * a.x, 0) / total
  const cy = atoms.reduce((s, a) => s + a.mass * a.y, 0) / total
  const cz = atoms.reduce((s, a) => s + a.mass * a.z, 0) / total

  const tensor = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const a of atoms) {
    const x = a.x - cx
    const y = a.y - cy
    const z = a.z - cz
    tensor[0][0] += a.mass * (y * y + z * z)
    tensor[1][1] += a.mass * (x * x + z * z)
    tensor[2][2] += a.mass * (x * x + y * y)
    tensor[0][1] -= a.mass * x * y
    tensor[0][2] -= a.mass * x * z
    tensor[1][2] -= a.mass * y * z
  }
  tensor[1][0] = tensor[0][1]
  tensor[2][0] = tensor[0][2]
  tensor[2][1] = tensor[1][2]

  const [i1, i2, i3] = symmetricEigenvalues(tensor)
  if (i3 <= 0) return null

  let span = 0
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const d = Math.hypot(
        atoms[i].x - atoms[j].x,
        atoms[i].y - atoms[j].y,
        atoms[i].z - atoms[j].z,
      )
      if (d > span) span = d
    }
  }

  const npr1 = Number((i1 / i3).toFixed(3))
  const npr2 = Number((i2 / i3).toFixed(3))
  return { npr1, npr2, descriptor: classify(npr1, npr2), span: Number(span.toFixed(2)), atoms: atoms.length }
}
