// Python's `random.Random(seed)`: the Mersenne Twister seeded as CPython seeds it from a whole number, with its
// `shuffle`, `getrandbits` and `random`. The gut shuffles its lessons with it, so a gut that sleeps here learns the
// same weights as one that sleeps in Python.
const N = 624, M = 397

export class Random {
  constructor (seed = 0) {
    this.mt = new Uint32Array(N)
    this.index = N
    this.seed(seed)
  }

  /** CPython's random_seed for a whole number: init_by_array over its 32-bit words, the lowest first. */
  seed (value) {
    let rest = BigInt(value < 0 ? -value : value)
    const key = []
    do {
      key.push(Number(rest & 0xffffffffn))
      rest >>= 32n
    } while (rest > 0n)
    this._byArray(key)
  }

  _genrand (seed) {
    const mt = this.mt
    mt[0] = seed >>> 0
    for (let i = 1; i < N; i++) mt[i] = (Math.imul(1812433253, mt[i - 1] ^ (mt[i - 1] >>> 30)) + i) >>> 0
    this.index = N
  }

  _byArray (key) {
    const mt = this.mt
    this._genrand(19650218)
    let i = 1, j = 0
    for (let k = Math.max(N, key.length); k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1664525)) + key[j] + j) >>> 0
      i++
      j++
      if (i >= N) {
        mt[0] = mt[N - 1]
        i = 1
      }
      if (j >= key.length) j = 0
    }
    for (let k = N - 1; k; k--) {
      mt[i] = ((mt[i] ^ Math.imul(mt[i - 1] ^ (mt[i - 1] >>> 30), 1566083941)) - i) >>> 0
      i++
      if (i >= N) {
        mt[0] = mt[N - 1]
        i = 1
      }
    }
    mt[0] = 0x80000000
  }

  /** The next 32 random bits. */
  uint32 () {
    const mt = this.mt
    if (this.index >= N) {
      for (let k = 0; k < N; k++) {
        const y = (mt[k] & 0x80000000) | (mt[(k + 1) % N] & 0x7fffffff)
        mt[k] = mt[(k + M) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0)
      }
      this.index = 0
    }
    let y = mt[this.index++]
    y ^= y >>> 11
    y ^= (y << 7) & 0x9d2c5680
    y ^= (y << 15) & 0xefc60000
    y ^= y >>> 18
    return y >>> 0
  }

  /** getrandbits(k), for k up to 32. */
  getrandbits (k) {
    if (k <= 0) return 0
    return this.uint32() >>> (32 - k)
  }

  /** _randbelow(n): a whole number from 0 to n - 1. */
  randbelow (n) {
    const k = 32 - Math.clz32(n)
    let r = this.getrandbits(k)
    while (r >= n) r = this.getrandbits(k)
    return r
  }

  /** random(): a float from 0 up to 1, from 53 random bits. */
  random () {
    const a = this.uint32() >>> 5, b = this.uint32() >>> 6
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0)
  }

  /** shuffle(list), in place. */
  shuffle (list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = this.randbelow(i + 1)
      ;[list[i], list[j]] = [list[j], list[i]]
    }
  }
}
