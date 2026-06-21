# Self-Healing SOP — Web App

React + Vite SPA: log in, browse guides, view/edit (edits create new versions),
share by public link, and triage stale guides on the "Что устарело" dashboard.

## Develop & test

```bash
npm install
npm test        # Vitest + Testing Library (headless, no browser)
npm run dev     # local dev server (expects the backend at http://localhost:8077)
npm run build   # production build to dist/
```

Set `VITE_API_BASE_URL` to point at a non-default backend.

## Routes

- `/login` — sign in (public)
- `/share/:token` — public shared guide (no auth)
- `/` — library (projects + guides)
- `/guides/:id` — guide view (steps, versions, create share link)
- `/guides/:id/edit` — editor (saves a new version)
- `/drift` — "Что устарело" drift dashboard (accept/dismiss)
