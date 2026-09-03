import { defaultProfile, MIN_CELLS, type Profile } from './types'

const DB_NAME = 'instagram-stager'
const DB_VERSION = 1
const STORE = 'blobs'
const PROFILE_KEY = 'instagram-stager:profile'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export async function getBlob(id: string): Promise<Blob | undefined> {
  const db = await openDb()
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve(req.result as Blob | undefined)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return blob
}

export async function deleteBlob(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return defaultProfile()
    const parsed = JSON.parse(raw) as Partial<Profile>
    const base = defaultProfile()
    return {
      ...base,
      ...parsed,
      highlights: parsed.highlights?.length ? parsed.highlights : base.highlights,
      grid:
        Array.isArray(parsed.grid) && parsed.grid.length >= MIN_CELLS
          ? parsed.grid
          : base.grid,
    }
  } catch {
    return defaultProfile()
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export function newId(): string {
  return crypto.randomUUID()
}

export const IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif'

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  const name = file.name.toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].some((ext) =>
    name.endsWith(ext),
  )
}
