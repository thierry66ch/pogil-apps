import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { buildPathMap } from './hooks'

/**
 * Sélecteur hiérarchique avec recherche textuelle et navigation clavier.
 * mode="single"  → valeur unique (id ou null)
 * mode="multi"   → tableau d'ids
 * nullable=true  → affiche "— option racine —" en tête (valeur null)
 */
export default function HierarchyPicker({
  items, value, onChange, mode = 'single',
  placeholder = 'Rechercher…', label,
  nullable = false, nullLabel = '— Racine —',
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const searchRef = useRef(null)
  const listRef = useRef(null)
  const pathMap = useMemo(() => buildPathMap(items), [items])

  // Liste complète : option racine éventuelle + items normaux
  const baseItems = useMemo(() =>
    nullable ? [{ id: null, nom: nullLabel, nom_court: '' }, ...items] : items
  , [items, nullable, nullLabel])

  const filtered = useMemo(() => {
    if (!q) return baseItems
    const lq = q.toLowerCase()
    return baseItems.filter(i =>
      i.id === null ||                                  // racine toujours visible
      i.nom.toLowerCase().includes(lq) ||
      (i.nom_court ?? '').toLowerCase().includes(lq)
    )
  }, [baseItems, q])

  // Réinitialiser le focus sur le premier élément quand la liste change
  useEffect(() => { setFocusedIdx(0) }, [q])

  // Scroll automatique vers l'élément focalisé
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelectorAll('li')[focusedIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [focusedIdx])

  const close = useCallback(() => {
    setOpen(false)
    setQ('')
    setFocusedIdx(0)
  }, [])

  function select(id) {
    if (mode === 'single') {
      onChange(id)
      close()
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
      if (value === null && nullable) return nullLabel
      const item = items.find(i => i.id === value)
      return item ? item.nom : ''
    }
    const sel = (value ?? []).map(id => items.find(i => i.id === id)?.nom).filter(Boolean)
    return sel.length ? sel.join(', ') : ''
  }

  function handleTriggerKey(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(o => {
        if (!o) setTimeout(() => searchRef.current?.focus(), 30)
        return !o
      })
    }
  }

  function handleSearchKey(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIdx(i => Math.min(i + 1, filtered.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIdx(i => Math.max(i - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (filtered.length > 0) select(filtered[focusedIdx]?.id ?? filtered[0].id)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      default:
        break
    }
  }

  const hasValue = mode === 'single' ? (value !== null && value !== undefined) : (value ?? []).length > 0
  const displayText = displayValue()

  return (
    <div className="jd-picker" style={{ position: 'relative' }}>
      {label && <label className="form-label">{label}</label>}

      {/* Trigger */}
      <div
        className="input jd-picker__trigger"
        tabIndex={0}
        onClick={() => {
          setOpen(o => {
            if (!o) setTimeout(() => searchRef.current?.focus(), 30)
            return !o
          })
        }}
        onKeyDown={handleTriggerKey}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span style={{ color: hasValue ? 'var(--text)' : 'var(--text-subtle)', flex: 1 }}>
          {displayText || placeholder}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="jd-picker__dropdown">
          <div style={{ padding: '.375rem .375rem .25rem' }}>
            <input
              ref={searchRef}
              className="input"
              style={{ padding: '.4rem .6rem', fontSize: '.875rem' }}
              placeholder="Rechercher… (↑↓ naviguer, Entrée valider, Échap fermer)"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={handleSearchKey}
              autoFocus
            />
          </div>
          <ul ref={listRef} className="jd-picker__list" role="listbox">
            {filtered.length === 0 && (
              <li className="jd-picker__empty">Aucun résultat</li>
            )}
            {filtered.map((item, idx) => {
              const path = item.id !== null ? (pathMap.get(item.id) ?? '') : ''
              const selected = isSelected(item.id)
              const focused = idx === focusedIdx
              return (
                <li
                  key={item.id ?? '__null__'}
                  role="option"
                  aria-selected={selected}
                  className={[
                    'jd-picker__item',
                    selected ? 'selected' : '',
                    focused  ? 'focused'  : '',
                    item.id === null ? 'jd-picker__root' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => select(item.id)}
                  onMouseMove={() => setFocusedIdx(idx)}
                >
                  <span className="jd-picker__nom">{item.nom}</span>
                  {path && <span className="jd-picker__path">({path})</span>}
                  {selected && <span className="jd-picker__check">✓</span>}
                </li>
              )
            })}
          </ul>
          {mode === 'multi' && (value ?? []).length > 0 && (
            <div className="jd-picker__footer">
              {(value ?? []).length} sélectionné{(value ?? []).length > 1 ? 's' : ''}
              <button className="jd-picker__clear" onClick={() => onChange([])}>Effacer</button>
            </div>
          )}
        </div>
      )}
      {open && <div className="jd-picker__backdrop" onClick={close} />}
    </div>
  )
}
