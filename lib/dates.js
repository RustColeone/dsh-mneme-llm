// Dates as mneme-llm's Python sees them: the local time of a moment in a zone, and its talking day. A port of the parts
// of mneme_llm/dates.py that the ported modules use; relative dates ("yesterday", "in 3 days") come with the notes.
//
// A zone is null (the machine's), { name: 'Asia/Shanghai' } (an IANA name) or { offset: 28800 } (seconds east of UTC),
// as `config.zoneOf` makes it from "", "Asia/Shanghai" or "UTC+8".
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
