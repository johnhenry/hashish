import { beforeEach, describe, expect, it } from 'vitest'
import { Lsh } from '../src/Lsh'
import { MemoryStorage } from '../src/storages/MemoryStorage'

describe('Lsh', () => {
  describe('construction', () => {
    it('rejects numberOfHashFunctions < 1', () => {
      expect(() => new Lsh({ numberOfHashFunctions: 0 })).toThrow()
    })

    it('rejects a bucketSize outside [1, numberOfHashFunctions]', () => {
      expect(() => new Lsh({ numberOfHashFunctions: 10, bucketSize: 0 })).toThrow()
      expect(() => new Lsh({ numberOfHashFunctions: 10, bucketSize: 11 })).toThrow()
    })
  })

  describe('documents', () => {
    let lsh: Lsh

    beforeEach(() => {
      lsh = new Lsh({ seed: 1, numberOfHashFunctions: 60, bucketSize: 4, shingleSize: 4 })
    })

    it('stores and retrieves a document by id', async () => {
      await lsh.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      expect(await lsh.getDocument(1)).toBe('the quick brown fox jumps over the lazy dog')
    })

    it('reports hasDocument / documentIds / size', async () => {
      expect(await lsh.size()).toBe(0)
      await lsh.addDocument('a', 'the quick brown fox')
      await lsh.addDocument('b', 'jumps over the lazy dog')
      expect(await lsh.hasDocument('a')).toBe(true)
      expect(await lsh.hasDocument('missing')).toBe(false)
      expect(await lsh.size()).toBe(2)
      expect(await lsh.documentIds()).toEqual(expect.arrayContaining(['a', 'b']))
    })

    it('rejects an empty document', async () => {
      await expect(lsh.addDocument(1, '')).rejects.toThrow()
    })

    it('gracefully shingles a document shorter than the shingle size instead of crashing (regression: the original range() helper threw a RangeError for this)', async () => {
      await expect(lsh.addDocument(1, 'ab')).resolves.toBeUndefined()
      expect(await lsh.getDocument(1)).toBe('ab')
    })

    it('rejects text that produces no shingles at all (whitespace-only text under word shingling)', async () => {
      const wordLsh = new Lsh({ shingleUnit: 'word', seed: 1 })
      await expect(wordLsh.addDocument(1, '   ')).rejects.toThrow()
    })

    it('removeDocument removes it from storage and future query results', async () => {
      const text = 'the quick brown fox jumps over the lazy dog repeatedly and often'
      await lsh.addDocument(1, text)
      await lsh.addDocument(2, text)
      await lsh.removeDocument(1)
      expect(await lsh.getDocument(1)).toBeUndefined()
      expect(await lsh.hasDocument(1)).toBe(false)
      const results = await lsh.query({ id: 2 })
      expect(results.map((r) => r.id)).not.toContain(1)
    })

    it('removeDocument on an unknown id is a no-op', async () => {
      await expect(lsh.removeDocument('nope')).resolves.toBeUndefined()
    })

    it('clear empties the index', async () => {
      await lsh.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await lsh.clear()
      expect(await lsh.size()).toBe(0)
      expect(await lsh.getDocument(1)).toBeUndefined()
    })
  })

  describe('query', () => {
    let lsh: Lsh
    const shared =
      'the quick brown fox jumps over the lazy dog while several curious woodland creatures watch nearby'
    const nearDuplicate =
      'the quick brown fox jumps over the lazy dog while several curious woodland creatures watch closely'
    const unrelated =
      'quarterly revenue projections indicate a modest increase across all regional sales divisions'

    beforeEach(async () => {
      lsh = new Lsh({ seed: 7, numberOfHashFunctions: 120, bucketSize: 4, shingleSize: 5 })
      await lsh.addDocument(1, shared)
      await lsh.addDocument(2, nearDuplicate)
      await lsh.addDocument(3, unrelated)
    })

    it('finds a near-duplicate as a candidate when querying by id', async () => {
      const results = await lsh.query({ id: 1 })
      expect(results.map((r) => r.id)).toContain(2)
    })

    it('finds a near-duplicate as a candidate when querying by text', async () => {
      const results = await lsh.query({ text: shared })
      expect(results.map((r) => r.id)).toContain(2)
    })

    it('excludes the queried document itself from its own results', async () => {
      const results = await lsh.query({ id: 1 })
      expect(results.map((r) => r.id)).not.toContain(1)
    })

    it('does not spuriously match an unrelated document (regression: buckets must key on the full band, not a bare hash value)', async () => {
      const results = await lsh.query({ id: 1 })
      expect(results.map((r) => r.id)).not.toContain(3)
    })

    it('throws when neither id nor text is given', async () => {
      // @ts-expect-error intentionally malformed for the test
      await expect(lsh.query({})).rejects.toThrow()
    })

    it('throws when the queried id was never indexed', async () => {
      await expect(lsh.query({ id: 'ghost' })).rejects.toThrow()
    })

    it('rerank sorts candidates by descending exact Jaccard similarity', async () => {
      const results = await lsh.query({ id: 1, bucketSize: 1, rerank: true })
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
      const results = await lsh.query({ id: 1, bucketSize: 1, rerank: true, minSimilarity: 0.9 })
      for (const result of results) {
        expect(result.similarity!).toBeGreaterThanOrEqual(0.9)
      }
    })

    it('limit caps the number of results', async () => {
      const results = await lsh.query({ id: 1, bucketSize: 1, rerank: true, limit: 1 })
      expect(results.length).toBeLessThanOrEqual(1)
    })
  })

  describe('similarity', () => {
    it('is 1 for identical text and lower for dissimilar text', () => {
      const lsh = new Lsh({ shingleSize: 4 })
      expect(lsh.similarity('hello world', 'hello world')).toBe(1)
      expect(lsh.similarity('hello world', 'the quarterly revenue report')).toBeLessThan(1)
    })
  })

  describe('deterministic seeding', () => {
    it('produces identical signatures/results across separate instances with the same seed', async () => {
      const config = { seed: 99, numberOfHashFunctions: 40, bucketSize: 2, shingleSize: 4 } as const
      const a = new Lsh(config)
      const b = new Lsh(config)
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
      const a = new Lsh({ storage, seed: 1 })
      const b = new Lsh({ seed: 1 }) // independent instance, its own default MemoryStorage
      await a.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      expect(await a.hasDocument(1)).toBe(true)
      expect(await b.hasDocument(1)).toBe(false) // no shared global state between instances
    })
  })

  describe('word shingling', () => {
    it('supports word-level shingles as an alternative to character shingles', async () => {
      const lsh = new Lsh({ shingleUnit: 'word', shingleSize: 3, seed: 1 })
      await lsh.addDocument(1, 'the quick brown fox jumps over the lazy dog')
      await lsh.addDocument(2, 'the quick brown fox leaps over the lazy dog')
      const results = await lsh.query({ id: 1, bucketSize: 1 })
      expect(results.map((r) => r.id)).toContain(2)
    })
  })
})
