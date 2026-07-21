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
