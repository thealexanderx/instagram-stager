export type Highlight = {
  id: string
  label: string
  photoId: string | null
}

export type Profile = {
  displayName: string
  username: string
  bio: string
  website: string
  posts: string
  followers: string
  following: string
  avatarId: string | null
  highlights: Highlight[]
  grid: (string | null)[]
}

export const COLS = 3
export const MIN_CELLS = 9

export const defaultProfile = (): Profile => ({
  displayName: 'Alexander Arnold',
  username: 'thealexanderx',
  bio: 'Stage your grid before you post.\nDrop photos into the squares below.',
  website: '',
  posts: '0',
  followers: '128',
  following: '214',
  avatarId: null,
  highlights: [
    { id: 'h1', label: 'Travel', photoId: null },
    { id: 'h2', label: 'Food', photoId: null },
    { id: 'h3', label: 'Work', photoId: null },
    { id: 'h4', label: 'New', photoId: null },
  ],
  grid: Array.from({ length: MIN_CELLS }, () => null),
})
