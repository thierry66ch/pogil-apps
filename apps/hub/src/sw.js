import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ── IndexedDB helpers (inline — pas d'import côté SW) ─────
function openShareDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pogil-share', 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore('pending')
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

function storeSharedFiles(files) {
  return openShareDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite')
    tx.objectStore('pending').put(Array.from(files), 'files')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

// ── Share Target : intercepte POST /share-target ──────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith((async () => {
      try {
        const data = await event.request.formData()
        const files = data.getAll('files').filter(f => f instanceof File)
        if (files.length > 0) await storeSharedFiles(files)
      } catch { /* continuer même si le stockage échoue */ }
      return Response.redirect('/share-target?shared=1', 303)
    })())
  }
})
