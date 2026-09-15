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

## Status

Personal project. Interfaces and APIs may change while Hermes Agent evolves.
