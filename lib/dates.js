// Dates: the local time of a moment in a zone, its talking day, and dates the way a person says them ("yesterday",
// "in 3 days", "last year 09-17", or 昨天, 3天后, 去年 09-17).
//
// A zone is null (the machine's), { name: 'Asia/Shanghai' } (an IANA name) or { offset: 28800 } (seconds east of UTC),
// as `config.zoneOf` makes it from "", "Asia/Shanghai" or "UTC+8".
import { say } from './i18n.js'
import * as py from './python.js'

export const DAY_STARTS = 4 // a person's day turns at 4 in the morning: staying up late is still today
export const LATEST = 32503680000.0 // 3000-01-01: later "times" are mistakes (milliseconds, say)
const EPOCH = 719163 // date(1970, 1, 1).toordinal()

/** The whole second Python's datetime.fromtimestamp reads a moment as: microseconds rounded half to even. */
function second (timestamp) {
  let whole = Math.trunc(timestamp)
  const part = py.round((timestamp - whole) * 1e6)
  if (part >= 1e6) whole += 1
  else if (part < 0) whole -= 1
  return whole
}

const FORMATS = new Map()
function format (name) {
  let found = FORMATS.get(name)
  if (!found) {
    found = new Intl.DateTimeFormat('en-US', {
      timeZone: name, calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23', year: 'numeric',
      month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric'
    })
    FORMATS.set(name, found)
  }
  return found
}

/** The wall clock of `timestamp` in `zone`: { year, month, day, hour, minute, second }. */
export function local (timestamp, zone = null) {
  const whole = second(timestamp)
  if (zone && typeof zone.offset === 'number') {
    const moment = new Date((whole + zone.offset) * 1000)
    return { year: moment.getUTCFullYear(), month: moment.getUTCMonth() + 1, day: moment.getUTCDate(),
      hour: moment.getUTCHours(), minute: moment.getUTCMinutes(), second: moment.getUTCSeconds() }
  }
  if (zone && zone.name) {
    const parts = {}
    for (const part of format(zone.name).formatToParts(new Date(whole * 1000))) parts[part.type] = part.value
    return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
      hour: Number(parts.hour) % 24, minute: Number(parts.minute), second: Number(parts.second) }
  }
  const moment = new Date(whole * 1000)
  return { year: moment.getFullYear(), month: moment.getMonth() + 1, day: moment.getDate(),
    hour: moment.getHours(), minute: moment.getMinutes(), second: moment.getSeconds() }
}

/** date.toordinal() of a calendar day: 1 January of year 1 is 1. */
export const ordinal = ({ year, month, day }) => EPOCH + Math.round(Date.UTC(year, month - 1, day) / 86400000)

/** The day a moment belongs to, as a number that grows by one a day: the calendar day of `zone`, turning at
 * DAY_STARTS. */
export function talkingDay (timestamp, zone = null) {
  const wall = local(timestamp, zone)
  return ordinal(wall) - (wall.hour < DAY_STARTS ? 1 : 0)
}

const two = number => String(number).padStart(2, '0')

/** An exact local time, for logs and listings: "2026-11-02 21:05". */
export function stamp (timestamp, zone = null) {
  const wall = local(timestamp, zone)
  const day = `${String(wall.year).padStart(4, '0')}-${two(wall.month)}-${two(wall.day)}`
  return `${day} ${two(wall.hour)}:${two(wall.minute)}`
}

/** `value` as a time in seconds between 1970 and the year 3000, or null when it is no such time. */
export function seconds (value) {
  try {
    value = py.float(value)
  } catch {
    return null
  }
  return Number.isFinite(value) && value >= 0 && value < LATEST ? value : null
}

/** The offset of `zone` from UTC at the moment `timestamp`, in seconds. */
export function offset (timestamp, zone = null) {
  if (zone && typeof zone.offset === 'number') return zone.offset
  const whole = Math.floor(timestamp)
  if (zone && zone.name) {
    const wall = local(whole, zone)
    return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) / 1000 - whole
  }
  return -new Date(whole * 1000).getTimezoneOffset() * 60
}

/** The moment a wall clock of `zone` shows `wall` (seconds of a calendar day since 1970, as if in UTC): in a gap the
 * later moment, of two the earlier, as Python's datetime.timestamp() takes a time with fold 0. */
export function moment (wall, zone = null) {
  if (zone && typeof zone.offset === 'number') return wall - zone.offset
  const shown = at => at + offset(at, zone)
  const a = shown(wall) - wall
  const u1 = wall - a
  const t1 = shown(u1)
  let b
  if (t1 === wall) {
    const u2 = u1 - 86400
    b = shown(u2) - u2
    if (a === b) return u1
  } else b = t1 - u1
  const u2 = wall - b
  if (shown(u2) === wall) return u2
  if (t1 === wall) return u1
  return Math.max(u1, u2)
}

const wallOf = (ordinalDay, hour = 0) => (ordinalDay - EPOCH) * 86400 + hour * 3600

