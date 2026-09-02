// Copies large vendor bundles out of node_modules into public/ so they are
// served from stable URLs and skip the bundler entirely. Runs on install and
// before dev/build, which keeps ~7.5 MB of binaries out of git.
//
// RDKit is loaded on every page. 3Dmol is loaded ONLY when someone opts into
// the 3D view, so it must not enter the main bundle -- a script tag on demand
// is the simplest way to guarantee that.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const modules = join(root, 'node_modules')

const jobs = [
  {
    from: join(modules, '@rdkit', 'rdkit', 'dist'),
    to: join(root, 'public', 'rdkit'),
    files: ['RDKit_minimal.js', 'RDKit_minimal.wasm'],
  },
  {
    from: join(modules, '3dmol', 'build'),
    to: join(root, 'public', 'vendor'),
    files: ['3Dmol-min.js'],
  },
]

for (const job of jobs) {
  await mkdir(job.to, { recursive: true })
  for (const file of job.files) {
    await copyFile(join(job.from, file), join(job.to, file))
  }
}
console.log('Vendor assets synced to public/rdkit and public/vendor')
