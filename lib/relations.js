// Who each person is to the companion: a role, and a closeness from 0 to 100 that moves with time spent together. A
// port of mneme_llm/relations.py.
//
//     role        set by the host, never by a model: creator (one per space, and the bond never fades), family,
//                 friend, acquaintance, or a role of the host's own. Each role keeps closeness within its band
//     closeness   grows by one point on each talking day the person talks to the companion, up to the role's
//                 ceiling, and fades by one point for every 30 days without them, down to its floor (computed when
//                 read, and always within the role's band as the host has it now)
//     weight      how much the person's words move the mood: 0.5 at closeness 0, 1.0 at 50, 1.5 at 100
//     telling     `line()` says it for the system prompt ("(Leo is your creator; you are very close.)")
import * as dates from './dates.js'
import { Speaks, Words, code, has, say } from './i18n.js'
import { Resolves } from './people.js'
import * as py from './python.js'
import * as texts from './text.js'

const DAY = 86400.0
const now = () => Date.now() / 1000

/** What a person can be to the companion. The built-in roles are named in `i18n`; a host's own role brings its names,
 * by language (`new Role('teacher', { floor: 40, ceiling: 95, start: 70, names: { en: 'your teacher' } })`). */
export class Role {
  constructor (key, { floor = 0.0, ceiling = 100.0, start = 50.0, fades = true, unique = false, names = {} } = {}) {
    Object.assign(this, { key, floor, ceiling, start, fades, unique, names: { ...names } })
    if (!(floor >= 0 && floor <= start && start <= ceiling && ceiling <= 100)) {
      throw new py.ValueError(`role ${key}: needs 0 <= floor <= start <= ceiling <= 100`)
    }
    Object.freeze(this)
  }

  label (lang) {
    if (Object.hasOwn(this.names, code(lang))) return this.names[code(lang)]
    const key = `role.${this.key}`
    return has(key, lang) ? say(lang, key) : this.names.en ?? this.key
  }
}

export const ROLES = [new Role('creator', { floor: 80, ceiling: 100, start: 100, fades: false, unique: true }),
  new Role('family', { floor: 60, ceiling: 100, start: 80 }),
  new Role('friend', { floor: 20, ceiling: 90, start: 50 }),
  new Role('acquaintance', { floor: 0, ceiling: 60, start: 20 })]
export const NEAR = [[80, 'very_close'], [60, 'close'], [40, 'friendly'], [20, 'distant'], [0, 'stranger']]

/** `closeness` is now's, faded; `since` when the role was given; `updatedAt` when closeness was last written. */
export class Relationship {
  constructor (subject, role, closeness, since, updatedAt) {
    Object.assign(this, { subject, role, closeness, since, updatedAt })
    Object.freeze(this)
  }
}

export class Relations extends Speaks(Resolves) {
  constructor (store, space, { roles = ROLES, growth = 1.0, fadeDays = 30.0, zone = null, displayLanguage = 'en',
    people = null, clock = now } = {}) {
    super()
    this.store = store
    this.space = space
    this.roles = new Map(roles.map(role => [role.key, role]))
    this.people = people
    this.growth = growth
    this.fadeDays = fadeDays
    this.zone = zone
    this.words = Words.of(displayLanguage)
    this.clock = clock
  }

  // ---- reading ---------------------------------------------------------------------------------------------------
  get (subject, at = null) {
    subject = this.who(subject)
    const row = this.store.row('select * from relationships where space = ? and subject = ?', [this.space, subject])
    return row ? this._of(row, at ?? this.clock()) : null
  }

  /** Everyone with a role, closest first. */
  all () {
    const at = this.clock()
    return this.store.rows('select * from relationships where space = ?', [this.space]).map(row => this._of(row, at))
      .sort((one, other) => other.closeness - one.closeness || py.compare(one.subject, other.subject))
  }

  /** How much the person's words move the mood (1.0 for a person with no role). */
  weight (subject) {
    const relationship = this.get(subject)
    return relationship === null ? 1.0 : 0.5 + relationship.closeness / 100
  }

  /** Who the person is to the companion, for the system prompt ("" for a person with no role). */
  line (subject, userName = null) {
    const relationship = this.get(subject)
    if (relationship === null) return ''
    const lang = this.words
    const near = NEAR.find(([least]) => py.round(relationship.closeness) >= least)[1]
    return say(lang, 'relation.line', { who: userName || subject, role: this._role(relationship.role).label(lang),
      near: say(lang, `near.${near}`) })
  }

