import { Hashish } from '../src/Hashish'

const WORDS = [
  'the',
  'quick',
  'brown',
  'fox',
  'jumps',
  'over',
  'lazy',
  'dog',
  'while',
  'several',
  'curious',
  'woodland',
  'creatures',
  'watch',
  'nearby',
  'quarterly',
  'revenue',
  'projections',
  'indicate',
  'a',
  'modest',
  'increase',
  'across',
  'all',
  'regional',
  'sales',
  'divisions',
]

function randomDocument(wordCount: number): string {
  return Array.from({ length: wordCount }, () => WORDS[Math.floor(Math.random() * WORDS.length)]).join(' ')
}

async function run() {
  const numberOfDocuments = 1000
  const hashish = new Hashish({ seed: 1, numberOfHashFunctions: 120, bucketSize: 4, shingleSize: 5 })
  const documents = Array.from({ length: numberOfDocuments }, () => randomDocument(100))

  const addStart = performance.now()
  for (let i = 0; i < numberOfDocuments; i += 1) {
    await hashish.addDocument(i, documents[i]!)
  }
  const addMs = performance.now() - addStart
  console.log(`Indexed ${numberOfDocuments} documents (~100 words each) in ${addMs.toFixed(1)}ms`)

  const queryStart = performance.now()
  const numberOfQueries = 100
  for (let i = 0; i < numberOfQueries; i += 1) {
    await hashish.query({ id: i })
  }
  const queryMs = performance.now() - queryStart
  console.log(
    `Ran ${numberOfQueries} queries in ${queryMs.toFixed(1)}ms (${(queryMs / numberOfQueries).toFixed(2)}ms/query)`,
  )
}

void run()
