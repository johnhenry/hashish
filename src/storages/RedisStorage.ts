import type { DocumentId, StorageAdapter } from '../types'

/**
 * The minimal subset of a Redis client's API this adapter needs. Deliberately duck-typed
 * (rather than depending on `ioredis` or `redis`) so you can pass in whichever client you
 * already have configured, or a compatible in-memory fake for tests.
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
  del(key: string): Promise<unknown>
  sadd(key: string, member: string): Promise<unknown>
  srem(key: string, member: string): Promise<unknown>
  smembers(key: string): Promise<string[]>
  keys(pattern: string): Promise<string[]>
}

/**
 * Storage backend for Redis (or any compatible client), so an LSH index can be shared
 * across processes or survive restarts. Bring your own connected client.
 *
 * @example
 * ```ts
 * import Redis from 'ioredis'
 * const hashish = new Hashish({ storage: new RedisStorage(new Redis()) })
 * ```
 */
export class RedisStorage implements StorageAdapter {
  constructor(
    private readonly client: RedisLikeClient,
    private readonly prefix = 'hashish:',
  ) {}

  private namespaced(key: string): string {
    return `${this.prefix}${key}`
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.namespaced(key))
    return raw === null ? undefined : (JSON.parse(raw) as T)
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.client.set(this.namespaced(key), JSON.stringify(value))
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.namespaced(key))
  }

  async has(key: string): Promise<boolean> {
    const raw = await this.client.get(this.namespaced(key))
    return raw !== null
  }

  async addToBucket(key: string, id: DocumentId): Promise<void> {
    await this.client.sadd(this.namespaced(key), JSON.stringify(id))
  }

  async removeFromBucket(key: string, id: DocumentId): Promise<void> {
    await this.client.srem(this.namespaced(key), JSON.stringify(id))
  }

  async getBucket(key: string): Promise<DocumentId[]> {
    const members = await this.client.smembers(this.namespaced(key))
    return members.map((member) => JSON.parse(member) as DocumentId)
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(`${this.prefix}*`)
    await Promise.all(keys.map((key) => this.client.del(key)))
  }
}
