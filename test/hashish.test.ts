import { beforeEach, describe, expect, it } from 'vitest'
import { Hashish } from '../src/Hashish'
import { MemoryStorage } from '../src/storages/MemoryStorage'

describe('Hashish', () => {
  describe('construction', () => {
    it('rejects numberOfHashFunctions < 1', () => {
      expect(() => new Hashish({ numberOfHashFunctions: 0 })).toThrow()
    })

    it('rejects a bucketSize outside [1, numberOfHashFunctions]', () => {
      expect(() => new Hashish({ numberOfHashFunctions: 10, bucketSize: 0 })).toThrow()
      expect(() => new Hashish({ numberOfHashFunctions: 10, bucketSize: 11 })).toThrow()
    })
  })

  describe('documents', () => {
    let hashish: Hashish

    beforeEach(() => {
      hashish = new Hashish({ seed: 1, numberOfHashFunctions: 60, bucketSize: 4, shingleSize: 4 })
    })

    it('stores and retrieves a document by id', async () => {
      await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      expect(await hashish.getDocument(1)).toBe('the quick brown fox jumps over the lazy dog')
    })

    it('reports hasDocument / documentIds / size', async () => {
      expect(await hashish.size()).toBe(0)
      await hashish.addDocument('a', 'the quick brown fox')
      await hashish.addDocument('b', 'jumps over the lazy dog')
      expect(await hashish.hasDocument('a')).toBe(true)
      expect(await hashish.hasDocument('missing')).toBe(false)
      expect(await hashish.size()).toBe(2)
      expect(await hashish.documentIds()).toEqual(expect.arrayContaining(['a', 'b']))
    })

    it('exposes the raw MinHash signature via getSignature', async () => {
      expect(await hashish.getSignature(1)).toBeUndefined()
      await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      const signature = await hashish.getSignature(1)
      expect(signature).toHaveLength(60) // numberOfHashFunctions
      expect(signature!.every((value) => Number.isInteger(value))).toBe(true)
      // deterministic for a given seed + document
      const other = new Hashish({ seed: 1, numberOfHashFunctions: 60, bucketSize: 4, shingleSize: 4 })
      await other.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      expect(await other.getSignature(1)).toEqual(signature)
    })

    it('rejects an empty document', async () => {
      await expect(hashish.addDocument(1, '')).rejects.toThrow()
    })

    it('gracefully shingles a document shorter than the shingle size instead of crashing (regression: the original range() helper threw a RangeError for this)', async () => {
      await expect(hashish.addDocument(1, 'ab')).resolves.toBeUndefined()
      expect(await hashish.getDocument(1)).toBe('ab')
    })

    it('rejects text that produces no shingles at all (whitespace-only text under word shingling)', async () => {
      const wordHashish = new Hashish({ shingleUnit: 'word', seed: 1 })
      await expect(wordHashish.addDocument(1, '   ')).rejects.toThrow()
    })

    it('removeDocument removes it from storage and future query results', async () => {
      const text = 'the quick brown fox jumps over the lazy dog repeatedly and often'
      await hashish.addDocument(1, text)
      await hashish.addDocument(2, text)
      await hashish.removeDocument(1)
      expect(await hashish.getDocument(1)).toBeUndefined()
      expect(await hashish.hasDocument(1)).toBe(false)
      const results = await hashish.query({ id: 2 })
      expect(results.map((r) => r.id)).not.toContain(1)
    })

    it('removeDocument on an unknown id is a no-op', async () => {
      await expect(hashish.removeDocument('nope')).resolves.toBeUndefined()
    })

    it('clear empties the index', async () => {
      await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await hashish.clear()
      expect(await hashish.size()).toBe(0)
      expect(await hashish.getDocument(1)).toBeUndefined()
    })
  })

  describe('query', () => {
    let hashish: Hashish
    const shared =
      'the quick brown fox jumps over the lazy dog while several curious woodland creatures watch nearby'
    const nearDuplicate =
      'the quick brown fox jumps over the lazy dog while several curious woodland creatures watch closely'
    const unrelated =
      'quarterly revenue projections indicate a modest increase across all regional sales divisions'

    beforeEach(async () => {
      hashish = new Hashish({ seed: 7, numberOfHashFunctions: 120, bucketSize: 4, shingleSize: 5 })
      await hashish.addDocument(1, shared)
      await hashish.addDocument(2, nearDuplicate)
      await hashish.addDocument(3, unrelated)
    })

    it('finds a near-duplicate as a candidate when querying by id', async () => {
      const results = await hashish.query({ id: 1 })
      expect(results.map((r) => r.id)).toContain(2)
    })

    it('finds a near-duplicate as a candidate when querying by text', async () => {
      const results = await hashish.query({ text: shared })
      expect(results.map((r) => r.id)).toContain(2)
    })

    it('excludes the queried document itself from its own results', async () => {
      const results = await hashish.query({ id: 1 })
      expect(results.map((r) => r.id)).not.toContain(1)
    })

    it('does not spuriously match an unrelated document (regression: buckets must key on the full band, not a bare hash value)', async () => {
      const results = await hashish.query({ id: 1 })
      expect(results.map((r) => r.id)).not.toContain(3)
    })

    it('throws when neither id nor text is given', async () => {
      // @ts-expect-error intentionally malformed for the test
      await expect(hashish.query({})).rejects.toThrow()
    })

    it('throws when the queried id was never indexed', async () => {
      await expect(hashish.query({ id: 'ghost' })).rejects.toThrow()
    })

    it('rerank sorts candidates by descending exact Jaccard similarity', async () => {
      const results = await hashish.query({ id: 1, bucketSize: 1, rerank: true })
      expect(results.length).toBeGreaterThan(0)
      for (let i = 1; i < results.length; i += 1) {
        expect(results[i - 1]!.similarity!).toBeGreaterThanOrEqual(results[i]!.similarity!)
      }
      // the near-duplicate should score higher than the unrelated document, if both are candidates
      const byId = new Map(results.map((r) => [r.id, r.similarity]))
      if (byId.has(2) && byId.has(3)) {
        expect(byId.get(2)!).toBeGreaterThan(byId.get(3)!)
      }
    })

    it('rerank + minSimilarity filters out weak candidates', async () => {
      const results = await hashish.query({ id: 1, bucketSize: 1, rerank: true, minSimilarity: 0.9 })
      for (const result of results) {
        expect(result.similarity!).toBeGreaterThanOrEqual(0.9)
      }
    })

    it('limit caps the number of results', async () => {
      const results = await hashish.query({ id: 1, bucketSize: 1, rerank: true, limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })

  describe('similarity', () => {
    it('is 1 for identical text and lower for dissimilar text', () => {
      const hashish = new Hashish({ shingleSize: 4 })
      expect(hashish.similarity('hello world', 'hello world')).toBe(1)
      expect(hashish.similarity('hello world', 'the quarterly revenue report')).toBeLessThan(1)
    })
  })

  describe('estimateSimilarity', () => {
    it('estimates a higher similarity for a near-duplicate than for an unrelated document', async () => {
      const hashish = new Hashish({ seed: 5, numberOfHashFunctions: 200, shingleSize: 5 })
      await hashish.addDocument(
        1,
        'the quick brown fox jumps over the lazy dog while several curious woodland creatures watch nearby',
      )
      await hashish.addDocument(
        2,
        'the quick brown fox jumps over the lazy dog while several curious woodland creatures watch closely',
      )
      await hashish.addDocument(
        3,
        'quarterly revenue projections indicate a modest increase across all regions',
      )

      const withNearDuplicate = await hashish.estimateSimilarity(1, 2)
      const withUnrelated = await hashish.estimateSimilarity(1, 3)
      expect(withNearDuplicate).toBeGreaterThan(withUnrelated)
    })

    it('is 1 when comparing a document to itself', async () => {
      const hashish = new Hashish({ seed: 1, shingleSize: 4 })
      await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      expect(await hashish.estimateSimilarity(1, 1)).toBe(1)
    })

    it('throws when either id is not indexed', async () => {
      const hashish = new Hashish({ seed: 1, shingleSize: 4 })
      await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await expect(hashish.estimateSimilarity(1, 'ghost')).rejects.toThrow()
      await expect(hashish.estimateSimilarity('ghost', 1)).rejects.toThrow()
    })
  })

  describe('deterministic seeding', () => {
    it('produces identical signatures/results across separate instances with the same seed', async () => {
      const config = { seed: 99, numberOfHashFunctions: 40, bucketSize: 2, shingleSize: 4 } as const
      const a = new Hashish(config)
      const b = new Hashish(config)
      await a.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await b.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await a.addDocument(2, 'the quick brown fox jumps over the lazy dog again')
      await b.addDocument(2, 'the quick brown fox jumps over the lazy dog again')
      expect(await a.query({ id: 1 })).toEqual(await b.query({ id: 1 }))
    })
  })

  describe('custom storage', () => {
    it('accepts an injected StorageAdapter instance instead of a global singleton', async () => {
      const storage = new MemoryStorage()
      const a = new Hashish({ storage, seed: 1 })
      const b = new Hashish({ seed: 1 }) // independent instance, its own default MemoryStorage
      await a.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      expect(await a.hasDocument(1)).toBe(true)
      expect(await b.hasDocument(1)).toBe(false) // no shared global state between instances
    })
  })

  describe('exportIndex / importIndex / migrateTo', () => {
    const docs: Array<[number, string]> = [
      [1, 'the quick brown fox jumps over the lazy dog while several creatures watch nearby'],
      [2, 'the quick brown fox jumps over the lazy dog while several creatures watch closely'],
      [3, 'quarterly revenue projections indicate a modest increase across all regions'],
    ]

    it('exportIndex captures the config and every document', async () => {
      const hashish = new Hashish({ seed: 42, shingleSize: 5, numberOfHashFunctions: 60, bucketSize: 3 })
      for (const [id, text] of docs) await hashish.addDocument(id, text)

      const exported = await hashish.exportIndex()
      expect(exported.options).toEqual({
        shingleSize: 5,
        shingleUnit: 'char',
        numberOfHashFunctions: 60,
        bucketSize: 3,
        seed: 42,
      })
      expect(exported.documents).toHaveLength(3)
      expect(exported.documents).toEqual(expect.arrayContaining(docs.map(([id, text]) => ({ id, text }))))
    })

    it('importIndex rebuilds a fully working, byte-identical index when seed is set', async () => {
      const original = new Hashish({ seed: 42, shingleSize: 5, numberOfHashFunctions: 60, bucketSize: 3 })
      for (const [id, text] of docs) await original.addDocument(id, text)

      const restored = await Hashish.importIndex(await original.exportIndex())

      expect(await restored.size()).toBe(3)
      for (const [id, text] of docs) {
        expect(await restored.getDocument(id)).toBe(text)
        expect(await restored.getSignature(id)).toEqual(await original.getSignature(id))
      }
      expect((await restored.query({ id: 1 })).map((r) => r.id)).toEqual(
        (await original.query({ id: 1 })).map((r) => r.id),
      )
    })

    it('importIndex still produces a correct (if not byte-identical) index without a seed', async () => {
      const original = new Hashish({ shingleSize: 5, numberOfHashFunctions: 60, bucketSize: 1 })
      for (const [id, text] of docs) await original.addDocument(id, text)

      const restored = await Hashish.importIndex(await original.exportIndex())
      // near-duplicate 2 should still be found as similar to 1 in the rebuilt index
      expect((await restored.query({ id: 1, rerank: true })).map((r) => r.id)).toContain(2)
    })

    it('importIndex can load into an arbitrary storage backend', async () => {
      const original = new Hashish({ seed: 1, shingleSize: 4 })
      await original.addDocument(1, 'the quick brown fox jumps over the lazy dog')

      const destination = new MemoryStorage()
      const restored = await Hashish.importIndex(await original.exportIndex(), destination)
      expect(restored.storage).toBe(destination)
      expect(await restored.getDocument(1)).toBe('the quick brown fox jumps over the lazy dog')
    })

    it('migrateTo moves the index to a new storage backend without mutating the original', async () => {
      const original = new Hashish({ seed: 1, shingleSize: 4 })
      await original.addDocument(1, 'the quick brown fox jumps over the lazy dog')

      const destination = new MemoryStorage()
      const migrated = await original.migrateTo(destination)

      expect(migrated.storage).toBe(destination)
      expect(await migrated.getDocument(1)).toBe('the quick brown fox jumps over the lazy dog')
      expect(await original.getDocument(1)).toBe('the quick brown fox jumps over the lazy dog') // untouched
    })
  })

  describe('word shingling', () => {
    it('supports word-level shingles as an alternative to character shingles', async () => {
      const hashish = new Hashish({ shingleUnit: 'word', shingleSize: 3, seed: 1 })
      await hashish.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await hashish.addDocument(2, 'the quick brown fox leaps over the lazy dog')
      const results = await hashish.query({ id: 1, bucketSize: 1 })
      expect(results.map((r) => r.id)).toContain(2)
    })
  })
})
