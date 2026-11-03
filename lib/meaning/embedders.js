// Meaning tier 1: the embedding providers, which turn text into vectors: OpenAI's, or any function of yours. A port of
// mneme_llm/meaning/embedders.py.
import * as providers from '../providers.js'
import { Unavailable } from '../providers.js'
import * as py from '../python.js'
import { normalize } from './vectors.js'

// Similarity below an embedder's floor says nothing. Each model's is measured in the file (`calibrate.js`); this is the
// floor until then, or for a model the measurement cannot place: text-embedding-3-small at 256 dimensions.
export const FLOOR = 0.33

/** OpenAI's embeddings API, through `fetch`: `text-embedding-3-small` at 256 dimensions. The key is `apiKey`, or
 * OPENAI_API_KEY. */
export class OpenAIEmbeddings {
  constructor ({ apiKey = null, model = 'text-embedding-3-small', dimensions = 256,
    baseUrl = 'https://api.openai.com/v1', timeout = 15.0, floor = null, fetch = globalThis.fetch } = {}) {
    this.apiKey = apiKey !== null ? apiKey : process.env.OPENAI_API_KEY || ''
    this.model = model
    this.dimensions = dimensions
    this.baseUrl = py.rstrip(baseUrl, '/')
    this.timeout = timeout
    this.name = `openai:${model}:${dimensions}`
    this.floor = floor
    this.inputTokens = 0
    this._fetch = fetch
  }

  async embed (texts) {
    if (!this.apiKey) throw new Unavailable('no OpenAI key for embeddings')
    const input = [...texts].map(text => py.slice(text, 0, 8000) || ' ')
    const payload = await providers.postJson(`${this.baseUrl}/embeddings`, this.apiKey, { model: this.model, input,
      dimensions: this.dimensions }, { timeout: this.timeout, what: 'embeddings API', fetch: this._fetch })
    const used = payload?.usage?.prompt_tokens
    this.inputTokens += py.int(py.truthy(used) ? used : 0)
    const ordered = [...payload.data].sort((one, other) => one.index - other.index)
    return ordered.map(item => normalize(item.embedding))
  }

  report () {
    return { input_tokens: this.inputTokens, dollars: py.round(this.inputTokens * 0.02 / 1000000, 6) }
  }
}

/** Any embedding function (sync or async, a list of texts to a list of vectors): a local model, Ollama, Gemini… Give it
 * a `name` that changes when the model does; its floor is measured in the file unless you give one. */
export class Embeddings {
  constructor (fn, name, { floor = null } = {}) {
    this.function = fn
    this.name = name
    this.floor = floor
  }

  async embed (texts) {
    const vectors = await providers.call(this.function, [...texts])
    if (vectors.length !== texts.length) {
      throw new Unavailable(`${this.name} returned ${vectors.length} vectors for ${texts.length} texts`)
    }
    return vectors.map(normalize)
  }
}
