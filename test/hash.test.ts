import { describe, expect, it } from 'vitest'
import { estimateSimilarity, Hash } from '../src/Hash'
import { RandomSeed } from '../src/RandomSeed'

describe('Hash', () => {
  it('produces a signature of the configured length', () => {
    const hash = new Hash(16, new RandomSeed(16, 1))
    expect(hash.getSignature(['abc', 'bcd', 'cde'])).toHaveLength(16)
  })

  it('is deterministic for a seeded RandomSeed', () => {
    const hashA = new Hash(16, new RandomSeed(16, 7))
    const hashB = new Hash(16, new RandomSeed(16, 7))
    expect(hashA.getSignature(['abc', 'bcd'])).toEqual(hashB.getSignature(['abc', 'bcd']))
  })

  it('produces similar signatures for highly overlapping shingle sets', () => {
    const hash = new Hash(200, new RandomSeed(200, 3))
    const a = ['abc', 'bcd', 'cde', 'def', 'efg']
    const b = ['abc', 'bcd', 'cde', 'def', 'efh'] // 4 of 5 shingles shared
    const sigA = hash.getSignature(a)
    const sigB = hash.getSignature(b)
    const agreement = sigA.filter((value, i) => value === sigB[i]).length / sigA.length
    // MinHash's agreement rate estimates Jaccard similarity (here 4/6 ~= 0.667).
    expect(agreement).toBeGreaterThan(0.4)
  })

  it('rejects an empty shingle set', () => {
    const hash = new Hash(8, new RandomSeed(8, 1))
    expect(() => hash.getSignature([])).toThrow()
  })
})

describe('estimateSimilarity', () => {
  it('is 1 for identical signatures', () => {
    const hash = new Hash(50, new RandomSeed(50, 1))
    const signature = hash.getSignature(['abc', 'bcd', 'cde'])
    expect(estimateSimilarity(signature, signature)).toBe(1)
  })

  it('is the fraction of positions that agree', () => {
    expect(estimateSimilarity([1, 2, 3, 4], [1, 2, 30, 40])).toBe(0.5)
    expect(estimateSimilarity([1, 2, 3, 4], [10, 20, 30, 40])).toBe(0)
  })

  it('rejects signatures of different lengths', () => {
    expect(() => estimateSimilarity([1, 2, 3], [1, 2])).toThrow()
  })

  it('estimates higher similarity for more overlapping shingle sets, on real signatures', () => {
    const hash = new Hash(300, new RandomSeed(300, 3))
    const a = hash.getSignature(['abc', 'bcd', 'cde', 'def', 'efg'])
    const nearDuplicate = hash.getSignature(['abc', 'bcd', 'cde', 'def', 'efh']) // 4/5 shared
    const unrelated = hash.getSignature(['zzz', 'yyy', 'xxx', 'www', 'vvv']) // none shared
    expect(estimateSimilarity(a, nearDuplicate)).toBeGreaterThan(estimateSimilarity(a, unrelated))
  })
})
