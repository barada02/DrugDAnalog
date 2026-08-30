// Copies the RDKit wasm build out of node_modules into public/ so it is served
// from a stable URL and skips the bundler entirely. Runs on install and before
// dev/build, which keeps the 6.9 MB blob out of git.
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const from = join(root, 'node_modules', '@rdkit', 'rdkit', 'dist')
const to = join(root, 'public', 'rdkit')

await mkdir(to, { recursive: true })
for (const file of ['RDKit_minimal.js', 'RDKit_minimal.wasm']) {
  await copyFile(join(from, file), join(to, file))
}
console.log('RDKit assets synced to public/rdkit')
