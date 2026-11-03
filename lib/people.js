// One person under several subjects: the accounts a person reaches the companion by ("discord:42", "web:leo"), kept
// as one. A port of mneme_llm/people.py.
//
//     link        `link("web:leo", "discord:42")`: from then on "web:leo" is "discord:42" in every call. Set by the
//                 host, never by a model
//     unlink      the subject is its own again from then on; what was joined stays with the person
//
// Links are kept one step deep: a subject always points at a person's own subject, never at another link. Joining what
// each account kept needs every part of mneme-llm, so `Mneme` links nobody yet: this file reads the links Python made.
import * as py from './python.js'
import * as texts from './text.js'

export class People {
  constructor (store, space) {
    this.store = store
    this.space = space
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  /** The person a subject stands for: the subject it is linked to, or itself. */
  of (subject) {
    if (typeof subject !== 'string') return subject // (the caller's own checks say what is wrong with it)
    const row = this.store.row('select person from people where space = ? and subject = ?', [this.space, subject])
    return row ? row.person : subject
  }

  /** Every link, subject → person. */
  all () {
    return Object.fromEntries(this.store.rows('select subject, person from people where space = ? order by person, ' +
      'subject', [this.space]).map(row => [row.subject, row.person]))
  }

  // ---- changing --------------------------------------------------------------------------------------------------
  /** Record that `subject` is the same person as `person` (the host's call, never a model's). Returns the person's
   * own subject, and whether this was new (the caller then joins what each kept). A subject linked to someone else
   * already must be unlinked first; the subjects linked to `subject` follow it. */
  link (subject, person) {
    texts.required(subject, 'subject')
    texts.required(person, 'person')
    return this.store.transaction(() => {
      person = this.of(person)
      if (person === subject || this.of(subject) === person) return [person, false] // already one person
      const other = this.of(subject)
      if (other !== subject) throw new py.ValueError(`${subject} is linked to ${other}; unlink it first`)
      this.store.execute('update people set person = ? where space = ? and person = ?', [person, this.space, subject])
      this.store.execute('insert into people (space, subject, person) values (?, ?, ?)', [this.space, subject, person])
      return [person, true]
    })
  }

  unlink (subject) {
    return Boolean(this.store.execute('delete from people where space = ? and subject = ?', [this.space, subject])
      .rowcount)
  }

  /** Every link of the person the subject stands for (for an erase); returns how many there were. */
  remove (subject) {
    const person = this.of(subject)
    return this.store.execute('delete from people where space = ? and (person = ? or subject = ?)',
      [this.space, person, person]).rowcount
  }
}

/** For a part that keeps rows by subject: `who(subject)` is the person it stands for (itself without links). */
export class Resolves {
  constructor () {
    this.people = null
  }

  who (subject) {
    return this.people ? this.people.of(subject) : subject
  }

  /** `this.writing(subject, person => ...)`: a write under the person the subject stands for, looked up inside the
   * write's own transaction, so a write can never land under an account that is linked to someone by then. */
  writing (subject, work) {
    return this.store.transaction(() => work(this.who(subject)))
  }
}
