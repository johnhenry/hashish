export type DocumentId = string | number

export type ShingleUnit = 'char' | 'word'

export interface StorageAdapter {
  get<T = unknown>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  has(key: string): Promise<boolean>
  addToBucket(key: string, id: DocumentId): Promise<void>
  removeFromBucket(key: string, id: DocumentId): Promise<void>
  getBucket(key: string): Promise<DocumentId[]>
  clear(): Promise<void>
}

export interface LshOptions {
  /** Where documents, signatures, and LSH buckets are persisted. Defaults to an in-memory Map. */
  storage?: StorageAdapter
  /** Shingle (n-gram) length. Default: 5. */
  shingleSize?: number
  /** Shingle over characters or whitespace-delimited words. Default: 'char'. */
  shingleUnit?: ShingleUnit
  /** Number of MinHash functions (signature length). Default: 120. */
  numberOfHashFunctions?: number
  /** Rows per LSH band, used when a query doesn't override it. Default: 4. */
  bucketSize?: number
  /** Seed for the hash-function generator, for reproducible signatures across runs. */
  seed?: number
}

interface QueryOptions {
  /** Rows per LSH band. Smaller = more candidates (higher recall, lower precision). */
  bucketSize?: number
  /** Re-rank LSH candidates by exact Jaccard similarity of their shingle sets. */
  rerank?: boolean
  /** Drop candidates below this similarity. Only meaningful with `rerank: true`. */
  minSimilarity?: number
  /** Cap the number of returned candidates. */
  limit?: number
}

export type Query =
  (QueryOptions & { id: DocumentId; text?: never }) | (QueryOptions & { text: string; id?: never })

export interface QueryResult {
  id: DocumentId
  /** Exact Jaccard similarity to the query, only present when `rerank: true` was requested. */
  similarity?: number
}
