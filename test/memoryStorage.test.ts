import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../src/storages/MemoryStorage'

describe('MemoryStorage', () => {
  it('round-trips arbitrary values, including falsy ones', async () => {
    const storage = new MemoryStorage()
    await storage.set('zero', 0)
    await storage.set('empty', '')
    await storage.set('false', false)
    expect(await storage.get('zero')).toBe(0)
    expect(await storage.get('empty')).toBe('')
    expect(await storage.get('false')).toBe(false)
  })

  it('has() reports existence, not truthiness (regression: falsy values are not "missing")', async () => {
    const storage = new MemoryStorage()
    await storage.set('zero', 0)
    expect(await storage.has('zero')).toBe(true)
    expect(await storage.has('never-set')).toBe(false)
  })

  it('accumulates ids in a bucket', async () => {
    const storage = new MemoryStorage()
    await storage.addToBucket('band:0:x', 1)
    await storage.addToBucket('band:0:x', 2)
    expect(await storage.getBucket('band:0:x')).toEqual([1, 2])
  })

  it('removes an id from a bucket and cleans up when empty', async () => {
    const storage = new MemoryStorage()
    await storage.addToBucket('band:0:x', 1)
    await storage.addToBucket('band:0:x', 2)
    await storage.removeFromBucket('band:0:x', 1)
    expect(await storage.getBucket('band:0:x')).toEqual([2])
    await storage.removeFromBucket('band:0:x', 2)
    expect(await storage.getBucket('band:0:x')).toEqual([])
    expect(await storage.has('band:0:x')).toBe(false)
  })

  it('getBucket returns an empty array for an unknown key', async () => {
    const storage = new MemoryStorage()
    expect(await storage.getBucket('nope')).toEqual([])
  })

  it('delete removes a key', async () => {
    const storage = new MemoryStorage()
    await storage.set('a', 1)
    await storage.delete('a')
    expect(await storage.has('a')).toBe(false)
  })

  it('clear empties all state', async () => {
    const storage = new MemoryStorage()
    await storage.set('a', 1)
    await storage.addToBucket('b', 1)
    await storage.clear()
    expect(await storage.has('a')).toBe(false)
    expect(await storage.getBucket('b')).toEqual([])
  })

  describe('toJSON / fromJSON', () => {
    it('round-trips full internal state, including falsy values', async () => {
      const storage = new MemoryStorage()
      await storage.set('doc:1', 'hello')
      await storage.set('zero', 0)
      await storage.addToBucket('band:0:x', 1)
      await storage.addToBucket('band:0:x', 'abc')

      const restored = MemoryStorage.fromJSON(storage.toJSON())
      expect(await restored.get('doc:1')).toBe('hello')
      expect(await restored.get('zero')).toBe(0)
      expect(await restored.getBucket('band:0:x')).toEqual([1, 'abc'])
    })

    it('is a plain array, so JSON.stringify(storage) works directly', async () => {
      const storage = new MemoryStorage()
      await storage.set('a', 1)
      const restored = MemoryStorage.fromJSON(JSON.parse(JSON.stringify(storage)) as Array<[string, unknown]>)
      expect(await restored.get('a')).toBe(1)
    })

    it('is independent of the original after restoring (no shared Map)', async () => {
      const storage = new MemoryStorage()
      await storage.set('a', 1)
      const restored = MemoryStorage.fromJSON(storage.toJSON())
      await storage.set('a', 2)
      expect(await restored.get('a')).toBe(1)
    })
  })
})
