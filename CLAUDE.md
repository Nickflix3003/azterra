# Azterra — Claude Code Context

This is the **Azterra DND World Website** — a React + Express web app used by a friend group to explore and contribute to a homebrew D&D world. It is actively being developed by college students.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Vite 7, Leaflet (interactive map), Tailwind CSS |
| Backend | Express 5, Node.js, JSON file persistence (`server/data/*.json`) |
| Auth | Supabase (Google OAuth + magic link email), JWT session cookies |
| Hosting | GitHub Pages (static frontend at `/p15/`), backend runs locally |

## Running Locally

```bash
# Terminal 1 — backend (port 3000)
node server/server.js

# Terminal 2 — frontend dev server (port 5173)
npm run dev
```

The Vite proxy forwards `/api/*` → `http://localhost:3000`. The `.env` and `.env.local` files are already configured with Supabase keys.

## Project Structure

```
src/
  components/
    map/          ← InteractiveMap.jsx (main map, ~2000 lines), editor panels
    pages/        ← All page views (MapPage, CharactersPage, AdminDashboard, etc.)
    auth/         ← Login/signup modals
    UI/           ← Header, PageLayout, SidePanel
  context/
    AuthContext.jsx     ← Auth state, user role, Supabase session
    ContentContext.jsx  ← World content (locations, regions, etc.)
  data/                 ← Static JSON data (locations, characters, etc.)
  utils/
    permissions.js      ← canView() role-based visibility logic

server/
  server.js             ← Express app entry point
  auth.js               ← Supabase OAuth + magic link + session
  routes/index.js       ← Registers all API route handlers
  data/                 ← JSON files used as the database
  middleware/
    supabaseAuth.js     ← requireAuth middleware (checks session cookie)
```

## Auth & Roles

Roles: `guest` → `pending` → `editor` → `admin`

- **guest**: can view public content
- **pending**: logged in but not approved yet
- **editor**: can add/edit markers and lore on the map
- **admin**: full access, can approve users, manage everything

Auth flow: Supabase OAuth (Google) or magic link email → backend `/api/auth/callback` → session cookie → `/api/auth/me` to hydrate frontend user state.

`FORCE_ADMIN` has been **removed**. Real auth is now enforced.

## Map System

The interactive map (`InteractiveMap.jsx`) is a Leaflet-based world map with:
- Custom tile layers for the world image
- Region polygons (drawn/edited)
- Location markers with custom icons (MarkerPalette)
- Editor mode (admins/editors only) with drawing tools
- Fog of war, cloud layers, parallax, heatmap, vignette effects
- Label layer for named regions

## Content Import (Obsidian Integration)

`content-importer.config.json` configures import from an `AZTERRA` folder (the Obsidian vault). To wire it up:

1. Set `OBSIDIAN_VAULT_PATH` in `.env` to the absolute path of the vault (e.g. `G:\My Drive\DND\DND`)
2. Run `node server/importContent.js` to import markdown → JSON
3. The importer excludes: `.obsidian/`, `Stories/`, `SECRETS - NO LOOKINGGGG/`

## Key Files to Know About

- `src/context/AuthContext.jsx` — all auth state lives here
- `src/utils/permissions.js` — role-based `canView()` logic
- `src/components/map/InteractiveMap.jsx` — the main map (large, consider refactoring)
- `server/auth.js` — Supabase OAuth callback, session creation
- `server/data/locations.json` — all map location data
- `server/data/regions.json` — all region polygon data
- `server/middleware/supabaseAuth.js` — `requireAuth` Express middleware

## Known Issues / TODO

- [ ] `InteractiveMap.jsx` is ~2000 lines — should be split into sub-components
- [ ] Content importer (`server/contentImporter.js`) has placeholder methods not fully implemented
- [ ] No toast/error messages in the frontend — API failures are silent
- [ ] Editor tools (MarkerPalette, EditorInfoPanel, EditorSidePanel) need UX polish
- [ ] "World Settings" tab in EditorSidePanel is a "Coming Soon" placeholder
- [ ] The backend uses JSON files, not a real database — fine for now but may need migration

## Current Branch

`claude/editor-cleanup` — branched from `ai-Nick`

## Environment Variables

Both `.env` (backend) and `.env.local` (frontend) are already set up with the Supabase project keys. Do NOT commit these files — they are in `.gitignore`.

The Supabase project is `azterra-world` at `https://uubjgelbjdqyevcaaoov.supabase.co`.

## Coding Guidelines

- This is a scrappy college project — pragmatic improvements over perfect architecture
- When refactoring large files, keep the same external API (props, exports) so nothing breaks
- The map is the centerpiece — changes there need careful testing
- JSON file persistence is intentional for simplicity — don't add a database unless asked
- Use Tailwind for styling, not inline styles or new CSS files where possible
