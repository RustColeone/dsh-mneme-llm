// Meaning: finding notes and exchanges by what they mean, not only by the words they share, in two tiers that fall
// through.
//
//     1. embeddings   a provider turns text into vectors: `OpenAIEmbeddings` (text-embedding-3-small at 256
//                     dimensions, with OPENAI_API_KEY), or any function you give (`new Embeddings(fn, name)`)
//     2. unify        your own chat model writes each note once in one language of your choice and translates a query
//                     written in another script (`unify.js`)
//
// Vectors are stored per embedder (`name`), so changing the provider never compares vectors from two models, and each
// model's floor (the similarity under which a note says nothing) is measured in the file (`calibrate.js`).
import { Rest, Unavailable } from '../providers.js'
import * as py from '../python.js'
import * as calibrate from './calibrate.js'
import { FLOOR } from './embedders.js'
import { Matrix, pack, raw, unpack, usable } from './vectors.js'

export { FLOOR, Embeddings, OpenAIEmbeddings } from './embedders.js'
export { Matrix, cosine, drop, normalize, pack, raw, unpack, usable } from './vectors.js'
export { Unify } from './unify.js'
export { calibrate }

/** What the tiers made of a query among some notes: how close each note is (`similarities`, a Map by note id, by the
 * tier that placed the query, with its `floor`), words to add to the matching, and glosses written for the notes. */
export class Found {
  constructor (tier = '', { vector = null, floor = 1.0, words = '', similarities = null, glosses = null } = {}) {
    this.tier = tier
    this.vector = vector
    this.floor = floor
    this.words = words
    this.similarities = similarities || new Map()
    this.glosses = glosses || new Map()
  }
}

const isNumber = value => typeof value === 'number'

/** The tiers for one store. Each may be null; any that fails passes the query on to the next. */
export class Meaning {
  constructor (store, embedder = null, unify = null) {
    this.store = store
    this.embedder = embedder
    this.unify = unify
    this.rest = new Rest() // the embedding provider's
    this._measuring = false
  }

  /** The embedder's floor: its own when it was given one, else the one measured in this file, else FLOOR. */
  get floor () {
    return this._floor('floor')
  }

  /** The floor as the bundled set placed it, before the file's own notes moved it: what a look's bar stands on. */
  get setFloor () {
    return this._floor('set')
  }

  _floor (which) {
    const fixed = this.embedder?.floor
    if (fixed !== null && fixed !== undefined) return fixed
    let record = this.name ? calibrate.read(this.store, this.name) : null
    if (record && which === 'set') record = record.set
    const value = record !== null && typeof record === 'object' && !Array.isArray(record) ? record.floor : undefined
    return isNumber(value) ? value : FLOOR
  }

  get name () {
    return this.embedder ? this.embedder.name : ''
  }

  /** What the tiers make of `query` among `notes` (embedding the notes that need it first). `complete` gives the unify
   * tier a chat model for this call. */
  async find (notes, query, { complete = null } = {}) {
    await this.prepareVectors(notes)
    const found = await this.query(query, { complete })
    if (found.vector !== null) {
      found.similarities = this._similar(found.vector, notes.map(note => note.id))
    } else if (this.unify && this.unify.ready(complete)) { // nothing placed it: glosses help word matching
      found.glosses = await this.unify.glosses(notes, { complete })
    }
    return found
  }

  /** How close each of these notes is to `vector`. A vector of another length is from another model under the same
   * name, and is left out. */
  _similar (vector, ids) {
    const matrix = new Matrix(), size = 4 * vector.length
    for (const row of this.store.rowsIn('select memory_id, vector from vectors where embedder = ? and memory_id in ' +
      '({})', ids, [this.name])) {
      if (row.vector.length === size) matrix.add(row.memory_id, raw(row.vector))
    }
    const similarities = matrix.similarities(vector)
    return new Map(similarities.map((value, index) => [matrix.ids[index], value]))
  }

  /** The best the tiers can do for a query alone (an empty `Found` when none can). */
  async query (text, { complete = null } = {}) {
    if (this.embedder && this.rest.up()) {
      try {
        const vector = usable((await this.embedder.embed([text]))[0])
        if (vector === null) throw new Unavailable(`${this.name} gave the query a vector that is not finite`)
        return new Found('embeddings', { vector, floor: this.floor })
      } catch (error) {
        this._failed(error)
      }
    }
    if (this.unify && this.unify.needsTranslation(text) && this.unify.ready(complete)) {
      try {
        return new Found('unify', { words: await this.unify.translate(text, { complete }) })
      } catch (error) {
        this.unify.rest.failed(error)
      }
    }
    return new Found()
  }

