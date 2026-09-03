import { defaultProfile, type Profile } from './types'

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

function collectIds(profile: Profile): string[] {
  const ids = [
    profile.avatarId,
    ...profile.highlights.map((h) => h.photoId),
    ...profile.grid,
  ]
  return [...new Set(ids.filter((id): id is string => Boolean(id)))]
}

export function loadProfile(): Profile {
  const base = defaultProfile()
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Profile>
    return {
      ...base,
      ...parsed,
      highlights: parsed.highlights?.length ? parsed.highlights : base.highlights,
      grid: Array.isArray(parsed.grid) ? parsed.grid : base.grid,
    }
  } catch {
    return base
  }
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}

export async function exportStage(profile: Profile): Promise<void> {
  const blobs: Record<string, { type: string; data: string }> = {}
  for (const id of collectIds(profile)) {
    const blob = await getBlob(id)
    if (!blob) continue
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result)
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(blob)
    })
    blobs[id] = { type: blob.type || 'image/jpeg', data }
  }
  const payload = JSON.stringify({ version: 1, profile, blobs })
  const file = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = 'instagram-stager-backup.json'
  a.click()
  URL.revokeObjectURL(url)
}

export async function importStage(file: File): Promise<Profile> {
  const parsed = JSON.parse(await file.text()) as {
    profile: Profile
    blobs?: Record<string, { type: string; data: string }>
  }
  if (!parsed?.profile) throw new Error('Not a stager backup')
  for (const [id, rec] of Object.entries(parsed.blobs ?? {})) {
    const bin = atob(rec.data)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    await putBlob(id, new Blob([bytes], { type: rec.type || 'image/jpeg' }))
  }
  saveProfile(parsed.profile)
  return parsed.profile
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
