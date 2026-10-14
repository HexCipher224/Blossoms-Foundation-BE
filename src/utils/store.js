import fs from 'node:fs/promises'
import path from 'node:path'

const EMPTY = () => ({ donations: [], messages: [], subscribers: [] })

// Minimal JSON-file store: fine for a small nonprofit site and for getting started.
// Writes are serialized and atomic (write temp file, then rename).
// For higher volume or multiple server instances, replace with PostgreSQL/MongoDB.
export class Store {
  constructor(file) {
    this.file = file
    this.data = null
    this.queue = Promise.resolve()
  }

  async load() {
    if (this.data) return
    try {
      this.data = JSON.parse(await fs.readFile(this.file, 'utf8'))
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
      this.data = EMPTY()
    }
    for (const [key, value] of Object.entries(EMPTY())) this.data[key] ??= value
  }

  async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2))
    await fs.rename(tmp, this.file)
  }

  async read(fn) {
    await this.queue
    await this.load()
    return fn(this.data)
  }

  mutate(fn) {
    const run = this.queue.then(async () => {
      await this.load()
      const result = await fn(this.data)
      await this.save()
      return result
    })
    this.queue = run.catch(() => {})
    return run
  }
}
