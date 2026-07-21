import { describe, expect, it } from 'vitest'
import { Hash } from '../src/Hash'
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
