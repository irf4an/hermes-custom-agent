# Architecture — Hermes Custom Agent Dashboard

## Layout

- `server.js` — Express backend. Serves `public/` static + JSON APIs under `/api/*`.
  Reads live machine state via env (`HERMES_HOME`, `OBSIDIAN_VAULT_PATH`,
  `AGENT_WORKSPACE_DIR`, `TELEGRAM_CHAT_ID`, `PORT`). No hardcoded identity.
- `public/index.html` — markup only (2849 lines). No inline `<style>`, one inline
  tailwind-config `<script>`, view scripts loaded as classic scripts in order.
- `public/css/app.css` — extracted stylesheet (712 lines, ~16.6 KB).
- `public/js/` — frontend, classic scripts sharing one global lexical scope.
  Load order in `index.html` **must** stay as below (it mirrors the original
  single-file order; `api.js` moved first, it has no dependencies):

| # | File | Lines | Contents |
|---|------|-------|----------|
| 1 | `api.js` | ~18 | `api()` (throws caller message on !ok, returns JSON), `apiFull()` (returns `{ok,status,data}`, `{}` on non-JSON) |
| 2 | `core.js` | ~27 | shared placeholders + utils (`agentsData`, `driveRootFolder`, `shortHermes`, `agentFolder`, `capAgentId`, `profileNameFor`, `hashPick`, meta/badge maps) |
| 3 | `views-team.js` | ~1187 | agents list, team view, agent edit modal, services, abilities |
| 4 | `views-schedule-kanban.js` | ~1208 | cron engine, kanban board, schedule list/month/week/day |
| 5 | `views-docs-drive.js` | ~352 | workspace drive overview/folders/files |
| 6 | `views-chat.js` | ~657 | chat logs & transcripts |
| 7 | `views-catalog.js` | ~1115 | models overview/assign, channels overview/configure/telegram, skills CRUD/restore |
| 8 | `app.js` | ~355 | navigation switcher, `fetchLiveMetrics`, `fetchSchedules`, shared metrics |
| 9 | `views-office.js` | ~650 | office agent chat module |
| 10 | `views-graph-vault.js` | ~806 | obsidian/memory graph, vault notes modal, **init tail** (`renderAgents`, `fetchSchedules` + intervals, `fetchLiveMetrics`) |

Concatenating files 1–10 in order reproduces the pre-split `app.js` byte length
(295120); only `api.js` moved earlier. Zero duplicate top-level declarations.

## Frontend API contract

- Readers with no status branching → `api(path, opts, errorMessage)`.
- Writers / status-branching callers (`ok && data.success`, 202-vs-409, error-body
  alerts) → `apiFull(path, opts)`. All 49 `/api/*` call sites covered; zero raw
  `fetch()` outside the two helpers. Alert/success wording preserved per call site.

## Backend contracts (spot-verified)

- `GET /api/profiles`, `/api/graph` (28 nodes baseline), `/api/channels/overview`,
  `/api/skills` (60), `/api/office/agents`, `/api/models/overview` → 200.
- All 49 frontend paths resolve to a route in `server.js` (checked programmatically).

## Verification procedure

1. `node --check` every file in `public/js/` + `server.js`.
2. Combined-length + duplicate-declaration + onclick-coverage check (see commit
   messages for the one-liners).
3. Serve on a spare port (`PORT=41xx node server.js`): `/` + all js/css → 200,
   served md5 == disk md5; key `/api/*` → 200.
4. Never kill production (`mission-control` on 3000, PM2). Kill test servers by
   exact PID found via `ss -ltnp`, never `pkill -f` with a self-matching pattern.

## Known issues

- `Open worker management` button calls `openWorkers()` which is not defined
  (pre-existing dead button, present before the refactor). Left untouched.
- Inline `onclick="if(event.target.id===...)"` on modal backdrops is intentional
  and excluded from handler-coverage checks.
