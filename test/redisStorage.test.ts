import { beforeEach, describe, expect, it } from 'vitest'
import type { RedisLikeClient } from '../src/storages/RedisStorage'
import { RedisStorage } from '../src/storages/RedisStorage'

/** Minimal in-memory fake satisfying RedisLikeClient, for testing without a real Redis server. */
class FakeRedisClient implements RedisLikeClient {
  private strings = new Map<string, string>()
  private sets = new Map<string, Set<string>>()

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null
  }

  async set(key: string, value: string): Promise<void> {
    this.strings.set(key, value)
  }

  async del(key: string): Promise<void> {
    this.strings.delete(key)
    this.sets.delete(key)
  }

  async sadd(key: string, member: string): Promise<void> {
    const set = this.sets.get(key) ?? new Set<string>()
    set.add(member)
    this.sets.set(key, set)
  }

  async srem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member)
  }

  async smembers(key: string): Promise<string[]> {
    return [...(this.sets.get(key) ?? [])]
  }

  async keys(pattern: string): Promise<string[]> {
    const prefix = pattern.replace(/\*$/, '')
    return [...this.strings.keys(), ...this.sets.keys()].filter((key) => key.startsWith(prefix))
  }
}

describe('RedisStorage', () => {
  let client: FakeRedisClient
  let storage: RedisStorage

  beforeEach(() => {
    client = new FakeRedisClient()
    storage = new RedisStorage(client)
  })

  it('round-trips JSON-serializable values', async () => {
    await storage.set('doc:1', { title: 'hello' })
    expect(await storage.get('doc:1')).toEqual({ title: 'hello' })
  })

  it('namespaces keys under the given prefix', async () => {
    await storage.set('doc:1', 'hi')
    expect(await client.get('lsh:doc:1')).toBe(JSON.stringify('hi'))
  })

  it('supports document ids that are numbers or strings via bucket round-trip', async () => {
    await storage.addToBucket('band:0:x', 1)
    await storage.addToBucket('band:0:x', 'abc')
    const bucket = await storage.getBucket('band:0:x')
    expect(bucket).toContain(1)
    expect(bucket).toContain('abc')
  })

  it('removes ids from a bucket', async () => {
    await storage.addToBucket('band:0:x', 1)
    await storage.addToBucket('band:0:x', 2)
    await storage.removeFromBucket('band:0:x', 1)
    expect(await storage.getBucket('band:0:x')).toEqual([2])
  })

  it('has() reflects key existence', async () => {
    await storage.set('a', 'value')
    expect(await storage.has('a')).toBe(true)
    expect(await storage.has('b')).toBe(false)
  })

  it('clear only removes keys under its own prefix', async () => {
    await storage.set('a', 1)
    await client.set('other:untouched', 'x')
    await storage.clear()
    expect(await storage.has('a')).toBe(false)
    expect(await client.get('other:untouched')).toBe('x')
  })
})
