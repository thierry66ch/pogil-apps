// Utilitaires calendrier partagés entre CalendarView et MediaGallery

export function toISO(d) { return d.toISOString().slice(0, 10) }
export function todayISO() { return toISO(new Date()) }

export function getRange(anchor, period) {
  const d = new Date(anchor + 'T00:00:00')
  switch (period) {
    case 'day':
      return { from: anchor, to: anchor }
    case 'week': {
      const dow = (d.getDay() + 6) % 7
      const mon = new Date(d); mon.setDate(d.getDate() - dow)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return { from: toISO(mon), to: toISO(sun) }
    }
    case 'month': {
      const f = new Date(d.getFullYear(), d.getMonth(), 1)
      const l = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      return { from: toISO(f), to: toISO(l) }
    }
    case 'quarter': {
      const q = Math.floor(d.getMonth() / 3)
      const f = new Date(d.getFullYear(), q * 3, 1)
      const l = new Date(d.getFullYear(), (q + 1) * 3, 0)
      return { from: toISO(f), to: toISO(l) }
    }
    case 'year':
      return { from: `${d.getFullYear()}-01-01`, to: `${d.getFullYear()}-12-31` }
    default: return { from: anchor, to: anchor }
  }
}

export function shiftAnchor(anchor, period, dir) {
  const d = new Date(anchor + 'T00:00:00')
  switch (period) {
    case 'day':     d.setDate(d.getDate() + dir); break
    case 'week':    d.setDate(d.getDate() + dir * 7); break
    case 'month':   d.setMonth(d.getMonth() + dir); break
    case 'quarter': d.setMonth(d.getMonth() + dir * 3); break
    case 'year':    d.setFullYear(d.getFullYear() + dir); break
  }
  return toISO(d)
}

export function rangeLabel(anchor, period) {
  const { from, to } = getRange(anchor, period)
  const df = new Date(from + 'T00:00:00')
  const dt = new Date(to + 'T00:00:00')
  const fmt = (d, opts) => d.toLocaleDateString('fr-CH', opts)
  switch (period) {
    case 'day':
      return fmt(df, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    case 'week': {
      const jan1 = new Date(df.getFullYear(), 0, 1)
      const wn = Math.ceil(((df - jan1) / 86400000 + jan1.getDay() + 1) / 7)
      return `Sem. ${wn} · ${fmt(df, { day: 'numeric', month: 'short' })} – ${fmt(dt, { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    case 'month':
      return fmt(df, { month: 'long', year: 'numeric' })
    case 'quarter': {
      const q = Math.floor(df.getMonth() / 3) + 1
      return `T${q} ${df.getFullYear()} (${fmt(df, { month: 'short' })} – ${fmt(dt, { month: 'short' })})`
    }
    case 'year': return `${df.getFullYear()}`
  }
}

// Grouper des notes par date → Map<ISO, Note[]>
export function groupNotesByDate(notes) {
  const map = new Map()
  for (const n of notes) {
    const k = n.date ?? ''
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(n)
  }
  return map
}

// Tous les jours d'un mois sous forme d'ISO strings
export function daysOfMonth(year, month) {
  const count = new Date(year, month + 1, 0).getDate()
  return Array.from({ length: count }, (_, i) =>
    toISO(new Date(year, month, i + 1))
  )
}

// Tous les jours d'une semaine (lundi → dimanche)
export function daysOfWeek(anchor) {
  const { from } = getRange(anchor, 'week')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(from + 'T00:00:00')
    d.setDate(d.getDate() + i)
    return toISO(d)
  })
}

export function fmtDay(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
export function fmtDayShort(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', {
    day: 'numeric', month: 'short'
  })
}
export function fmtWeekday(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { weekday: 'short' })
}

// Aplatir la hiérarchie d'objets avec profondeur
export function flattenObjects(objects) {
  const map = new Map(objects.map(o => [o.id, { ...o, children: [] }]))
  const roots = []
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id).children.push(node)
    else roots.push(node)
  }
  const result = []
  function traverse(node, depth) {
    result.push({ ...node, depth })
    const kids = node.children.slice().sort((a, b) => a.nom.localeCompare(b.nom))
    for (const c of kids) traverse(c, depth + 1)
  }
  roots.sort((a, b) => a.nom.localeCompare(b.nom)).forEach(r => traverse(r, 0))
  return result
}
