import { useState, useRef, useEffect } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

/**
 * Sélecteur d'éléments plat (non hiérarchique) avec création inline.
 * Props: elements (liste), value (ids sélectionnés), onChange, wsId, token
 */
export default function ElementPicker({ elements = [], value = [], onChange, wsId, token }) {
  const [search, setSearch]   = useState('')
  const [open, setOpen]       = useState(false)
  const [creating, setCreating] = useState(false)
  const inputRef = useRef(null)
  const dropRef  = useRef(null)

  const selectedSet = new Set(value)
  const filtered = elements.filter(e =>
    e.nom.toLowerCase().includes(search.toLowerCase()) && !selectedSet.has(e.id)
  )
  const selectedElements = elements.filter(e => selectedSet.has(e.id))
  const canCreate = search.trim() && !elements.some(e => e.nom.toLowerCase() === search.trim().toLowerCase())

  useEffect(() => {
    function onClick(e) {
      if (!dropRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle(id) {
    const next = selectedSet.has(id)
      ? value.filter(v => v !== id)
      : [...value, id]
    onChange(next)
  }

  function remove(id) { onChange(value.filter(v => v !== id)) }

  async function createAndAdd() {
    const nom = search.trim()
    if (!nom || creating) return
    setCreating(true)
    try {
      const res = await fetch(API_ROUTES.JD_ELEMENTS(wsId), {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({ nom }),
      })
      const data = await res.json()
      if (data.id) {
        onChange([...value, data.id])
        setSearch('')
      }
    } finally { setCreating(false) }
  }

  return (
    <div className="element-picker" ref={dropRef}>
      {/* Chips des éléments sélectionnés */}
      {selectedElements.length > 0 && (
        <div className="element-picker__chips">
          {selectedElements.map(e => (
            <span key={e.id} className="element-chip">
              {e.nom}
              <button type="button" className="element-chip__remove"
                onMouseDown={ev => { ev.preventDefault(); remove(e.id) }}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* Champ de recherche / saisie */}
      <div className="element-picker__input-row">
        <input
          ref={inputRef}
          className="input element-picker__input"
          placeholder="Rechercher ou créer un élément…"
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (canCreate) createAndAdd() }
            if (e.key === 'Escape') setOpen(false)
          }}
        />
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || canCreate) && (
        <div className="element-picker__dropdown">
          {filtered.map(e => (
            <button key={e.id} type="button" className="element-picker__option"
              onMouseDown={ev => { ev.preventDefault(); toggle(e.id); setSearch(''); setOpen(false) }}>
              {e.nom}
            </button>
          ))}
          {canCreate && (
            <button type="button" className="element-picker__option element-picker__create"
              onMouseDown={ev => { ev.preventDefault(); createAndAdd() }}
              disabled={creating}>
              {creating ? '…' : `✚ Créer "${search.trim()}"`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
