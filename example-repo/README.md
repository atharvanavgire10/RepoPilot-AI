# TaskPilot Example

Small fixture app analyzed by RepoPilot AI's "Try Example Repository" flow.

- `backend/server.js` — Express routes (`GET /api/tasks`, `POST /api/tasks`), JWT auth, permissive CORS (intentional), raw error exposure (intentional)
- `backend/taskService.js` — Postgres queries via `pg`
- `frontend/src/TaskList.tsx` + `frontend/src/api.ts` — React frontend calling the API
- `.env.example` intentionally missing on purpose? No — included below to show the contrast; remove to demo the missing-env finding.

## Env

```
DATABASE_URL=postgres://localhost:5432/taskpilot
JWT_SECRET=change-me
PORT=4000
```
