# EduBoard Frontend

The frontend is the kiosk display layer for EduBoard. It consumes the backend's `/api/data`, `/api/timetable`, `/api/events`, and `/health` endpoints and renders a signage-first experience for hallways, classrooms, and shared displays.

## What Changed On This Branch

- `App.jsx` was reshaped into a more deliberate display experience with a stronger header, status pills, richer timetable cards, and cleaner event presentation.
- `useEduBoardData` now owns fetch/retry/stale-state behavior instead of burying everything inside a single component.
- Vite now proxies `/api` and `/health` to the backend in development.
- A small Vitest + Testing Library setup now covers the main render path.

## Scripts

- `npm run dev` starts the Vite dev server.
- `npm run build` creates the production bundle consumed by FastAPI/Openbox.
- `npm run lint` runs ESLint.
- `npm test` runs the frontend test suite once.
- `npm run test:watch` starts Vitest in watch mode.

## Local Development

```bash
cd frontend
npm install
npm run dev
```

With the backend running on port `8000`, Vite will proxy:

- `/api/*`
- `/health`

## Testing

```bash
cd frontend
npm test
npm run lint
npm run build
```

## UX Direction

The current UI is intentionally optimized for digital signage:

- a high-contrast, low-glare shell for TVs and kiosks
- strong hierarchy for "what matters now"
- resilient empty/error states instead of blank or broken views
- layouts that remain legible across wide displays and smaller admin previews
