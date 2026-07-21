import type { ShingleUnit } from './types'

/** Splits a document into overlapping n-grams (shingles), over characters or words. */
export class Shingle {
  readonly size: number
  readonly unit: ShingleUnit

  constructor(size = 5, unit: ShingleUnit = 'char') {
    if (size < 1) throw new Error('shingleSize must be >= 1')
    this.size = size
    this.unit = unit
  }

  shingle(document: string): string[] {
    return this.unit === 'word' ? this.shingleWords(document) : this.shingleChars(document)
  }

  private shingleChars(document: string): string[] {
    if (document.length === 0) return []
    if (document.length <= this.size) return [document]
    const shingles: string[] = []
    for (let i = 0; i + this.size <= document.length; i += 1) {
      shingles.push(document.slice(i, i + this.size))
    }
    return shingles
  }

  private shingleWords(document: string): string[] {
    const words = document.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return []
    if (words.length <= this.size) return [words.join(' ')]
    const shingles: string[] = []
    for (let i = 0; i + this.size <= words.length; i += 1) {
      shingles.push(words.slice(i, i + this.size).join(' '))
    }
    return shingles
  }
}
