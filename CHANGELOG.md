# Changelog

## 0.0.0 — Renamed to `hashish`, then rescoped to `@johnhenry/hashish`

Renamed the package (and the GitHub repo) from `lsh-js` to `hashish`, and renamed the
main exported class from `Lsh` to `Hashish` to match (`LshOptions` → `HashishOptions`,
`LshExport` → `HashishExport`, `createLsh` → `createHashish`). No behavioral changes
from 1.0.0 below — version reset to `0.0.0` to mark this as a fresh pre-release baseline
under the new name.

Published under `@johnhenry/hashish` instead of the unscoped `hashish` — the unscoped
name has been an unrelated, unmaintained package since 2011 ("Hash data structure
manipulation functions"), never available to publish to. Nothing under the unscoped
name was ever actually published from this repo; this is the first real publish.

## 1.0.0 — TypeScript rewrite

A full rewrite of [`agtabesh/lsh-js`](https://github.com/agtabesh/lsh-js) v0.1.0.
Breaking changes throughout — see below.

### Fixed

- **LSH banding never actually intersected.** `query()`'s per-band candidate filter
  (`candidates.filter(x => arr.includes(x))`) computed a filtered array and discarded
  it, so bands never performed the AND-intersection they were supposed to. Every band
  degraded to a plain union.
- **Buckets were keyed by bare hash value, not by position.** `addDocument` stored each
  document under `signature[i]` for every `i`, using the same flat namespace regardless
  of position. Two documents that happened to share a hash value at _different_
  signature positions could be bucketed together — not a valid LSH bucket. Buckets are
  now keyed by `(position, value)`, and `bucketSize` (rows-per-band) is applied as a
  proper AND across per-position buckets at query time, so it can still be overridden
  per query without re-indexing.
- **`Storage.has()` used truthiness, not existence.** `!!this._values.get(key)` reported
  falsy stored values (`0`, `''`, `false`) as missing.
- **Shingling a document shorter than `shingleSize` threw.** The original `range()`
  helper computed `Array(negative length)`, a `RangeError`. Short documents now shingle
  to themselves as a single shingle instead of crashing.

### Changed (breaking)

- **Async API.** `addDocument`, `getDocument`, `query`, `clear`, etc. all return
  `Promise`s now, so a storage backend can be network-backed (e.g. Redis) without a
  separate sync/async code path.
- **No more global singleton.** `Hashish.getInstance(config)` is gone; `config` after the
  first call used to be silently ignored. Use `new Hashish(options)` (or `createHashish(options)`)
  — you can now run multiple independent indexes in one process.
- **No more `@adonisjs/fold` DI container.** Storage/config wiring is now plain
  constructor injection. `storage` is passed as a `StorageAdapter` _instance_
  (`new MemoryStorage()` / `new RedisStorage(client)`), not a string key.
- **`murmurhash-native` replaced with a pure-JS MurmurHash3 (x86, 32-bit).** No native
  build step; works in browsers and edge runtimes. Cross-checked against the
  `murmurhash3js-revisited` reference implementation. (Also switched from the 128-bit
  to the 32-bit variant — irrelevant to correctness here, since signatures aren't
  portable across seeds/versions anyway.)
- **`query()`'s `id`/`text` are mutually exclusive in the type system** (a discriminated
  union), so passing both is now a type error, not silently-wrong behavior.

### Added

- `removeDocument(id)`, `hasDocument(id)`, `documentIds()`, `size()`, `getSignature(id)`
  (exposes the raw MinHash signature, which was previously stored internally with no
  public accessor).
- `seed` option for deterministic, reproducible MinHash signatures across runs/processes.
- `rerank` + `minSimilarity` + `limit` on `query()` — re-score LSH candidates by exact
  Jaccard similarity of shingle sets and filter/sort/cap the results.
- `shingleUnit: 'word'` — shingle over whitespace-delimited words instead of characters.
- `hashish.similarity(textA, textB)` — exact Jaccard similarity, independent of the index.
- `hashish.estimateSimilarity(idA, idB)` and the exported `estimateSimilarity(signatureA, signatureB)`
  — MinHash's approximate similarity from comparing two signatures' position-agreement
  rate, rather than re-shingling full document text.
- `RedisStorage`, duck-typed against a minimal client interface (no hard dependency on
  any Redis client library) — fulfills the original README's invitation for a
  non-memory storage backend.
- `hashish.exportIndex()` / `Hashish.importIndex()` — a portable snapshot (config + every
  document's raw text) that rebuilds an equivalent index on any storage backend by
  replaying `addDocument()`.
- `hashish.migrateTo(destination)` — shorthand for exporting and re-importing into a
  different storage backend (e.g. `MemoryStorage` → `RedisStorage`).
- `hashish.storage` is now a public, readonly property, and `MemoryStorage.toJSON()` /
  `MemoryStorage.fromJSON()` dump/restore its full internal state directly (documents,
  signatures, and buckets) with no re-hashing — a faster alternative to
  `exportIndex()`/`importIndex()` when moving between two `MemoryStorage` instances.
- Full TypeScript types, dual ESM/CJS build, GitHub Actions CI (Node 18/20/22),
  ESLint + Prettier, Vitest test suite, a benchmark script.

## 0.1.0 (original)

Initial release by [Ahmad Ganjtabesh](https://github.com/agtabesh) — basic
functionality, memory storage only.
