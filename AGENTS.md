# Agent playbook

`@johnhenry/hashish` — Locality-Sensitive Hashing (MinHash) for approximate
nearest-neighbor / similarity search over text. Single package, Node >= 26,
Vitest (`npm test`), builds to `dist/` via `tsup` (dual ESM/CJS + `.d.ts`).
TypeScript-first — `npm run typecheck` is a real, separate gate from the
build.

`CLAUDE.md` in this directory is a symlink to this file.

## The verification loop (before every push)

1. `npm run lint` — ESLint.
2. `npm run typecheck` — `tsc --noEmit`.
3. `npm test` — Vitest. Any suite that can SKIP must show **0 skipped**, not
   just 0 failed.
4. `npm run build && npm pack --dry-run` — reads `dist/`, `README.md`,
   `LICENSE`, `CHANGELOG.md` per the `files` field; read the file list, not
   just the exit code.
5. A genuinely fresh clone:
   `git clone . /tmp/hashish-verifyN && cd $_ && npm ci && npm run build && npm test`.
6. Commit, push, close the issue with a comment naming the commit SHA.

`prepublishOnly` already runs lint + typecheck + test + build in that order
— CI and a local publish attempt enforce the same gate.

## Repo-specific gotchas

- **LSH buckets must be keyed by `(position, value)`, never by bare hash
  value.** The original `lsh-js` fork this package rewrites keyed buckets
  by signature value alone, so two documents sharing a hash value at
  _different_ signature positions were wrongly bucketed together — not a
  valid LSH bucket. If you touch `addDocument`/`query`'s bucketing, keep
  the position in the key.
- **Signatures are not portable across seeds or hash-function versions.**
  `exportIndex()`/`importIndex()` re-shingle and re-hash everything, so
  they round-trip between _any_ two storage backends — but they only come
  back byte-identical if `seed` was set on the original instance. Don't
  assume a raw exported signature is meaningful outside the `Hashish`
  instance (and MurmurHash3 implementation/version) that produced it.
- **`MemoryStorage.toJSON()`/`fromJSON()` is a different contract from
  `exportIndex()`/`importIndex()`.** The former dumps that one adapter's
  internal representation verbatim (fast, no re-hashing, `MemoryStorage`
  only); the latter replays `addDocument()` and works between any two
  backends. Don't conflate them when adding a new storage adapter — only
  the `exportIndex`/`importIndex` path is guaranteed to work with it.
- **`Storage.has()` must check existence, not truthiness.** A previous bug
  used `!!value`, which reported falsy-but-present stored values (`0`,
  `''`, `false`) as missing. Use a real existence check
  (`Map#has`/equivalent) in any new `StorageAdapter`.

## Definition of done

A change is done when all of the following hold, not just when tests pass:

- A regression test exists for any bug fixed.
- Anything the feature does **not** do is stated in the README, not only in
  an issue comment.
- `CHANGELOG.md` has an entry citing what changed and why.
- `npm run build` output (`dist/`) and `npm pack --dry-run`'s file list are
  re-checked for anything new that should (or shouldn't) ship.

## Releases

Bump `version` in `package.json` in a PR, add the `CHANGELOG.md` entry,
merge, then `gh release create v<version>` — the release event triggers
`.github/workflows/publish.yml`, which is idempotent (skips if the version
is already on npm).
