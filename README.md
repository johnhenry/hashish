# lsh-js

[Locality-sensitive hashing](https://en.wikipedia.org/wiki/Locality-sensitive_hashing)
(LSH) for fast, scalable approximate nearest-neighbor / similarity search over text.
Documents are shingled, MinHashed, and bucketed with LSH banding so that similar
documents are cheap to find without comparing every pair.

> This is a modernized fork of [`agtabesh/lsh-js`](https://github.com/agtabesh/lsh-js),
> rewritten in TypeScript with a fixed banding algorithm, no native dependencies, and a
> pluggable storage layer. See [CHANGELOG.md](./CHANGELOG.md) for what changed and why.

- **Zero native dependencies.** MurmurHash3 is implemented in pure JS (no `node-gyp`,
  works in Node, browsers, and edge runtimes).
- **Pluggable storage.** In-memory by default; bring your own Redis-compatible client to
  share an index across processes or survive restarts.
- **Correct LSH banding.** Buckets are keyed by signature _position_, not just by value —
  see [CHANGELOG.md](./CHANGELOG.md) for the bug this fixes.
- **TypeScript-first**, ESM + CJS builds, no bundled dependencies.

## Install

```
npm install lsh-js
```

## Usage

```ts
import { Lsh } from 'lsh-js'

const lsh = new Lsh({
  shingleSize: 5,
  numberOfHashFunctions: 120,
  bucketSize: 4, // rows per LSH band; lower = more recall, higher = more precision
})

await lsh.addDocument(1, 'the quick brown fox jumps over the lazy dog')
await lsh.addDocument(2, 'the quick brown fox jumps over the lazy dog again')
await lsh.addDocument(3, 'quarterly revenue projections indicate a modest increase')

// find documents similar to document 1
const byId = await lsh.query({ id: 1 })

// or query with raw text instead of an indexed id
const byText = await lsh.query({ text: 'the quick brown fox' })

// re-rank LSH candidates by exact Jaccard similarity, and drop weak matches
const ranked = await lsh.query({ id: 1, rerank: true, minSimilarity: 0.3, limit: 10 })
// => [{ id: 2, similarity: 0.87 }]
```

All index/query methods are async, so the same code works whether `storage` is
in-memory or a network-backed adapter like Redis.

## API

### `new Lsh(options?)`

| option                  | default         | description                                                                     |
| ----------------------- | --------------- | ------------------------------------------------------------------------------- |
| `storage`               | `MemoryStorage` | A `StorageAdapter` instance. Defaults to an in-process `Map`.                   |
| `shingleSize`           | `5`             | Shingle (n-gram) length.                                                        |
| `shingleUnit`           | `'char'`        | Shingle over characters or `'word'`s.                                           |
| `numberOfHashFunctions` | `120`           | MinHash signature length. More = more accurate similarity estimates.            |
| `bucketSize`            | `4`             | Default rows-per-band for `query()`; smaller = higher recall / lower precision. |
| `seed`                  | random          | Seed the hash-function generator for reproducible signatures across runs.       |

### `lsh.addDocument(id, text): Promise<void>`

Indexes a document under `id`. Throws on an empty document, or one too short to
produce even a single shingle (e.g. whitespace-only text under word shingling).

### `lsh.query({ id | text, bucketSize?, rerank?, minSimilarity?, limit? }): Promise<QueryResult[]>`

Finds candidate documents similar to the given indexed `id` or raw `text`.

- `bucketSize` overrides the instance default for this query only — LSH buckets are
  stored per signature-position, so you can loosen or tighten it per query without
  re-indexing.
- `rerank: true` re-scores every LSH candidate by **exact** Jaccard similarity of shingle
  sets (more expensive, but precise) and sorts results descending by `similarity`.
- `minSimilarity` (with `rerank`) drops candidates below the threshold.
- `limit` caps the number of results.

Without `rerank`, `similarity` is omitted from results — those are unscored LSH
candidates (fast, approximate, may include false positives).

### Other methods

- `lsh.getDocument(id): Promise<string | undefined>`
- `lsh.getSignature(id): Promise<number[] | undefined>` — the raw MinHash signature stored for `id`.
- `lsh.hasDocument(id): Promise<boolean>`
- `lsh.removeDocument(id): Promise<void>`
- `lsh.documentIds(): Promise<DocumentId[]>`
- `lsh.size(): Promise<number>`
- `lsh.similarity(textA, textB): number` — exact Jaccard similarity, independent of the index.
- `lsh.clear(): Promise<void>`

### Storage adapters

```ts
import { Lsh, MemoryStorage, RedisStorage } from 'lsh-js'

// default — in-process, not shared across restarts or other processes
new Lsh({ storage: new MemoryStorage() })

// share an index across processes / persist it, using any client you've already configured
import Redis from 'ioredis'
new Lsh({ storage: new RedisStorage(new Redis()) })
```

`RedisStorage` is duck-typed against a minimal `RedisLikeClient` interface (`get`,
`set`, `del`, `sadd`, `srem`, `smembers`, `keys`) rather than depending on `ioredis`
directly — pass in an `ioredis`, `node-redis`, or any compatible client.

Implement `StorageAdapter` (see `src/types.ts`) to plug in another backend (SQL,
DynamoDB, etc).

## How it works

1. **Shingling** — the document is split into overlapping n-grams (`shingleSize`
   characters, or words if `shingleUnit: 'word'`).
2. **MinHashing** — `numberOfHashFunctions` independent hash functions each record the
   minimum hash over the shingle set, producing a fixed-length signature whose
   position-wise agreement rate approximates the Jaccard similarity between documents.
3. **LSH banding** — the signature is split into bands of `bucketSize` consecutive
   positions. Two documents are _candidates_ if they agree on every position within at
   least one band (an OR-of-ANDs), which is what makes lookups sub-linear instead of
   comparing every pair of documents.
4. **Optional re-ranking** — `rerank: true` computes exact Jaccard similarity on the
   (typically small) LSH candidate set, trading a little speed for precision.

## Benchmark

```
npm run bench
```

## Development

```
npm install
npm run lint
npm run typecheck
npm run test
npm run build
```

**All contributions are welcome.** Please make sure lint, typecheck, and tests pass, and
include tests for new behavior.

## License

MIT
