# Self-Healing SOP Recorder (Chrome extension)

MVP browser extension: record clicks/inputs on a page → submit raw steps to the
backend `/generate` endpoint → get a clean guide. Text-only capture (no
screenshots); typed field values are never recorded.

## Develop & test

```bash
npm install
npm test        # Vitest unit tests (no build needed)
npm run build   # produces dist/ for loading in Chrome
```

## Load in Chrome (manual verification)

1. Start the backend on `http://localhost:8077` (see backend/ — run uvicorn against Postgres).
2. `npm run build`, then open `chrome://extensions`, enable Developer mode,
   "Load unpacked", and select `extension/dist`.
3. Click the extension icon, log in with a backend account, pick a project.
4. Click "Начать запись", perform a few clicks on any page, then
   "Остановить и собрать гайд". The status line shows the created guide id.

The backend base URL is `http://localhost:8077` (hardcoded in `src/background.ts`
and `src/popup.ts` for the MVP; make it configurable in a later iteration).
