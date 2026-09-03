# Instagram profile stager

A local web app that looks like an Instagram profile page so you can stage your grid before posting. There is no Instagram API and no backend. Photos and profile data live in this browser only.

## Run

```
npm install && npm run dev
```

Open the URL Vite prints (usually http://localhost:5173).

## How staging works

- Phone-width canvas (~390px) on desktop; full width on small screens.
- Edit profile to change name, username, bio, website, and counts.
- Click the avatar to set a profile photo.
- Drop jpg/png/webp onto grid cells; drag filled cells to swap; X removes a photo.
- Refresh keeps photos in IndexedDB and layout in localStorage.

## Stack

Vite, React, TypeScript, dnd-kit.
