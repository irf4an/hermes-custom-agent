#!/usr/bin/env bash
# setup-clone.sh — first-time setup after cloning this repo on another agent.
# Idempotent: safe to re-run. Creates STRUCTURE only, never personal data.
# Usage:  bash scripts/setup-clone.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
VAULT_DIR="${OBSIDIAN_VAULT_PATH:-$HOME/notes}"
WORKSPACE_DIR="${AGENT_WORKSPACE_DIR:-$HOME/workspace}"
REVENUE_OPS_DIR="${REVENUE_OPS_DIR:-$HOME/revenue-ops}"

echo "==> repo: $REPO_DIR"
echo "==> HERMES_HOME=$HERMES_HOME"
echo "==> VAULT_DIR=$VAULT_DIR"
echo "==> WORKSPACE_DIR=$WORKSPACE_DIR"

# 1. Directories (empty structure, no contents copied)
mkdir -p "$HERMES_HOME/skills" "$HERMES_HOME/profiles" \
         "$VAULT_DIR" "$WORKSPACE_DIR" "$REVENUE_OPS_DIR"

# 2. Empty kanban DB schema (tasks table only, zero rows from anyone)
export KANBAN_DB="${KANBAN_DB:-$HERMES_HOME/kanban.db}"
python3 -c "import sys; sys.path.insert(0, '$REPO_DIR'); import kanban_helper; kanban_helper.init_db()"
echo "==> kanban schema ready: $KANBAN_DB (0 rows copied)"

# 3. channels_config.json skeleton — never overwrite an existing one
CFG="$REPO_DIR/channels_config.json"
if [ -f "$CFG" ]; then
  echo "==> channels_config.json exists, left untouched"
else
  cat > "$CFG" <<'EOF'
{
  "enabled": false,
  "botToken": "",
  "chatId": "",
  "topics": [],
  "autoNotify": false,
  "history": []
}
EOF
  echo "==> channels_config.json skeleton created (disabled, empty)"
fi

# 4. .env reminder
if [ ! -f "$REPO_DIR/.env" ]; then
  echo "==> no .env found — copy .env.example to .env and fill your own values"
else
  echo "==> .env present"
fi

# 5. Deps + syntax
command -v node >/dev/null && echo "==> node: $(node --version)" || echo "!! node NOT found (need 24+)"
node --check "$REPO_DIR/server.js" && echo "==> server.js syntax OK"

cat <<'EOF'

Done. The dashboard now reflects YOUR machine (your profiles, your
kanban.db, your vault, your workspace) — nothing was copied from the
template author's personal data.

Still manual (your agent does these, see README "Clone setup" section):
  1. cp .env.example .env  -> fill TELEGRAM_CHAT_ID, OBSIDIAN_GIT_REMOTE, OPERATOR_NAME
  2. npm install && node server.js (or pm2)
  3. Recreate your own Hermes profiles, skills, cron jobs, vault notes.
  4. Never copy: *_TOKEN*, *_API_KEY*, auth.json, *.db contents,
     chat IDs, vault notes, channels_config.json from someone else.
EOF
