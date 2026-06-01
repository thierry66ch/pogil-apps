/* global __BUILD_NUMBER__, __BUILD_DATE__ */

function formatDate(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function Footer() {
  return (
    <footer className="app-footer">
      pogil apps — build {__BUILD_NUMBER__} · {formatDate(__BUILD_DATE__)}
    </footer>
  )
}