/** When the talking day of a moment began. */
export function dayBegan (timestamp, zone = null) {
  const day = talkingDay(timestamp, zone)
  if (zone) return moment(wallOf(day, DAY_STARTS), zone)
  return wallOf(day, DAY_STARTS) - offset(timestamp) // (Python keeps the offset the moment had)
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December']
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** strftime of a moment's local time, for %Y %m %d %H %M %S %A %B and %%, as Python writes them. */
export function strftime (timestamp, zone, pattern) {
  const wall = local(timestamp, zone)
  const fields = { Y: String(wall.year).padStart(4, '0'), m: two(wall.month), d: two(wall.day), H: two(wall.hour),
    M: two(wall.minute), S: two(wall.second), A: WEEKDAYS[(ordinal(wall) + 6) % 7], B: MONTHS[wall.month - 1],
    '%': '%' }
  return pattern.replace(/%([YmdHMSAB%])/g, (_, field) => fields[field])
}

/** When `timestamp` is, relative to `now`, in calendar days of `zone` (past or future), in `lang` (a code, or a
 * companion's `Words`). */
export function when (timestamp, now, zone = null, lang = 'en') {
  const then = local(timestamp, zone), today = local(now, zone)
  const days = ordinal(today) - ordinal(then)
  const md = `${two(then.month)}-${two(then.day)}`
  const full = `${String(then.year).padStart(4, '0')}-${md}`
  if (days < 0) {
    const ahead = -days
    if (ahead === 1) return say(lang, 'date.tomorrow')
    if (ahead === 2) return say(lang, 'date.after')
    if (ahead < 7) return say(lang, 'date.in_days', { n: ahead })
    if (then.year === today.year) return md
    if (then.year === today.year + 1) return say(lang, 'date.next_year', { md })
    return full
  }
  if (days === 0) return say(lang, 'date.today')
  if (days === 1) return say(lang, 'date.yesterday')
  if (days < 7) return say(lang, 'date.days', { n: days })
  if (then.year === today.year) return md
  if (then.year === today.year - 1) return say(lang, 'date.last_year', { md })
  return full
}

/** Days from 1 January 1970 to a calendar day (proleptic Gregorian, any year). */
function civil (year, month, day) {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400), of = y - era * 400
  const inYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  return era * 146097 + of * 365 + Math.floor(of / 4) - Math.floor(of / 100) + inYear - 719468
}

const LEAP = year => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
const monthDays = (year, month) => [31, LEAP(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]

/** Noon of a calendar day in `zone`, as a time in seconds; null when it is no such day, or no such time. */
function noonOf (year, month, day, zone) {
  if (!(year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays(year, month))) {
    return null
  }
  return seconds(moment(civil(year, month, day) * 86400 + 12 * 3600, zone))
}

const D = py.DIGIT
const DAY = new RegExp(`^(${D}${D}${D}${D})-(1[0-2]|0[1-9]|[1-9])-(3[01]|[12]${D}|0[1-9]|[1-9]| [1-9])$`, 'iu')

/** Noon of a "YYYY-MM-DD" in the person's zone (the machine's when none is given); null if it is no date. */
export function noon (day, zone = null) {
  const found = DAY.exec(py.slice(py.truthy(day) ? py.str(day) : '', 0, 10))
  if (!found) return null
  return noonOf(py.int(found[1]), py.int(found[2]), py.int(found[3]), zone)
}

const WRITTEN = new RegExp(`(?<!${D})(20${D}${D})(?:[-/](${D}{1,2})[-/](${D}{1,2})|年(${D}{1,2})月(${D}{1,2})[日号]?)` +
  `(?!${D})`, 'u')
const MONTH_DAY = new RegExp(`(?<!${D})(${D}{1,2})月(${D}{1,2})[日号]`, 'u')

/** Noon (in `zone`) of the first date written in `text`: 2026-10-30, 2026/10/30, 2026年10月30日, or 10月30日, which
 * means the nearest such day to `now`, or with `ahead` (for plans) the first such day from today on; null when there
 * is none. Digits around a date are not a date. */
export function find (text, now = null, zone = null, { ahead = false } = {}) {
  let found = WRITTEN.exec(text)
  if (found) {
    return noonOf(py.int(found[1]), py.int(found[2] ?? found[4]), py.int(found[3] ?? found[5]), zone)
  }
  found = MONTH_DAY.exec(text)
  if (!found) return null
  const month = py.int(found[1]), day = py.int(found[2])
  now = now ?? Date.now() / 1000
  const year = local(now, zone).year
  const candidates = [year - 1, year, year + 1].map(each => noonOf(each, month, day, zone)).filter(py.truthy)
  if (ahead) {
    const today = local(now, zone)
    const start = noonOf(today.year, today.month, today.day, zone)
    const later = candidates.filter(each => each >= start)
    return later.length ? Math.min(...later) : null
  }
  if (!candidates.length) return null
  return candidates.reduce((best, each) => Math.abs(each - now) < Math.abs(best - now) ? each : best)
}
