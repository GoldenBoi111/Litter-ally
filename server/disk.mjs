import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Ids that may become file names. Anything else never reaches the file system. */
export const SAFE_ID = /^[A-Za-z0-9_-]{1,100}$/

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

/** Write to a temp file, flush it, then rename over the target, so a crash leaves the old file or the new one, never half of either. */
export async function writeAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${randomUUID()}.tmp`
  const handle = await open(temp, 'w')
  try {
    await handle.writeFile(data)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await rename(temp, path)
}

export const writeJson = (path, value) => writeAtomic(path, JSON.stringify(value))

const chains = new Map()

/** Runs fn after every earlier call with the same key has settled. One process owns the data folder, so this is the whole write lock. */
export function withLock(key, fn) {
  const run = (chains.get(key) || Promise.resolve()).then(fn, fn)
  const settled = run.then(() => {}, () => {})
  chains.set(key, settled)
  settled.then(() => { if (chains.get(key) === settled) chains.delete(key) })
  return run
}
