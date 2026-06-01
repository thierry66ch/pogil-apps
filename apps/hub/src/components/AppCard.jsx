import { useState } from 'react'
import { API_ROUTES } from '@pogil/shared'
import WorkspaceSelector from './WorkspaceSelector'

export default function AppCard({ app, token }) {
  const [workspaces, setWorkspaces] = useState(null)
  const [open, setOpen] = useState(false)

  async function handleClick() {
    if (workspaces === null) {
      const res = await fetch(API_ROUTES.ME_WORKSPACES(app.slug), {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      const ws = data.workspaces ?? []
      setWorkspaces(ws)
      if (ws.length === 1) {
        window.location.href = `/${app.slug}/${ws[0].id}`
        return
      }
    }
    setOpen((v) => !v)
  }

  return (
    <div className="app-card" onClick={handleClick}>
      <span className="app-icon">{app.icon ?? '📦'}</span>
      <span className="app-name">{app.name}</span>
      {open && workspaces && workspaces.length > 1 && (
        <WorkspaceSelector workspaces={workspaces} appSlug={app.slug} />
      )}
    </div>
  )
}
