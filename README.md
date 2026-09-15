# Hermes Custom Agent

Custom operations dashboard for Hermes Agent.

## Features

- Hermes profile and session monitoring
- Agent, model, channel, skill, and toolset management
- Live Kanban task board
- Cron calendar and job controls
- Obsidian vault explorer and knowledge graph
- Session and memory visibility
- Multi-profile operations view

## Requirements

- Node.js 24+
- Hermes Agent
- Optional: Obsidian vault and Hermes profiles

## Run

```bash
npm install
node server.js
```

Open `http://localhost:3000`.

## Configuration

The dashboard reads Hermes from `$HERMES_HOME` or `~/.hermes` and the vault from
`$OBSIDIAN_VAULT_PATH` or `~/notes`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HERMES_HOME` | `~/.hermes` | Profiles, skills, kanban DB |
| `OBSIDIAN_VAULT_PATH` | `~/notes` | Vault explorer / graph root |
| `OBSIDIAN_GIT_REMOTE` | — | Shown on the Obsidian service card |
| `AGENT_WORKSPACE_DIR` | `~/workspace` | Workspace drive storage |
| `REVENUE_OPS_DIR` | `~/revenue-ops` | Pipeline master copies |
| `TELEGRAM_CHAT_ID` | — | Fallback target chat for the Telegram card |
| `OPERATOR_NAME` | `Operator` | Label on the memory view |
| `PORT` | `3000` | HTTP port |

```bash
HERMES_HOME="$HOME/.hermes" \
OBSIDIAN_VAULT_PATH="$HOME/notes" \
PORT=3000 \
node server.js
```

Do not commit credentials, runtime databases, local configuration, or generated
state. See `.gitignore`.

## Clone setup (using this template on another agent)

Cloning gives you code + views, not data. The dashboard always reads live
from your own machine (see Configuration above), so after clone it shows
your profiles, your kanban, your vault — never the author's.

Agent instructions after `git clone`:

```bash
bash scripts/setup-clone.sh   # creates dirs, empty kanban schema, config skeleton
cp .env.example .env          # then fill your own values
npm install
node server.js
```

What the script does: creates `$HERMES_HOME/skills|profiles`, vault,
workspace dirs (empty); initializes an empty kanban `tasks` table;
writes a disabled `channels_config.json` skeleton only if missing;
checks `node` + `server.js` syntax. It copies zero personal data.

What your agent still sets up manually:

1. `.env` — your own `TELEGRAM_CHAT_ID`, `OBSIDIAN_GIT_REMOTE`,
   `OPERATOR_NAME`. Leave empty what you don't have.
2. Hermes profiles, skills, cron jobs, vault notes — recreate your own.
   Rule patterns worth copying (structure, not content): per-profile
   layout (`config.yaml`, `SOUL.md`, `cron/`, `skills/`, `memories/`,
   `workspace/`), per-agent workspace subfolders, `channels_config.json`
   key shape (`enabled, botToken, chatId, topics, autoNotify, history`).
3. Never copy from someone else: tokens/keys (`*_TOKEN*`, `*_API_KEY*`),
   `auth.json`, `*.db` contents, chat IDs, vault notes, or a filled
   `channels_config.json`.

## Status

Personal project. Interfaces and APIs may change while Hermes Agent evolves.
