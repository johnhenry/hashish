import { describe, expect, it } from 'vitest'
import { Shingle } from '../src/Shingle'

describe('Shingle', () => {
  it('produces overlapping character n-grams', () => {
    const shingle = new Shingle(3, 'char')
    expect(shingle.shingle('abcdef')).toEqual(['abc', 'bcd', 'cde', 'def'])
  })

  it('returns the whole string as one shingle when shorter than the shingle size', () => {
    const shingle = new Shingle(10, 'char')
    expect(shingle.shingle('abc')).toEqual(['abc'])
  })

  it('returns an empty array for empty input', () => {
    const shingle = new Shingle(3, 'char')
    expect(shingle.shingle('')).toEqual([])
  })

  it('produces overlapping word n-grams', () => {
    const shingle = new Shingle(2, 'word')
    expect(shingle.shingle('the quick brown fox jumps')).toEqual([
      'the quick',
      'quick brown',
      'brown fox',
      'fox jumps',
    ])
  })

  it('collapses whitespace when word-shingling', () => {
    const shingle = new Shingle(2, 'word')
    expect(shingle.shingle('  the   quick  brown ')).toEqual(['the quick', 'quick brown'])
  })

  it('rejects a non-positive shingle size', () => {
    expect(() => new Shingle(0, 'char')).toThrow()
  })
})
