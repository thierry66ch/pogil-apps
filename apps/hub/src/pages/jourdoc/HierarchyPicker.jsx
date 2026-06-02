import { useState, useMemo } from 'react'
import { buildPathMap } from './hooks'

/**
 * Sélecteur hiérarchique avec recherche textuelle.
 * mode="single" → une valeur (id), mode="multi" → tableau d'ids
 */
export default function HierarchyPicker({ items, value, onChange, mode = 'single', placeholder = 'Rechercher…', label }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const pathMap = useMemo(() => buildPathMap(items), [items])

  const filtered = useMemo(() => {
    if (!q) return items
    const lq = q.toLowerCase()
    return items.filter(i =>
      i.nom.toLowerCase().includes(lq) ||
      (i.nom_court ?? '').toLowerCase().includes(lq)
    )
  }, [items, q])

  function toggle(id) {
    if (mode === 'single') {
      onChange(value === id ? null : id)
      setOpen(false)
    } else {
      const arr = value ?? []
      onChange(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id])
    }
  }

  function isSelected(id) {
    return mode === 'single' ? value === id : (value ?? []).includes(id)
  }

  function displayValue() {
    if (mode === 'single') {
      const item = items.find(i => i.id === value)
      return item ? item.nom : ''
    }
    const sel = (value ?? []).map(id => items.find(i => i.id === id)?.nom).filter(Boolean)
    return sel.length ? sel.join(', ') : ''
  }

  return (
    <div className="jd-picker" style={{ position: 'relative' }}>
      {label && <label className="form-label">{label}</label>}
      <div
        className="input jd-picker__trigger"
        tabIndex={0}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setOpen(o => !o) }}
        role="combobox"
        aria-expanded={open}
      >
        <span style={{ color: displayValue() ? 'var(--text)' : 'var(--text-subtle)', flex: 1 }}>
          {displayValue() || placeholder}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>{open ? '▲' : '▼'}</span>
      </div>

      {open && (
        <div className="jd-picker__dropdown">
          <div style={{ padding: '.375rem' }}>
            <input
              className="input"
              style={{ padding: '.4rem .6rem', fontSize: '.875rem' }}
              placeholder="Rechercher…"
              value={q}
              onChange={e => setQ(e.target.value)}
              autoFocus
            />
          </div>
          <ul className="jd-picker__list">
            {filtered.length === 0 && (
              <li className="jd-picker__empty">Aucun résultat</li>
            )}
            {filtered.map(item => {
              const path = pathMap.get(item.id) ?? ''
              const selected = isSelected(item.id)
              return (
                <li
                  key={item.id}
                  className={`jd-picker__item${selected ? ' selected' : ''}${item.est_individu ? ' individu' : ''}`}
                  onClick={() => toggle(item.id)}
                >
                  <span className="jd-picker__nom">{item.nom}</span>
                  {path && <span className="jd-picker__path">({path})</span>}
                  {selected && <span className="jd-picker__check">✓</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {open && <div className="jd-picker__backdrop" onClick={() => setOpen(false)} />}
    </div>
  )
}