  /** Tier 1's vectors for some texts (normalized; null for one that is not finite), or null when the embedder is not
   * there or not answering (the failure is recorded as any other). */
  async embed (texts) {
    if (!this.embedder || !this.rest.up() || !texts.length) return null
    let vectors
    try {
      vectors = await this.embedder.embed([...texts])
      if (vectors.length !== texts.length) {
        throw new Unavailable(`${this.name} returned ${vectors.length} vectors for ${texts.length} texts`)
      }
    } catch (error) {
      this._failed(error)
      return null
    }
    return vectors.map(usable)
  }

  /** Embed the notes that have no vector from this embedder yet (in batches); returns how many were added. Then the
   * embedder's floor is measured, the first time, and refined as the file grows. */
  async prepareVectors (notes) {
    if (!this.embedder || !this.rest.up() || !notes.length) return 0
    const have = new Set(this.store.rowsIn('select memory_id from vectors where embedder = ? and memory_id in ({})',
      notes.map(note => note.id), [this.name]).map(row => row.memory_id))
    const missing = notes.filter(note => !have.has(note.id))
    let added = 0
    for (let start = 0; start < missing.length; start += BATCH) {
      const batch = missing.slice(start, start + BATCH)
      let vectors
      try {
        vectors = await this.embedder.embed(batch.map(note => note.text))
        if (vectors.length !== batch.length) {
          throw new Unavailable(`${this.name} returned ${vectors.length} vectors for ${batch.length} texts`)
        }
      } catch (error) {
        this._failed(error)
        break
      }
      // One transaction from here on: a note erased while it was being embedded is left alone (its id may even be
      // another note's by now).
      this.store.transaction(() => {
        batch.forEach((note, index) => {
          const vector = usable(vectors[index]) // normalized; a vector that is not finite is not kept
          if (vector === null || this.store.row('select 1 from memories where id = ? and text = ?', [note.id,
            note.text]) === null) return
          added += this.store.execute('insert or ignore into vectors (memory_id, embedder, vector) values (?, ?, ?)',
            [note.id, this.name, pack(vector)]).rowcount
        })
      })
    }
    await this._measure()
    return added
  }

  /** The floor of an embedder given none: measured on the bundled set once (one request), then refined by the file's
   * own notes each time their number doubles (no request). */
  async _measure () {
    const fixed = this.embedder?.floor
    if ((fixed !== null && fixed !== undefined) || this._measuring || !this.rest.up()) return
    this._measuring = true // one measurement at a time; a recall meanwhile uses the floor there is
    try {
      let record = calibrate.read(this.store, this.name)
      if (record === null) {
        try {
          record = await calibrate.measure(this.embedder, FLOOR)
        } catch (error) {
          this._failed(error)
          return
        }
        calibrate.write(this.store, this.name, record)
      }
      if (calibrate.due(this.store, record)) {
        record = calibrate.refine(this.store, this.name, record)
        calibrate.write(this.store, this.name, record)
      }
    } finally {
      this._measuring = false
    }
  }

  vectors (ids) {
    if (!this.name) return new Map()
    return new Map(this.store.rowsIn('select memory_id, vector from vectors where embedder = ? and memory_id in ({})',
      ids, [this.name]).map(row => [row.memory_id, unpack(row.vector)]))
  }

  report () {
    const failures = Object.fromEntries([['embeddings', this.rest.error],
      ['unify', this.unify ? this.unify.rest.error : '']].filter(([, error]) => error))
    const report = { embedder: this.name || null, floor: this._floorReport(), failures,
      unify: this.unify ? this.unify.report() : null }
    if (this.embedder && typeof this.embedder.report === 'function') report.embeddings = this.embedder.report()
    return report
  }

  _floorReport () {
    if (!this.embedder) return null
    const fixed = this.embedder.floor
    if (fixed !== null && fixed !== undefined) return { value: fixed, by: 'given' }
    const record = calibrate.read(this.store, this.name)
    if (record === null) return { value: FLOOR, by: 'default (not measured yet)' }
    const by = (record.file || {}).shift !== null && (record.file || {}).shift !== undefined ? 'file'
      : py.truthy(record.separated) ? 'set' : 'default (the set did not separate)'
    return { value: record.floor, by, set: record.set, file: record.file ?? null }
  }

  _failed (error) {
    this.rest.failed(error)
  }
}

export const BATCH = 64 // notes embedded per request
