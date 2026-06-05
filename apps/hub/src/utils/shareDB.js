function openShareDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('pogil-share', 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore('pending')
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = () => reject(req.error)
  })
}

export function getSharedFiles() {
  return openShareDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readonly')
    const req = tx.objectStore('pending').get('files')
    req.onsuccess = () => resolve(req.result ?? [])
    req.onerror = () => reject(req.error)
  }))
}

export function clearSharedFiles() {
  return openShareDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite')
    tx.objectStore('pending').delete('files')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}
