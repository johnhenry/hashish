import { estimateSimilarity as estimateSignatureSimilarity, Hash } from './Hash'
import { RandomSeed } from './RandomSeed'
import { Shingle } from './Shingle'
import { MemoryStorage } from './storages/MemoryStorage'
import type { DocumentId, LshOptions, Query, QueryResult, StorageAdapter } from './types'

const DEFAULT_SHINGLE_SIZE = 5
const DEFAULT_NUMBER_OF_HASH_FUNCTIONS = 120
const DEFAULT_BUCKET_SIZE = 4
const DOCUMENT_IDS_KEY = '__lsh_document_ids__'

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection += 1
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export class Lsh {
  private readonly storage: StorageAdapter
  private readonly shingle: Shingle
  private readonly hash: Hash
  private readonly numberOfHashFunctions: number
  private readonly defaultBucketSize: number

  constructor(options: LshOptions = {}) {
    const shingleSize = options.shingleSize ?? DEFAULT_SHINGLE_SIZE
    const shingleUnit = options.shingleUnit ?? 'char'
    const numberOfHashFunctions = options.numberOfHashFunctions ?? DEFAULT_NUMBER_OF_HASH_FUNCTIONS
    const bucketSize = options.bucketSize ?? DEFAULT_BUCKET_SIZE

    if (numberOfHashFunctions < 1) {
      throw new Error('numberOfHashFunctions must be >= 1')
    }
    if (bucketSize < 1 || bucketSize > numberOfHashFunctions) {
      throw new Error('bucketSize must be between 1 and numberOfHashFunctions')
    }

    this.storage = options.storage ?? new MemoryStorage()
    this.shingle = new Shingle(shingleSize, shingleUnit)
    this.hash = new Hash(numberOfHashFunctions, new RandomSeed(numberOfHashFunctions, options.seed))
    this.numberOfHashFunctions = numberOfHashFunctions
    this.defaultBucketSize = bucketSize
  }

  /**
   * Keys a bucket by signature position AND value, so two documents only land in the same
   * bucket when they agree at that exact position (the original bug: bucketing by the bare
   * hash value let unrelated positions collide with each other).
   *
   * Buckets are stored per-position (not pre-grouped into fixed bands) so that `bucketSize`
   * — how many consecutive positions must all agree — can still be chosen per query, as the
   * original API promised, instead of being frozen at index time.
   */
  private positionKey(position: number, value: number): string {
    return `pos:${position}:${value}`
  }

  /** Intersects the per-position buckets for one band: candidates that agree on every row. */
  private async candidatesForBand(
    signature: number[],
    start: number,
    bucketSize: number,
  ): Promise<Set<DocumentId>> {
    const positionBuckets = await Promise.all(
      Array.from({ length: bucketSize }, (_, offset) =>
        this.storage.getBucket(this.positionKey(start + offset, signature[start + offset]!)),
      ),
    )
    const [first, ...rest] = positionBuckets
    let intersection = new Set<DocumentId>(first ?? [])
    for (const bucket of rest) {
      const bucketIds = new Set(bucket)
      intersection = new Set([...intersection].filter((id) => bucketIds.has(id)))
    }
    return intersection
  }

  async addDocument(id: DocumentId, text: string): Promise<void> {
    if (text.length === 0) {
      throw new Error('Cannot add an empty document.')
    }
    const shingles = this.shingle.shingle(text)
    if (shingles.length === 0) {
      throw new Error(`Document is too short to produce a shingle of size ${this.shingle.size}.`)
    }
    const signature = this.hash.getSignature(shingles)

    await this.storage.set(`document:${id}`, text)
    await this.storage.set(`signature:${id}`, signature)
    await Promise.all([
      ...signature.map((value, position) => this.storage.addToBucket(this.positionKey(position, value), id)),
      this.storage.addToBucket(DOCUMENT_IDS_KEY, id),
    ])
  }

  async removeDocument(id: DocumentId): Promise<void> {
    const signature = await this.storage.get<number[]>(`signature:${id}`)
    if (!signature) return
    await Promise.all([
      ...signature.map((value, position) =>
        this.storage.removeFromBucket(this.positionKey(position, value), id),
      ),
      this.storage.removeFromBucket(DOCUMENT_IDS_KEY, id),
      this.storage.delete(`document:${id}`),
      this.storage.delete(`signature:${id}`),
    ])
  }

  async getDocument(id: DocumentId): Promise<string | undefined> {
    return this.storage.get<string>(`document:${id}`)
  }

  /** The raw MinHash signature stored for `id` (length `numberOfHashFunctions`), if indexed. */
  async getSignature(id: DocumentId): Promise<number[] | undefined> {
    return this.storage.get<number[]>(`signature:${id}`)
  }

  async hasDocument(id: DocumentId): Promise<boolean> {
    return this.storage.has(`document:${id}`)
  }

  async documentIds(): Promise<DocumentId[]> {
    return this.storage.getBucket(DOCUMENT_IDS_KEY)
  }

  async size(): Promise<number> {
    return (await this.documentIds()).length
  }

  private async resolveQuery(q: Query): Promise<{ signature: number[]; shingles: string[] }> {
    if (q.id !== undefined) {
      const signature = await this.storage.get<number[]>(`signature:${q.id}`)
      if (!signature) {
        throw new Error(`No document indexed with id "${String(q.id)}".`)
      }
      const text = await this.storage.get<string>(`document:${q.id}`)
      return { signature, shingles: text ? this.shingle.shingle(text) : [] }
    }
    if (q.text) {
      const shingles = this.shingle.shingle(q.text)
      if (shingles.length === 0) {
        throw new Error(`Query text is too short to produce a shingle of size ${this.shingle.size}.`)
      }
      return { signature: this.hash.getSignature(shingles), shingles }
    }
    throw new Error('No input specified! Please specify either `id` or `text` to search for.')
  }

  async query(q: Query): Promise<QueryResult[]> {
    const bucketSize = q.bucketSize ?? this.defaultBucketSize
    const { signature, shingles } = await this.resolveQuery(q)
    if (bucketSize < 1 || bucketSize > signature.length) {
      throw new Error(`bucketSize must be between 1 and ${signature.length}`)
    }

    const bandStarts: number[] = []
    for (let start = 0; start + bucketSize <= signature.length; start += bucketSize) bandStarts.push(start)
    const bandCandidates = await Promise.all(
      bandStarts.map((start) => this.candidatesForBand(signature, start, bucketSize)),
    )

    const candidateIds = new Set<DocumentId>()
    for (const band of bandCandidates) {
      for (const id of band) candidateIds.add(id)
    }
    if (q.id !== undefined) candidateIds.delete(q.id)

    let results: QueryResult[] = [...candidateIds].map((id) => ({ id }))

    if (q.rerank) {
      const querySet = new Set(shingles)
      results = await Promise.all(
        results.map(async (result): Promise<QueryResult> => {
          const text = await this.storage.get<string>(`document:${result.id}`)
          const candidateSet = new Set(text ? this.shingle.shingle(text) : [])
          return { id: result.id, similarity: jaccard(querySet, candidateSet) }
        }),
      )
      results.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      if (q.minSimilarity !== undefined) {
        const threshold = q.minSimilarity
        results = results.filter((result) => (result.similarity ?? 0) >= threshold)
      }
    }

    return q.limit !== undefined ? results.slice(0, q.limit) : results
  }

  /** Exact Jaccard similarity between two shingle sets, independent of the index. */
  similarity(a: string, b: string): number {
    return jaccard(new Set(this.shingle.shingle(a)), new Set(this.shingle.shingle(b)))
  }

  /**
   * MinHash's *estimated* Jaccard similarity between two indexed documents, computed
   * from their stored signatures (fast, approximate — unlike `similarity()`, which is
   * exact but must re-shingle both documents' full text).
   */
  async estimateSimilarity(idA: DocumentId, idB: DocumentId): Promise<number> {
    const [signatureA, signatureB] = await Promise.all([this.getSignature(idA), this.getSignature(idB)])
    if (!signatureA) throw new Error(`No document indexed with id "${String(idA)}".`)
    if (!signatureB) throw new Error(`No document indexed with id "${String(idB)}".`)
    return estimateSignatureSimilarity(signatureA, signatureB)
  }

  async clear(): Promise<void> {
    await this.storage.clear()
  }
}
