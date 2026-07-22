import { Hashish } from './Hashish'
import type { HashishOptions } from './types'

export { Hashish } from './Hashish'
export { MemoryStorage } from './storages/MemoryStorage'
export { RedisStorage } from './storages/RedisStorage'
export type { RedisLikeClient } from './storages/RedisStorage'
export { murmurhash3_32 } from './murmurhash'
export { estimateSimilarity } from './Hash'
export type {
  DocumentId,
  HashishExport,
  HashishOptions,
  Query,
  QueryResult,
  ShingleUnit,
  StorageAdapter,
} from './types'

/** Convenience factory, equivalent to `new Hashish(options)`. */
export function createHashish(options?: HashishOptions): Hashish {
  return new Hashish(options)
}

export default Hashish
