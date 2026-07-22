import type { DocumentId, StorageAdapter } from '../types'

/** Default in-process storage backend, backed by a Map. Not shared across processes. */
export class MemoryStorage implements StorageAdapter {
  private values = new Map<string, unknown>()

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async set(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key)
  }

  async has(key: string): Promise<boolean> {
    return this.values.has(key)
  }

  async addToBucket(key: string, id: DocumentId): Promise<void> {
    const bucket = (this.values.get(key) as DocumentId[] | undefined) ?? []
    bucket.push(id)
    this.values.set(key, bucket)
  }

  async removeFromBucket(key: string, id: DocumentId): Promise<void> {
    const bucket = this.values.get(key) as DocumentId[] | undefined
    if (!bucket) return
    const next = bucket.filter((existing) => existing !== id)
    if (next.length > 0) this.values.set(key, next)
    else this.values.delete(key)
  }

  async getBucket(key: string): Promise<DocumentId[]> {
    return (this.values.get(key) as DocumentId[] | undefined) ?? []
  }

  async clear(): Promise<void> {
    this.values = new Map()
  }

  /**
   * Dumps the entire internal state (documents, signatures, and buckets) as plain,
   * JSON-serializable data — named `toJSON` so `JSON.stringify(storage)` works directly.
   * Pair with `MemoryStorage.fromJSON()` to restore it without re-hashing anything. This
   * only round-trips into another `MemoryStorage`; it isn't a format other adapters read.
   */
  toJSON(): Array<[string, unknown]> {
    return [...this.values.entries()]
  }

  /** Restores a `MemoryStorage` from a `toJSON()` dump. */
  static fromJSON(entries: Array<[string, unknown]>): MemoryStorage {
    const storage = new MemoryStorage()
    storage.values = new Map(entries)
    return storage
  }
}
