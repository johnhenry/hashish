/** mulberry32 — small, fast, deterministic PRNG used when a `seed` is supplied. */
function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Generates the per-hash-function seeds MinHash uses. With an explicit `seed`, the same
 * sequence is produced every time, so MinHash signatures are reproducible across runs.
 */
export class RandomSeed {
  private readonly values: number[]

  constructor(size: number, seed?: number) {
    const next = seed === undefined ? Math.random : mulberry32(seed)
    this.values = Array.from({ length: size }, () => Math.floor(next() * 1_000_000_000))
  }

  get(ith: number): number {
    // ith is always within [0, size) — callers only iterate up to the configured size.
    return this.values[ith]!
  }
}
