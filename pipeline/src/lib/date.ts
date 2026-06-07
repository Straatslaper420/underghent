const NL_MONTHS: Record<string, number> = {
  // Dutch
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6,
  juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, okt: 10, nov: 11, dec: 12,
  // English (full and abbreviated — "may" is same in both)
  january: 1, february: 2, march: 3, may: 5, june: 6,
  july: 7, august: 8, october: 10,
  mar: 3, oct: 10,
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseNlDate(s: string): string | null {
  if (!s) return null
  const clean = s.trim().toLowerCase().replace(/^(ma|di|wo|do|vr|za|zo)[,.\s]+/, '')

  // YYYY-MM-DD
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = clean.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (dmy) {
    const d = String(dmy[1]).padStart(2, '0')
    const m = String(dmy[2]).padStart(2, '0')
    return `${dmy[3]}-${m}-${d}`
  }

  // DD/MM without year — use current or next year
  const dmShort = clean.match(/^(\d{1,2})[\/\-.](\d{1,2})$/)
  if (dmShort) {
    const now = new Date()
    const d = parseInt(dmShort[1], 10)
    const m = parseInt(dmShort[2], 10)
    let year = now.getFullYear()
    const candidate = new Date(year, m - 1, d)
    if (candidate < now) year++
    return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  // D MMMM YYYY or D MMMM
  const dmy2 = clean.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/)
  if (dmy2) {
    const day = parseInt(dmy2[1], 10)
    const month = NL_MONTHS[dmy2[2]]
    if (!month) return null
    const now = new Date()
    let year = dmy2[3] ? parseInt(dmy2[3], 10) : now.getFullYear()
    if (!dmy2[3]) {
      const candidate = new Date(year, month - 1, day)
      if (candidate < now) year++
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // iCal format: YYYYMMDD
  const ical = clean.match(/^(\d{4})(\d{2})(\d{2})/)
  if (ical) return `${ical[1]}-${ical[2]}-${ical[3]}`

  return null
}

export function parseTime(s: string): string | null {
  if (!s) return null
  const match = s.match(/\b(\d{1,2})[h:](\d{2})\b|\b(\d{1,2})h\b/)
  if (!match) return null
  if (match[1] !== undefined) {
    return `${String(match[1]).padStart(2, '0')}:${match[2]}`
  }
  return `${String(match[3]).padStart(2, '0')}:00`
}

export function parseIcalDatetime(s: string): { date: string; time: string | null } | null {
  // YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS or YYYYMMDD
  const full = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/)
  if (full) {
    return {
      date: `${full[1]}-${full[2]}-${full[3]}`,
      time: `${full[4]}:${full[5]}`,
    }
  }
  const dateOnly = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (dateOnly) {
    return { date: `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`, time: null }
  }
  return null
}
