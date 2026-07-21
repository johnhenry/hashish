import { murmurhash3_32 } from './murmurhash'
import { RandomSeed } from './RandomSeed'

/** Computes MinHash signatures from a document's shingle set. */
export class Hash {
  private readonly size: number
  private readonly randomSeed: RandomSeed

  constructor(numberOfHashFunctions: number, randomSeed: RandomSeed) {
    this.size = numberOfHashFunctions
    this.randomSeed = randomSeed
  }

  getSignature(shingles: string[]): number[] {
    if (shingles.length === 0) {
      throw new Error('Cannot compute a MinHash signature for an empty shingle set.')
    }
    const signature = new Array<number>(this.size)
    for (let i = 0; i < this.size; i += 1) {
      const seed = this.randomSeed.get(i)
      let min = Infinity
      for (const shingle of shingles) {
        const hash = murmurhash3_32(shingle, seed)
        if (hash < min) min = hash
      }
      signature[i] = min
    }
    return signature
  }
}

/**
 * MinHash's estimate of the Jaccard similarity between two signatures: the fraction of
 * positions where they agree. This is what makes signatures comparable "by eye" — a
 * single signature value is meaningless on its own, but `P(signatureA[i] === signatureB[i])`
 * equals the Jaccard similarity of the documents they were computed from, so counting
 * matching positions approximates it. Accuracy improves with more hash functions; with n
 * functions the estimate's standard error is roughly `sqrt(p(1-p)/n)`.
 */
export function estimateSimilarity(signatureA: number[], signatureB: number[]): number {
  if (signatureA.length !== signatureB.length) {
    throw new Error('Signatures must have the same length to compare.')
  }
  if (signatureA.length === 0) return 1
  let agreement = 0
  for (let i = 0; i < signatureA.length; i += 1) {
    if (signatureA[i] === signatureB[i]) agreement += 1
  }
  return agreement / signatureA.length
}
