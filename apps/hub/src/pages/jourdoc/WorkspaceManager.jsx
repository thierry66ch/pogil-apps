import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import CsvImporter from './CsvImporter'

const ROLE_LABEL = { owner: 'Propriétaire', member: 'Membre' }

export default function WorkspaceManager() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const showCreateOnMount = searchParams.get('new') === '1'

  const [ws, setWs] = useState(null)
  const [members, setMembers] = useState([])
  const [allWs, setAllWs] = useState([])
  const [myRole, setMyRole] = useState('member')

  const [editName, setEditName] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [inviteId, setInviteId] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteError, setInviteError] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)

  const [importTab, setImportTab] = useState('objets')
  const [newWsName, setNewWsName] = useState('')
  const [showCreate, setShowCreate] = useState(showCreateOnMount)
  const [createLoading, setCreateLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const [wsData, membersData, wsListData] = await Promise.all([
      fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) }).then(r => r.json()),
      fetch(API_ROUTES.JD_WS_MEMBERS(wsId), { headers: authHeader(token) }).then(r => r.json()),
      fetch(API_ROUTES.JD_WORKSPACES(), { headers: authHeader(token) }).then(r => r.json()),
    ])
    setWs(wsData.workspace)
    setEditName(wsData.workspace?.name ?? '')
    const mems = membersData.members ?? []
    setMembers(mems)
    setAllWs(wsListData.workspaces ?? [])

    // Determine current user's role
    const userId = JSON.parse(atob(token.split('.')[1])).sub
    const me = mems.find(m => m.id === userId)
    setMyRole(me?.role ?? 'member')
  }

  useEffect(() => { load() }, [wsId, token])

  const isOwner = myRole === 'owner'

  async function saveName() {
    if (!editName.trim() || editName === ws?.name) { setEditingName(false); return }
    const res = await fetch(`/api/jourdoc/${wsId}`, {
      method: 'PATCH', headers: authHeader(token), body: JSON.stringify({ name: editName.trim() })
    })
    if (res.ok) { await load(); setEditingName(false); setMsg('Workspace renommé.') }
  }

  async function deleteWs() {
    if (!confirm(`Supprimer le workspace "${ws?.name}" et TOUTES ses données (notes, objets, thèmes, médias) ? Cette action est irréversible.`)) return
    const res = await fetch(`/api/jourdoc/${wsId}`, { method: 'DELETE', headers: authHeader(token) })
    if (res.ok) navigate('/')
  }

  async function invite(e) {
    e.preventDefault()
    setInviteError('')
    setInviteLoading(true)
    try {
      const res = await fetch(API_ROUTES.JD_WS_MEMBERS(wsId), {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ identifier: inviteId, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) { setInviteError(data.error ?? 'Erreur'); return }
      setInviteId('')
      await load()
      setMsg(`${data.user?.username ?? 'Utilisateur'} ajouté.`)
    } finally { setInviteLoading(false) }
  }

  async function changeRole(uid, role) {
    await fetch(API_ROUTES.JD_WS_MEMBER(wsId, uid), {
      method: 'PUT', headers: authHeader(token), body: JSON.stringify({ role })
    })
    await load()
  }

  async function removeMember(uid, username) {
    if (!confirm(`Retirer ${username} du workspace ?`)) return
    await fetch(API_ROUTES.JD_WS_MEMBER(wsId, uid), { method: 'DELETE', headers: authHeader(token) })
    await load()
  }

  async function createWs(e) {
    e.preventDefault()
    if (!newWsName.trim()) return
    setCreateLoading(true)
    try {
      const res = await fetch(API_ROUTES.JD_WORKSPACES(), {
        method: 'POST', headers: authHeader(token), body: JSON.stringify({ name: newWsName.trim() })
      })
      let data
      try { data = await res.json() } catch { data = {} }
      if (res.ok && data.id) {
        navigate(`/jourdoc/${data.id}`)
      } else {
        setMsg(`Erreur ${res.status} : ${data.error ?? 'impossible de créer le workspace'}`)
      }
    } catch (err) {
      setMsg(`Erreur réseau : ${err.message}`)
    } finally {
      setCreateLoading(false)
    }
  }

  return (
    <div className="ws-manager">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <h2>⚙️ Workspace</h2>
      </div>

      {msg && <p className="msg msg-success" style={{ marginBottom: '1rem' }}>{msg}</p>}

      {/* ── Infos workspace courant ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Workspace courant</h3>

        {editingName ? (
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input className="input" value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveName()}
              autoFocus style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={saveName}>✓</button>
            <button className="btn btn-ghost" onClick={() => { setEditingName(false); setEditName(ws?.name ?? '') }}>✕</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
            <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>{ws?.name}</span>
            {isOwner && (
              <>
                <button className="btn btn-secondary" style={{ padding: '.35rem .7rem', fontSize: '.8rem' }}
                  onClick={() => setEditingName(true)}>✏️ Renommer</button>
                <button className="btn btn-danger" style={{ padding: '.35rem .7rem', fontSize: '.8rem' }}
                  onClick={deleteWs}>🗑 Supprimer</button>
              </>
            )}
          </div>
        )}
      </section>

      {/* ── Membres ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Membres</h3>

        <div className="ws-manager__members">
          {members.map(m => (
            <div key={m.id} className="ws-manager__member">
              <div className="ws-manager__member-info">
                <span className="ws-manager__member-name">{m.username}</span>
                <span className="ws-manager__member-email">{m.email}</span>
              </div>
              <div className="ws-manager__member-actions">
                {isOwner ? (
                  <select
                    className="input"
                    style={{ padding: '.25rem .5rem', fontSize: '.8125rem', width: 'auto' }}
                    value={m.role}
                    onChange={e => changeRole(m.id, e.target.value)}
                  >
                    <option value="owner">Propriétaire</option>
                    <option value="member">Membre</option>
                  </select>
                ) : (
                  <span className="badge badge-accent">{ROLE_LABEL[m.role]}</span>
                )}
                {isOwner && (
                  <button className="btn btn-danger" style={{ padding: '.25rem .5rem', fontSize: '.8rem' }}
                    onClick={() => removeMember(m.id, m.username)}>Retirer</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {isOwner && (
          <form onSubmit={invite} className="ws-manager__invite">
            <h4 className="ws-manager__subtitle">Inviter un utilisateur</h4>
            {inviteError && <p className="msg msg-error" style={{ marginBottom: '.5rem' }}>{inviteError}</p>}
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
              <input className="input" value={inviteId}
                onChange={e => setInviteId(e.target.value)}
                placeholder="Nom d'utilisateur ou email"
                style={{ flex: 1, minWidth: '180px' }} required />
              <select className="input" value={inviteRole}
                onChange={e => setInviteRole(e.target.value)}
                style={{ width: 'auto', padding: '.6rem .75rem' }}>
                <option value="member">Membre</option>
                <option value="owner">Propriétaire</option>
              </select>
              <button className="btn btn-primary" type="submit" disabled={inviteLoading}>
                {inviteLoading ? '…' : 'Ajouter'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* ── Mes autres workspaces ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">Mes workspaces JourDoc</h3>
        <div className="ws-manager__ws-list">
          {allWs.map(w => (
            <button key={w.id}
              className={`ws-manager__ws-item${w.id === Number(wsId) ? ' current' : ''}`}
              onClick={() => w.id !== Number(wsId) && navigate(`/jourdoc/${w.id}`)}>
              {w.name}
              <span className="ws-manager__ws-role">{w.role === 'owner' ? 'owner' : 'membre'}</span>
            </button>
          ))}
        </div>

        {showCreate ? (
          <form onSubmit={createWs} style={{ display: 'flex', gap: '.5rem', marginTop: '.75rem' }}>
            <input className="input" value={newWsName} onChange={e => setNewWsName(e.target.value)}
              placeholder="Nom du nouveau workspace" style={{ flex: 1 }} required autoFocus />
            <button className="btn btn-primary" type="submit" disabled={createLoading}>
              {createLoading ? '…' : 'Créer'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { setShowCreate(false); setNewWsName('') }}>
              Annuler
            </button>
          </form>
        ) : (
          <button className="btn btn-secondary" style={{ marginTop: '.75rem' }}
            onClick={() => setShowCreate(true)}>
            ✚ Créer un nouveau workspace
          </button>
        )}
      </section>

      {/* ── Import CSV ── */}
      <section className="ws-manager__section">
        <h3 className="ws-manager__title">📥 Importer des données CSV</h3>
        <p style={{ fontSize: '.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Importez en masse des objets ou des thèmes depuis un fichier CSV. Les doublons sont ignorés.
        </p>

        <div className="ws-manager__import-tabs">
          <button
            className={`ws-manager__import-tab${importTab === 'objets' ? ' active' : ''}`}
            onClick={() => setImportTab('objets')}>🌿 Objets</button>
          <button
            className={`ws-manager__import-tab${importTab === 'themes' ? ' active' : ''}`}
            onClick={() => setImportTab('themes')}>🏷️ Thèmes</button>
        </div>

        <CsvImporter key={importTab} wsId={wsId} token={token} type={importTab} onDone={() => setMsg(`Import ${importTab} terminé.`)} />
      </section>
    </div>
  )
}
