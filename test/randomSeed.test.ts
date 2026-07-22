import { describe, expect, it } from 'vitest'
import { RandomSeed } from '../src/RandomSeed'

describe('RandomSeed', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new RandomSeed(10, 42)
    const b = new RandomSeed(10, 42)
    for (let i = 0; i < 10; i += 1) {
      expect(a.get(i)).toBe(b.get(i))
    }
  })

  it('produces different sequences for different seeds', () => {
    const a = new RandomSeed(10, 1)
    const b = new RandomSeed(10, 2)
    const values = Array.from({ length: 10 }, (_, i) => a.get(i) === b.get(i))
    expect(values.every(Boolean)).toBe(false)
  })

  it('generates the requested number of values', () => {
    const seed = new RandomSeed(5, 1)
    for (let i = 0; i < 5; i += 1) {
      expect(typeof seed.get(i)).toBe('number')
    }
  })
})