  // ---- changing --------------------------------------------------------------------------------------------------
  /** Give a person a role (the host's call, never a model's). `closeness` defaults to the role's start, or to the
   * person's present closeness when the role stays the same (then nothing changes: a host may say it at every
   * start); it must lie within the role's band. */
  set (subject, role, { closeness = null } = {}) {
    texts.required(subject, 'subject')
    if (!this.roles.has(role)) {
      throw new py.ValueError(`no role ${py.reprOf(role)}; the roles are ${[...this.roles.keys()].join(', ')}`)
    }
    const kind = this.roles.get(role)
    return this.writing(subject, subject => {
      const at = this.clock()
      const present = this.get(subject, at)
      if (closeness === null && present !== null && present.role === role) return present // already so
      if (closeness === null) closeness = kind.start
      if (typeof closeness !== 'number' || !Number.isFinite(closeness) || !(kind.floor <= closeness &&
          closeness <= kind.ceiling)) {
        throw new py.ValueError(`closeness for ${role} is a number from ${py.g(kind.floor)} to ${py.g(kind.ceiling)}`)
      }
      if (kind.unique) {
        const other = this.store.row('select subject from relationships where space = ? and role = ? and subject != ?',
          [this.space, role, subject])
        if (other) throw new py.ValueError(`${other.subject} is already the ${role}; give them another role first`)
      }
      const same = present !== null && present.role === role
      const since = same ? present.since : at
      const updated = same ? Math.max(at, present.updatedAt) : at // (a clock set back moves no time back)
      this.store.execute('insert or replace into relationships (space, subject, role, closeness, since, updated_at) ' +
        'values (?, ?, ?, ?, ?, ?)', [this.space, subject, role, closeness, since, updated])
      return new Relationship(subject, role, closeness, since, updated)
    })
  }

  /** A contact: the first one on a talking day (in the companion's zone) grows closeness by `growth`. A person with no
   * role is left without one. A clock that went back changes nothing. */
  seen (subject) {
    return this.writing(subject, subject => {
      const at = this.clock()
      const present = this.get(subject, at)
      if (present === null || at <= present.updatedAt) return present
      const kind = this._role(present.role)
      let closeness = present.closeness
      if (dates.talkingDay(present.updatedAt, this.zone) < dates.talkingDay(at, this.zone)) {
        closeness = Math.max(closeness, Math.min(closeness + this.growth, kind.ceiling)) // never lowered by a visit
      }
      this.store.execute('update relationships set closeness = ?, updated_at = ? where space = ? and subject = ?',
        [closeness, at, this.space, subject])
      return new Relationship(subject, present.role, closeness, present.since, at)
    })
  }

  remove (subject) {
    return this.writing(subject, subject => Boolean(this.store.execute(
      'delete from relationships where space = ? and subject = ?', [this.space, subject]).rowcount))
  }

  /** `old` is the person `fresh` now (`People.link`): of two relationships the closer is kept (the person's own when
   * they are as close), since the earlier of the two days. */
  join (old, fresh) {
    this.store.transaction(() => {
      const at = this.clock()
      const rows = Object.fromEntries(this.store.rows('select * from relationships where space = ? and subject in ' +
        '(?, ?)', [this.space, old, fresh]).map(row => [row.subject, row]))
      if (!rows[old]) return
      this.store.execute('delete from relationships where space = ? and subject = ?', [this.space, old])
      const kept = !rows[fresh] || this._of(rows[old], at).closeness > this._of(rows[fresh], at).closeness ? rows[old]
        : rows[fresh]
      const since = Math.min(...Object.values(rows).map(row => row.since))
      this.store.execute('insert or replace into relationships (space, subject, role, closeness, since, updated_at) ' +
        'values (?, ?, ?, ?, ?, ?)', [this.space, fresh, kept.role, kept.closeness, since, kept.updated_at])
    })
  }

  // ---- inside ----------------------------------------------------------------------------------------------------
  /** A role by its key; one this host does not know (from another project's file) has the widest band. */
  _role (key) {
    return this.roles.get(key) || new Role(key)
  }

  _of (row, at) {
    const kind = this._role(row.role)
    let closeness = row.closeness
    if (kind.fades && this.fadeDays > 0) closeness -= Math.max(0.0, at - row.updated_at) / (this.fadeDays * DAY)
    closeness = Math.min(kind.ceiling, Math.max(kind.floor, closeness)) // within the band, as the host has it now
    return new Relationship(row.subject, row.role, closeness, row.since, row.updated_at)
  }
}
