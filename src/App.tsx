import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import {
  deleteBlob,
  exportStage,
  IMAGE_ACCEPT,
  importStage,
  isImageFile,
  loadProfile,
  newId,
  putBlob,
  saveProfile,
} from './storage'
import { COLS, MIN_CELLS, type Profile } from './types'
import { useObjectUrl } from './useObjectUrl'

function padGrid(grid: (string | null)[]): (string | null)[] {
  const next = [...grid]
  const filled = next.filter(Boolean).length
  const needed = Math.max(MIN_CELLS, Math.ceil((filled + COLS) / COLS) * COLS)
  while (next.length < needed) next.push(null)
  while (next.length > needed) {
    if (next[next.length - 1] !== null) break
    if (next.length <= MIN_CELLS) break
    next.pop()
  }
  const remainder = next.length % COLS
  if (remainder !== 0) {
    for (let i = 0; i < COLS - remainder; i++) next.push(null)
  }
  return next
}

function IconPlus() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconMenu() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  )
}

function IconReels() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 8l4 2 4-2M10 16V9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function IconTagged() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19c1.4-3 4-4.5 7-4.5S17.6 16 19 19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconPerson() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 19c1.6-3.2 4-4.8 7-4.8S17.4 15.8 19 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Profile | null>(null)
  const [activePhoto, setActivePhoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const avatarRef = useRef<HTMLInputElement>(null)
  const highlightRef = useRef<HTMLInputElement>(null)
  const backupRef = useRef<HTMLInputElement>(null)
  const dropIndexRef = useRef<number | null>(null)
  const highlightTarget = useRef<string | null>(null)
  const [avatarOver, setAvatarOver] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  useEffect(() => {
    setProfile(loadProfile())
  }, [])

  useEffect(() => {
    if (profile) saveProfile(profile)
  }, [profile])

  const update = useCallback((patch: Partial<Profile> | ((p: Profile) => Profile)) => {
    setProfile((prev) => {
      if (!prev) return prev
      return typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
    })
  }, [])

  const placeFiles = useCallback(
    async (startIndex: number, files: File[]) => {
      const images = files.filter(isImageFile)
      if (!images.length) return
      const ids: string[] = []
      for (const file of images) {
        const id = newId()
        await putBlob(id, file)
        ids.push(id)
      }
      update((p) => {
        const grid = [...p.grid]
        let i = startIndex
        for (const id of ids) {
          while (i < grid.length && grid[i]) i++
          if (i >= grid.length) grid.push(id)
          else grid[i] = id
          i++
        }
        const posts = String(grid.filter(Boolean).length)
        return { ...p, grid: padGrid(grid), posts }
      })
    },
    [update],
  )

  const removeAt = useCallback(
    async (index: number) => {
      const id = profile?.grid[index]
      if (!id) return
      await deleteBlob(id)
      update((p) => {
        const grid = [...p.grid]
        grid[index] = null
        return { ...p, grid: padGrid(grid), posts: String(grid.filter(Boolean).length) }
      })
    },
    [profile, update],
  )

  const shiftForNewPost = useCallback(() => {
    update((p) => ({ ...p, grid: padGrid([null, ...p.grid]) }))
  }, [update])

  const undoShift = useCallback(() => {
    update((p) => {
      if (p.grid[0] !== null) return p
      return { ...p, grid: padGrid(p.grid.slice(1)) }
    })
  }, [update])

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id)
    if (id.startsWith('photo:')) setActivePhoto(id.slice(6))
  }

  const onDragEnd = (event: DragEndEvent) => {
    setActivePhoto(null)
    const over = event.over
    if (!over) return
    const from = Number(event.active.data.current?.index)
    const to = Number(over.data.current?.index)
    if (Number.isNaN(from) || Number.isNaN(to) || from === to) return
    update((p) => {
      const grid = [...p.grid]
      const tmp = grid[from]
      grid[from] = grid[to]
      grid[to] = tmp
      return { ...p, grid: padGrid(grid) }
    })
  }

  const onAvatar = async (file: File | undefined) => {
    if (!file || !isImageFile(file)) return
    const id = newId()
    await putBlob(id, file)
    const old = profile?.avatarId
    update({ avatarId: id })
    if (old) void deleteBlob(old)
  }

  const onHighlightPhoto = async (file: File | undefined) => {
    const hid = highlightTarget.current
    if (!hid || !file || !isImageFile(file)) return
    const id = newId()
    await putBlob(id, file)
    update((p) => ({
      ...p,
      highlights: p.highlights.map((h) => {
        if (h.id !== hid) return h
        if (h.photoId) void deleteBlob(h.photoId)
        return { ...h, photoId: id }
      }),
    }))
  }

  if (!profile) {
    return (
      <div className="stage">
        <div className="phone">
          <p className="loading">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="stage">
      <p className="hint">
        Photos stay in this browser when the code updates. Export a backup from Edit profile if you want a file copy.
      </p>
      <div className="tools">
        <button className="pill" type="button" onClick={shiftForNewPost}>
          Shift for new post
        </button>
        <button
          className="pill"
          type="button"
          onClick={undoShift}
          disabled={profile.grid[0] !== null}
        >
          Undo shift
        </button>
      </div>
      <div className="phone">
        <header className="topbar">
          <div className="topbar-user">
            <span>{profile.username}</span>
            <svg className="chevron" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" type="button" aria-label="New post" onClick={() => fileRef.current?.click()}>
              <IconPlus />
            </button>
            <button className="icon-btn" type="button" aria-label="Menu" onClick={() => setEditing(true)}>
              <IconMenu />
            </button>
          </div>
        </header>

        <section className="header">
          <div
            className={`avatar-wrap${avatarOver ? ' over' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => avatarRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') avatarRef.current?.click()
            }}
            onDragOver={(e) => {
              if ([...e.dataTransfer.types].includes('Files')) {
                e.preventDefault()
                setAvatarOver(true)
              }
            }}
            onDragLeave={() => setAvatarOver(false)}
            onDrop={(e) => {
              const file = e.dataTransfer.files[0]
              if (file) {
                e.preventDefault()
                e.stopPropagation()
                setAvatarOver(false)
                void onAvatar(file)
              }
            }}
            aria-label="Change profile photo"
          >
            <div className="avatar-inner">
              <AvatarImage id={profile.avatarId} />
            </div>
          </div>
          <div className="stats">
            <div className="stat">
              <b>{profile.posts}</b>
              <span>posts</span>
            </div>
            <button className="stat" type="button" onClick={() => setEditing(true)}>
              <b>{profile.followers}</b>
              <span>followers</span>
            </button>
            <button className="stat" type="button" onClick={() => setEditing(true)}>
              <b>{profile.following}</b>
              <span>following</span>
            </button>
          </div>
        </section>

        <div className="bio">
          <div className="bio-name">{profile.displayName}</div>
          <p className="bio-text">{profile.bio}</p>
          {profile.website ? (
            <a className="bio-link" href={profile.website} target="_blank" rel="noreferrer">
              {profile.website.replace(/^https?:\/\//, '')}
            </a>
          ) : null}
        </div>

        <div className="actions">
          <button className="pill" type="button" onClick={() => { setDraft(profile); setEditing(true) }}>
            Edit profile
          </button>
          <button className="pill" type="button" onClick={() => fileRef.current?.click()}>
            Add photos
          </button>
          <button className="pill ghost" type="button" aria-label="Suggested" onClick={() => setEditing(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="8" cy="10" r="3" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="16" cy="10" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 19c1-3 3-4.5 5-4.5S12 16 13 19M11 19c1-3 3-4.5 5-4.5S21 16 22 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="highlights">
          {profile.highlights.map((h) => (
            <button
              key={h.id}
              className="highlight"
              type="button"
              onClick={() => {
                highlightTarget.current = h.id
                highlightRef.current?.click()
              }}
            >
              <div className={`highlight-ring${h.photoId ? '' : ' empty'}`}>
                {h.photoId ? <HighlightCover id={h.photoId} /> : <div>+</div>}
              </div>
              <span>{h.label}</span>
            </button>
          ))}
        </div>

        <nav className="tabs">
          <button className="tab active" type="button" aria-label="Posts grid">
            <IconGrid />
          </button>
          <button className="tab" type="button" aria-label="Reels" disabled>
            <IconReels />
          </button>
          <button className="tab" type="button" aria-label="Tagged" disabled>
            <IconTagged />
          </button>
        </nav>

        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="grid">
            {profile.grid.map((photoId, index) => (
              <GridCell
                key={`${index}-${photoId ?? 'empty'}`}
                index={index}
                photoId={photoId}
                onRemove={() => void removeAt(index)}
                onFiles={(files) => void placeFiles(index, files)}
                onPick={() => {
                  dropIndexRef.current = index
                  fileRef.current?.click()
                }}
              />
            ))}
          </div>
          <DragOverlay className="drag-overlay">
            {activePhoto ? <OverlayImage id={activePhoto} /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          const start = dropIndexRef.current ?? profile.grid.findIndex((c) => !c)
          dropIndexRef.current = null
          void placeFiles(start < 0 ? profile.grid.length : start, files)
          e.target.value = ''
        }}
      />
      <input
        ref={avatarRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void onAvatar(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      <input
        ref={highlightRef}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          void onHighlightPhoto(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {editing && (draft ?? profile) ? (
        <EditSheet
          value={draft ?? profile}
          onChange={setDraft}
          onClose={() => { setEditing(false); setDraft(null) }}
          onSave={() => {
            if (draft) update(draft)
            setEditing(false)
            setDraft(null)
          }}
          onExport={() => {
            if (profile) void exportStage(profile)
          }}
          onImport={() => backupRef.current?.click()}
        />
        <input
          ref={backupRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            void importStage(file).then((next) => {
              setProfile(next)
              setEditing(false)
              setDraft(null)
            })
          }}
        />
      ) : null}
    </div>
  )
}

function AvatarImage({ id }: { id: string | null }) {
  const url = useObjectUrl(id)
  if (!url) {
    return (
      <div className="avatar placeholder">
        <IconPerson />
      </div>
    )
  }
  return <img className="avatar" src={url} alt="" />
}

function HighlightCover({ id }: { id: string }) {
  const url = useObjectUrl(id)
  if (!url) return <div />
  return <img src={url} alt="" />
}

function OverlayImage({ id }: { id: string }) {
  const url = useObjectUrl(id)
  if (!url) return null
  return <img src={url} alt="" />
}

function GridCell({
  index,
  photoId,
  onRemove,
  onFiles,
  onPick,
}: {
  index: number
  photoId: string | null
  onRemove: () => void
  onFiles: (files: File[]) => void
  onPick: () => void
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `cell:${index}`,
    data: { index },
  })
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } =
    useDraggable({
      id: photoId ? `photo:${photoId}` : `empty:${index}`,
      data: { index },
      disabled: !photoId,
    })
  const url = useObjectUrl(photoId)
  const [fileOver, setFileOver] = useState(false)

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  }

  const setRefs = (node: HTMLDivElement | null) => {
    setDropRef(node)
    setDragRef(node)
  }

  return (
    <div
      ref={setRefs}
      className={`cell${photoId ? '' : ' empty'}${isOver || fileOver ? ' over' : ''}`}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!photoId) onPick()
      }}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes('Files')) {
          e.preventDefault()
          setFileOver(true)
        }
      }}
      onDragLeave={() => setFileOver(false)}
      onDrop={(e) => {
        if (e.dataTransfer.files.length) {
          e.preventDefault()
          e.stopPropagation()
          setFileOver(false)
          onFiles([...e.dataTransfer.files])
        }
      }}
    >
      {url ? <img src={url} alt="" /> : <span>Drop photo</span>}
      {photoId ? (
        <button
          className="cell-remove"
          type="button"
          aria-label="Remove photo"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}

function EditSheet({
  value,
  onChange,
  onClose,
  onSave,
  onExport,
  onImport,
}: {
  value: Profile
  onChange: (p: Profile) => void
  onClose: () => void
  onSave: () => void
  onExport: () => void
  onImport: () => void
}) {
  const set = (patch: Partial<Profile>) => onChange({ ...value, ...patch })
  const highlights = useMemo(() => value.highlights, [value.highlights])

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit profile"
      >
        <h2>Edit profile</h2>
        <label className="field">
          Display name
          <input value={value.displayName} onChange={(e) => set({ displayName: e.target.value })} />
        </label>
        <label className="field">
          Username
          <input value={value.username} onChange={(e) => set({ username: e.target.value.replace(/\s/g, '') })} />
        </label>
        <label className="field">
          Bio
          <textarea value={value.bio} onChange={(e) => set({ bio: e.target.value })} />
        </label>
        <label className="field">
          Website
          <input
            value={value.website}
            placeholder="https://"
            onChange={(e) => set({ website: e.target.value })}
          />
        </label>
        <div className="sheet-row">
          <label className="field">
            Posts
            <input value={value.posts} onChange={(e) => set({ posts: e.target.value })} />
          </label>
          <label className="field">
            Followers
            <input value={value.followers} onChange={(e) => set({ followers: e.target.value })} />
          </label>
          <label className="field">
            Following
            <input value={value.following} onChange={(e) => set({ following: e.target.value })} />
          </label>
        </div>
        {highlights.map((h, i) => (
          <label className="field" key={h.id}>
            Highlight {i + 1} label
            <input
              value={h.label}
              onChange={(e) => {
                const next = highlights.map((item, idx) =>
                  idx === i ? { ...item, label: e.target.value } : item,
                )
                set({ highlights: next })
              }}
            />
          </label>
        ))}
        <p className="field">
          Photos live in this browser, not in Git. Export a backup before clearing site data.
        </p>
        <div className="sheet-actions">
          <button className="pill" type="button" onClick={onExport}>
            Export backup
          </button>
          <button className="pill" type="button" onClick={onImport}>
            Import backup
          </button>
        </div>
        <div className="sheet-actions">
          <button className="pill" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="pill" type="button" onClick={onSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
