import { Lsh } from './Lsh'
import type { LshOptions } from './types'

export { Lsh } from './Lsh'
export { MemoryStorage } from './storages/MemoryStorage'
export { RedisStorage } from './storages/RedisStorage'
export type { RedisLikeClient } from './storages/RedisStorage'
export { murmurhash3_32 } from './murmurhash'
export type { DocumentId, LshOptions, Query, QueryResult, ShingleUnit, StorageAdapter } from './types'

/** Convenience factory, equivalent to `new Lsh(options)`. */
export function createLsh(options?: LshOptions): Lsh {
  return new Lsh(options)
}

export default Lsh
