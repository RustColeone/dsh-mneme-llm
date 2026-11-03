// Vectors as the file keeps them (little-endian float32, length 1) and the arithmetic on them: each product in double
// precision, added as Python's sum adds floats.
import * as py from '../python.js'

/** The vector over its length (a zero vector as it is). */
export function normalize (vector) {
  const norm = Math.sqrt(py.sum(Array.from(vector, value => value * value))) || 1.0
  return Array.from(vector, value => value / norm)
}

/** A vector as it can be stored and compared (normalized), or null for one with a value that is not a finite number,
 * or with no length at all. */
export function usable (vector) {
  let values
  try {
    values = Array.from(vector, value => py.float(value))
  } catch (error) {
    if (error instanceof TypeError || error instanceof py.ValueError) return null
    throw error
  }
  if (!values.length || !values.every(Number.isFinite) || !values.some(Boolean)) return null
  return normalize(values)
}

/** The bytes a vector is kept as. */
export function pack (vector) {
  const bytes = new Uint8Array(4 * vector.length), view = new DataView(bytes.buffer)
  Array.from(vector).forEach((value, index) => view.setFloat32(4 * index, value, true))
  return bytes
}

/** A kept vector as it is, for reading many at once. */
export function raw (blob) {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)
  const values = new Float64Array(Math.floor(blob.byteLength / 4))
  for (let index = 0; index < values.length; index++) values[index] = view.getFloat32(4 * index, true)
  return values
}

export const unpack = blob => Array.from(raw(blob))

/** Of two normalized vectors. */
export function cosine (a, b) {
  const length = Math.min(a.length, b.length), products = new Array(length)
  for (let index = 0; index < length; index++) products[index] = a[index] * b[index]
  return py.sum(products)
}

/** The vectors of these notes gone, whatever embedder made them: a vector is the note's words in another form. */
export function drop (store, ids) {
  store.rowsIn('delete from vectors where memory_id in ({})', ids)
}

/** Many vectors of one length, compared with one at a time. A row of another length is counted and left out, as it can
 * only be from another model. */
export class Matrix {
  constructor () {
    this.ids = []
    this.ats = []
    this.read = 0 // rows added, a vector of another length among them (it is not compared)
    this.last = 0 // the highest id added
    this.rows = []
    this.count = 0
  }

  add (id, vector, at = 0.0) {
    this.read++
    this.last = Math.max(this.last, id)
    if (this.rows.length && vector.length !== this.rows[0].length) return
    this.rows.push(Array.from(vector))
    this.ids.push(id)
    this.ats.push(at)
    this.count++
  }

  /** Cosine with each vector, in the order of `ids` (empty when there are none of this length). */
  similarities (vector) {
    if (!this.count || vector.length !== this.rows[0].length) return []
    return this.rows.map(row => cosine(row, vector))
  }

  /** Positions in `ids`, the closest first. */
  order (similarities) {
    return similarities.map((_, index) => index).sort((one, other) => similarities[other] - similarities[one])
  }

  /** The ids of the `count` closest with an `at` before `before`, those at least `line` close. */
  nearest (similarities, before, line, count) {
    const earlier = []
    similarities.forEach((value, index) => {
      if (this.ats[index] < before) earlier.push([value, this.ids[index]])
    })
    earlier.sort((one, other) => other[0] - one[0] || other[1] - one[1])
    return earlier.slice(0, count).filter(([value]) => value >= line).map(([, id]) => id)
  }
}
