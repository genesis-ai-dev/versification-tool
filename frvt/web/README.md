# FRVT Web

React + TypeScript + Vite app for the versification viewer. The client in `src/api/` calls the API on the same origin. FastAPI serves the production build from `dist/` at `/`, with an SPA fallback for client routes.

Routes:

- `/` — side-by-side viewer, mapping overlay, and the Divergence dialog
- `/manage/translations` — translation list and project ingest
- `/manage/versifications` — scheme list and upload
- `/manage` — redirects to `/manage/translations`

`npm run dev` starts Vite by itself. It does not proxy `/api`, so the UI that talks to Postgres is the one FastAPI serves after `npm run build`. Setup for that process is in the repository README.

```bash
npm ci
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
```

`npm test` runs Vitest on `src/**/*.{test,spec}.{ts,tsx}`. Playwright (`npm run test:e2e`, or `npm run test:e2e:smoke` for the smoke project) expects the API and built UI at `http://localhost:8000`. Override that with `FRVT_E2E_BASE_URL`. Install the browser once: `npx playwright install chromium`.
