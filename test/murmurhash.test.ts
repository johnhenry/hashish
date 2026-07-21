import { describe, expect, it } from 'vitest'
import { murmurhash3_32 } from '../src/murmurhash'

describe('murmurhash3_32', () => {
  it('is deterministic for the same input and seed', () => {
    expect(murmurhash3_32('hello world', 42)).toBe(murmurhash3_32('hello world', 42))
  })

  it('differs across seeds for the same input', () => {
    expect(murmurhash3_32('hello world', 1)).not.toBe(murmurhash3_32('hello world', 2))
  })

  it('differs across inputs for the same seed', () => {
    expect(murmurhash3_32('hello', 0)).not.toBe(murmurhash3_32('world', 0))
  })

  it('always returns an unsigned 32-bit integer', () => {
    for (const input of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'x'.repeat(1000)]) {
      const hash = murmurhash3_32(input, 12345)
      expect(hash).toBeGreaterThanOrEqual(0)
      expect(hash).toBeLessThanOrEqual(0xffffffff)
      expect(Number.isInteger(hash)).toBe(true)
    }
  })

  it('matches the reference MurmurHash3 x86 32-bit algorithm', () => {
    // Cross-checked against the `murmurhash3js-revisited` reference implementation.
    expect(murmurhash3_32('', 0)).toBe(0)
    expect(murmurhash3_32('test', 0)).toBe(3127628307)
    expect(murmurhash3_32('hello world', 42)).toBe(3926694905)
  })
})
