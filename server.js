const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const yaml = require('js-yaml');
const { execSync, execFileSync, spawn } = require('child_process');
const http = require('http');
const telegramNotifier = require('./telegram_notifier');
const graphBuilder = require('./graph_builder');

const app = express();
const PORT = process.env.PORT || 3000;
const HERMES_HOME = process.env.HERMES_HOME || path.join(process.env.HOME || '/root', '.hermes');
const PROFILES_DIR = path.join(HERMES_HOME, 'profiles');
const VAULT_DIR = process.env.OBSIDIAN_VAULT_PATH || path.join(process.env.HOME || '/root', 'notes');
const KANBAN_DB = path.join(HERMES_HOME, 'kanban.db');
const SKILLS_DIR = path.join(HERMES_HOME, 'skills');
const KANBAN_HELPER = path.join(__dirname, 'kanban_helper.py');
const WORKSPACE_DIR = process.env.AGENT_WORKSPACE_DIR || path.join(process.env.HOME || '/root', 'workspace');
const REVENUE_OPS_DIR = process.env.REVENUE_OPS_DIR || path.join(process.env.HOME || '/root', 'revenue-ops');
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '';
const OBSIDIAN_GIT_REMOTE = process.env.OBSIDIAN_GIT_REMOTE || '';

app.use(cors());
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: 0 }));

// Helper: safe read file
function safeReadFile(filePath, fallback = '') {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return fallback;
}

// Helper: safe read YAML
function safeReadYaml(filePath, fallback = {}) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return yaml.load(content) || fallback;
    }
  } catch (err) {
    console.error(`Error reading yaml ${filePath}:`, err.message);
  }
  return fallback;
}

// Helper: set a profile's primary model without dropping the provider route.
// A bare string `model:` loses `provider`, so Hermes resolves provider=auto and
// every turn fails auth, silently falling back to fallback_providers.
function setProfileModel(config, model) {
  const modelId = String(model).trim();
  if (!modelId) return;
  const prev = (config.model && typeof config.model === 'object') ? config.model : {};
  const next = { default: modelId };
  next.provider = prev.provider || '9router';
  if (prev.base_url) next.base_url = prev.base_url;
  if (prev.api_mode) next.api_mode = prev.api_mode;
  if (prev.context_length) next.context_length = prev.context_length;
  config.model = next;
}

// Helper: safe write YAML
function safeWriteYaml(filePath, data) {
  try {
    const dumped = yaml.dump(data, { indent: 2 });
    fs.writeFileSync(filePath, dumped, 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing yaml ${filePath}:`, err.message);
    return false;
  }
}

// Helper: parse frontmatter from markdown
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return { metadata: {}, body: content };
  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) return { metadata: {}, body: content };
  const rawYaml = content.substring(3, endIdx).trim();
  const body = content.substring(endIdx + 4).trim();
  try {
    const metadata = yaml.load(rawYaml) || {};
    return { metadata, body };
  } catch (e) {
    return { metadata: {}, body };
  }
}

// Helper: get profile directory
function getProfileDir(name) {
  if (!name || name === 'default') {
    return HERMES_HOME;
  }
  return path.join(PROFILES_DIR, name);
}

// Helper: get profile info
function getProfileDetails(name) {
  const pDir = getProfileDir(name);
  const isDefault = (name === 'default');
  const soulPath = path.join(pDir, 'SOUL.md');
  const configPath = path.join(pDir, 'config.yaml');
  const envPath = path.join(pDir, '.env');
  
  const persona = safeReadFile(soulPath, '');
  const config = safeReadYaml(configPath, {});
  
  // Extract model & provider — prefer model.default over top-level model
  let model = (config.model && typeof config.model === 'object') ? config.model.default : config.model || (config.agent && config.agent.model) || 'ag/gemini-3.7-flash-high';
  let provider = 'custom';
  if (config.model && typeof config.model === 'object' && config.model.provider) {
    provider = config.model.provider;
  }
  
  let description = config.description || (isDefault ? 'Primary System & DevOps Assistant' : `${name.charAt(0).toUpperCase() + name.slice(1)} AI Agent`);
  let temperature = (config.agent && config.agent.temperature !== undefined) ? config.agent.temperature : 0.7;
  let active = config.active !== undefined ? config.active : true;
  const fallbackEntry = Array.isArray(config.fallback_providers) ? config.fallback_providers[0] : config.fallback_model;
  let fallbackModel = (fallbackEntry && typeof fallbackEntry === 'object' ? fallbackEntry.model : fallbackEntry) || (config.fallback && config.fallback.model) || '';

  // Telegram topic ID
  const channelsConfig = telegramNotifier.loadConfig();
  const telegramTopicId = (channelsConfig.topics && channelsConfig.topics.agent_bindings && channelsConfig.topics.agent_bindings[name]) || (config.telegram && config.telegram.topic_id) || '';

  // Read bot token from profile .env
  let botToken = '';
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
    if (match) botToken = match[1].trim();
  }

  // Gateway status (instant 10ms systemd check)
  let gatewayStatus = 'stopped';
  try {
    const serviceName = isDefault ? 'hermes-gateway.service' : `hermes-gateway-${name}.service`;
    const statusRaw = require('child_process').execSync(`systemctl --user is-active ${serviceName} 2>/dev/null || true`, { timeout: 1500, encoding: 'utf-8' }).trim();
    if (statusRaw === 'active') {
      gatewayStatus = 'running';
    }
  } catch (e) {}

  // Skills count
  let skillsCount = 0;
  const skillsDir = path.join(pDir, 'skills');
  if (fs.existsSync(skillsDir)) {
    try {
      skillsCount = fs.readdirSync(skillsDir).length;
    } catch (e) {}
  }

  // Stats & Dates
  let createdAtFormatted = 'Jun 3, 2026';
  try {
    const stat = fs.statSync(pDir);
    const d = new Date(stat.birthtime || stat.ctime || Date.now());
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    createdAtFormatted = `Created ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } catch (e) {}

  return {
    id: name,
    name: name === 'default' ? 'Default' : name.charAt(0).toUpperCase() + name.slice(1),
    isDefault,
    description,
    persona,
    model,
    provider,
    fallbackModel,
    temperature,
    telegramTopicId,
    telegramBotId: botToken ? botToken.split(':')[0] : '',
    botToken: botToken ? botToken.substring(0, 12) + '...' : '',
    gatewayStatus,
    active,
    skillsCount,
    toolsetsCount: 20,
    hasEnv: fs.existsSync(envPath),
    createdAtFormatted,
    status: gatewayStatus === 'running' ? 'ONLINE' : (active ? 'IDLE' : 'OFFLINE'),
    path: pDir
  };
}

// ================= AGENT PROFILES APIS =================

app.get('/api/profiles', (req, res) => {
  try {
    const profiles = [];
    profiles.push(getProfileDetails('default'));

    if (fs.existsSync(PROFILES_DIR)) {
      const dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'default') {
          profiles.push(getProfileDetails(d.name));
        }
      }
    }

    res.json({ success: true, profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/profiles/:name', (req, res) => {
  try {
    const { name } = req.params;
    const pDir = getProfileDir(name);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }
    const details = getProfileDetails(name);
    res.json({ success: true, profile: details });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/generate-persona', (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Agent name is required' });
    }

    const agentName = name.charAt(0).toUpperCase() + name.slice(1);
    const roleDesc = description || `${agentName} AI Agent`;

    let generatedPersona = `You are ${agentName}, a dedicated and autonomous AI Agent specializing as: ${roleDesc}.

## Core Responsibilities & Capabilities
- Execute tasks with high domain precision, structured thinking, and verified results.
- Analyze requirements autonomously, break down complex goals, and coordinate solutions.
- Maintain high standards of data accuracy, reproducibility, and actionable output.

## Behavioral Guidelines
- Be direct, concise, and outcome-oriented. Match the length of the reply to the weight of the ask.
- No conversational filler ("Certainly!", "I'd be happy to help", "Great question").
- Proactively identify edge cases, verify code/data before finalizing, and report status clearly.
- When facing ambiguities, propose the most reasonable recommendation first.

## Tone & Style
- Professional, analytical, confident, and reliable.
- Structure complex information with clear markdown headings and bullet points.`;

    const lowerRole = (roleDesc + ' ' + name).toLowerCase();
    if (lowerRole.includes('personal') || lowerRole.includes('assistant') || lowerRole.includes('admin')) {
      generatedPersona = `You are ${agentName}, a high-performance Personal Executive Assistant for your user.

## Core Responsibilities
- Task & Schedule Management: Organize daily agendas, meetings, deadlines, and proactive reminders.
- Information Retrieval & Briefs: Synthesize research, news, documents, and technical reports into executive summaries.
- Follow-ups & Action Items: Track pending commitments, draft structured replies, and manage workflows.

## Operating Principles
- Proactive & Anticipatory: Suggest next logical steps and flag critical deadlines early.
- Direct & Action-Focused: Never use conversational fluff or restate requests.
- Concise: Deliver crisp, high-signal answers formatted cleanly in Markdown.`;
    } else if (lowerRole.includes('finance') || lowerRole.includes('keuangan') || lowerRole.includes('valuation')) {
      generatedPersona = `You are ${agentName}, a world-class Financial Analyst & Strategic Valuation AI Agent.

## Core Expertise
- Financial Modeling & Unit Economics (LTV, CAC, Runway, Burn Rate, Margins).
- Company & Asset Valuation (DCF, Multiples, Comparables).
- Financial Statement & Balance Sheet Analysis.
- Investment Risk Evaluation & Scenario Forecasting.

## Guidelines
- Always provide exact mathematical computations alongside strategic context.
- Be data-driven, objective, and conservative in forecasting.
- Deliver results structured in clear financial breakdown summaries.`;
    } else if (lowerRole.includes('engineer') || lowerRole.includes('code') || lowerRole.includes('dev') || lowerRole.includes('architect')) {
      generatedPersona = `You are ${agentName}, a Principal Software Architect & Autonomous Engineering AI Agent.

## Core Expertise
- Fullstack architecture, clean code standards, and high-performance system design.
- Rigorous automated debugging, root-cause analysis, and regression prevention.
- Linux environments, Docker containerization, Git workflows, and CI/CD pipelines.

## Engineering Standards
- Write clean, production-ready, well-documented code with comprehensive test cases.
- Verify before claiming success. Always test code execution and report verifiable diffs.
- Keep responses free of fluff — provide direct code solutions and clear explanations.`;
    } else if (lowerRole.includes('sales') || lowerRole.includes('kol') || lowerRole.includes('marketing') || lowerRole.includes('copy')) {
      generatedPersona = `You are ${agentName}, a top-tier Sales Development, KOL Marketing & Copywriting AI Agent.

## Core Expertise
- High-converting copywriting (Direct response, landing pages, cold outreach, ad hooks).
- KOL / Influencer discovery, outreach strategy, and partnership negotiation.
- Lead qualification, objection handling, and pitch deck refinement.

## Tone & Strategy
- Persuasive, empathetic, sharply focused on user psychology and conversion.
- Write punchy, human-sounding copy without AI clichés or generic buzzwords.
- Optimize every message for clarity, engagement, and measurable action.`;
    }

    res.json({ success: true, persona: generatedPersona });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/profiles', (req, res) => {
  try {
    let { name, description, persona, model, provider, temperature, active, telegramTopicId } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Agent name is required' });
    }
    name = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const pDir = path.join(PROFILES_DIR, name);

    if (fs.existsSync(pDir)) {
      return res.status(400).json({ success: false, error: 'Agent profile with this name already exists' });
    }

    try {
      execSync(`hermes profile create ${name}`, { stdio: 'pipe' });
    } catch (e) {
      fs.mkdirSync(pDir, { recursive: true });
    }

    if (persona !== undefined) {
      fs.writeFileSync(path.join(pDir, 'SOUL.md'), persona, 'utf8');
    }

    const configPath = path.join(pDir, 'config.yaml');
    const config = safeReadYaml(configPath, {});
    if (description) config.description = description;
    if (model) setProfileModel(config, model);
    if (active !== undefined) config.active = active;
    if (temperature !== undefined) {
      if (!config.agent) config.agent = {};
      config.agent.temperature = parseFloat(temperature);
    }
    if (telegramTopicId !== undefined) {
      const cConfig = telegramNotifier.loadConfig();
      if (!cConfig.topics) cConfig.topics = {};
      if (!cConfig.topics.agent_bindings) cConfig.topics.agent_bindings = {};
      cConfig.topics.agent_bindings[name] = telegramTopicId;
      telegramNotifier.saveConfig(cConfig);
    }
    safeWriteYaml(configPath, config);

    res.json({ success: true, profile: getProfileDetails(name) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function syncActiveSessionsModel(profileName, newModel) {
  try {
    const pDir = getProfileDir(profileName);
    const stateDbPath = path.join(pDir, 'state.db');
    const sessionsJsonPath = path.join(pDir, 'sessions', 'sessions.json');

    // 1. Update state.db if present
    if (fs.existsSync(stateDbPath)) {
      const pythonScript = `
import sqlite3, json, sys

db_path, new_model = sys.argv[1], sys.argv[2]
conn = sqlite3.connect(db_path)
cur = conn.cursor()

try:
    cur.execute("SELECT scope, session_key, entry_json FROM gateway_routing")
    rows = cur.fetchall()
    for scope, session_key, entry_json in rows:
        try:
            entry = json.loads(entry_json)
            if 'model_override' in entry and entry['model_override']:
                entry['model_override']['model'] = new_model
            else:
                entry['model_override'] = {
                    'model': new_model,
                    'provider': 'custom:9router',
                    'base_url': 'http://47.84.189.232:20128/v1'
                }
            cur.execute("UPDATE gateway_routing SET entry_json = ? WHERE scope = ? AND session_key = ?", (json.dumps(entry), scope, session_key))
        except Exception:
            pass
except Exception:
    pass

try:
    cur.execute("UPDATE sessions SET model = ? WHERE ended_at IS NULL", (new_model,))
except Exception:
    pass

conn.commit()
conn.close()
`;
      execFileSync('python3', ['-c', pythonScript, stateDbPath, newModel], { timeout: 3000 });
    }

    // 2. Update sessions.json if present
    if (fs.existsSync(sessionsJsonPath)) {
      try {
        const raw = fs.readFileSync(sessionsJsonPath, 'utf8');
        const data = JSON.parse(raw);
        for (const [k, v] of Object.entries(data)) {
          if (v && typeof v === 'object' && 'model_override' in v) {
            if (v.model_override) {
              v.model_override.model = newModel;
            } else {
              v.model_override = {
                model: newModel,
                provider: 'custom:9router',
                base_url: 'http://47.84.189.232:20128/v1'
              };
            }
          }
        }
        fs.writeFileSync(sessionsJsonPath, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {}
    }
  } catch (err) {
    console.error('Failed to sync active sessions model:', err.message);
  }
}

app.put('/api/profiles/:name', (req, res) => {
  try {
    const { name } = req.params;
    const { description, persona, model, provider, fallbackModel, temperature, active, telegramTopicId } = req.body;
    const pDir = getProfileDir(name);

    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    if (persona !== undefined) {
      fs.writeFileSync(path.join(pDir, 'SOUL.md'), persona, 'utf8');
    }

    const configPath = path.join(pDir, 'config.yaml');
    const config = safeReadYaml(configPath, {});
    if (description !== undefined) config.description = description;
    if (model !== undefined) {
      setProfileModel(config, model);
      syncActiveSessionsModel(name, String(model).trim());
    }
    if (fallbackModel !== undefined) {
      const fallback = String(fallbackModel).trim();
      if (fallback) {
        config.fallback_providers = [{ provider: '9router', model: fallback }];
        delete config.fallback_model;
        delete config.fallback;
      } else {
        delete config.fallback_providers;
        delete config.fallback_model;
        delete config.fallback;
      }
    }
    if (active !== undefined) config.active = active;
    if (temperature !== undefined) {
      if (!config.agent) config.agent = {};
      config.agent.temperature = parseFloat(temperature);
    }
    if (telegramTopicId !== undefined) {
      const cConfig = telegramNotifier.loadConfig();
      if (!cConfig.topics) cConfig.topics = {};
      if (!cConfig.topics.agent_bindings) cConfig.topics.agent_bindings = {};
      cConfig.topics.agent_bindings[name] = telegramTopicId;
      telegramNotifier.saveConfig(cConfig);
    }
    safeWriteYaml(configPath, config);

    res.json({ success: true, profile: getProfileDetails(name) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/profiles/:name', (req, res) => {
  try {
    const { name } = req.params;
    if (name === 'default') {
      return res.status(400).json({ success: false, error: 'Cannot delete default profile' });
    }
    
    try {
      execSync(`hermes profile delete ${name} --yes`, { stdio: 'pipe' });
    } catch (e) {
      const pDir = path.join(PROFILES_DIR, name);
      if (fs.existsSync(pDir)) {
        fs.rmSync(pDir, { recursive: true, force: true });
      }
    }

    res.json({ success: true, message: `Profile ${name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= PROFILE SERVICES & KEYS APIS =================

app.get('/api/profiles/:name/services', (req, res) => {
  try {
    const { name } = req.params;
    const pDir = getProfileDir(name);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const envPath = path.join(pDir, '.env');
    let envVars = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const parts = trimmed.split('=');
          const key = parts[0].trim();
          const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
          envVars[key] = val;
        }
      });
    }

    const has9router = !!(envVars['HERMES_CUSTOM_47_84_189_232_20128_API_KEY'] || process.env.HERMES_CUSTOM_47_84_189_232_20128_API_KEY);
    const hasTelegram = !!(envVars['TELEGRAM_BOT_TOKEN'] || process.env.TELEGRAM_BOT_TOKEN);
    const hasObsidian = !!(envVars['OBSIDIAN_VAULT_PATH'] || fs.existsSync(VAULT_DIR));
    const hasOpenRouter = !!(envVars['OPENROUTER_API_KEY'] || process.env.OPENROUTER_API_KEY);
    const hasNvidia = !!(envVars['NVIDIA_API_KEY'] || envVars['NVIDIA_NIM_API_KEY']);
    const hasActual = !!(envVars['ACTUAL_SERVER_URL'] || envVars['ACTUAL_PASSWORD']);
    const hasOpenCode = !!(envVars['OPENCODE_API_KEY'] || envVars['OPENCODE_ZEN_API_KEY']);

    const services = [
      {
        id: '9router',
        name: '9router (Port 20128)',
        subtitle: 'Local LLM proxy · 20 Antigravity + 4 ExpLabs models',
        configured: has9router,
        keyName: 'HERMES_CUSTOM_47_84_189_232_20128_API_KEY',
        keyMasked: has9router ? 'sk-7b...configured' : null
      },
      {
        id: 'telegram',
        name: 'Telegram',
        subtitle: 'Bot token & channel messaging gateway',
        configured: hasTelegram,
        keyName: 'TELEGRAM_BOT_TOKEN',
        keyMasked: envVars['TELEGRAM_BOT_TOKEN'] ? `${envVars['TELEGRAM_BOT_TOKEN'].substring(0, 10)}...` : null
      },
      {
        id: 'obsidian',
        name: 'Obsidian Notes',
        subtitle: `Vault path ${VAULT_DIR}${OBSIDIAN_GIT_REMOTE ? ' · ' + OBSIDIAN_GIT_REMOTE : ''}`,
        configured: hasObsidian,
        keyName: 'OBSIDIAN_VAULT_PATH',
        keyMasked: VAULT_DIR
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        subtitle: 'Many models, one key',
        configured: hasOpenRouter,
        keyName: 'OPENROUTER_API_KEY',
        keyMasked: null
      },
      {
        id: 'nvidia',
        name: 'NVIDIA',
        subtitle: 'NIM-hosted models',
        configured: hasNvidia,
        keyName: 'NVIDIA_API_KEY',
        keyMasked: null
      },
      {
        id: 'actual',
        name: 'Actual',
        subtitle: 'Personal finance sync engine',
        configured: hasActual,
        keyName: 'ACTUAL_SERVER_URL',
        keyMasked: null
      },
      {
        id: 'opencode',
        name: 'OpenCode Free',
        subtitle: 'Zen/Go endpoint',
        configured: hasOpenCode,
        keyName: 'OPENCODE_ZEN_API_KEY',
        keyMasked: null
      }
    ];

    res.json({
      success: true,
      services,
      configuredCount: services.filter(s => s.configured).length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/profiles/:name/services', (req, res) => {
  try {
    const { name } = req.params;
    const { keyName, keyValue } = req.body;
    if (!keyName) return res.status(400).json({ success: false, error: 'keyName is required' });

    const pDir = getProfileDir(name);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const envPath = path.join(pDir, '.env');
    let lines = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split('\n') : [];
    let updated = false;

    lines = lines.map(line => {
      if (line.startsWith(`${keyName}=`)) {
        updated = true;
        return `${keyName}=${keyValue}`;
      }
      return line;
    });

    if (!updated) {
      lines.push(`${keyName}=${keyValue}`);
    }

    fs.writeFileSync(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf8');
    res.json({ success: true, message: `Key ${keyName} saved for ${name}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= PROFILE ABILITIES (SKILLS & TOOLSETS) APIS =================

const HERMES_CONFIGURABLE_TOOLSETS = [
  {
    id: "terminal",
    name: "Terminal & Processes",
    icon: "terminal",
    category: "System Execution",
    description: "Run shell commands, manage processes, monitor execution (terminal, process_manage)",
    tools: ["terminal", "process_manage"]
  },
  {
    id: "file",
    name: "File Operations",
    icon: "file-code",
    category: "System Execution",
    description: "Read, write, patch (with fuzzy match), search files & contents (read_file, write_file, patch, search_files)",
    tools: ["read_file", "write_file", "patch", "search_files"]
  },
  {
    id: "execute_code",
    name: "Code Execution (REPL)",
    icon: "play",
    category: "System Execution",
    description: "Run persistent sandboxed Python scripts and workflows (execute_code)",
    tools: ["execute_code"]
  },
  {
    id: "web",
    name: "Web Browsing & Extraction",
    icon: "globe",
    category: "Web & Research",
    description: "Real-time search queries and clean page markdown scraping (web_search, web_extract)",
    tools: ["web_search", "web_extract"]
  },
  {
    id: "browser",
    name: "Browser Automation",
    icon: "chrome",
    category: "Web & Research",
    description: "Full Chromium headless browser navigation, DOM interaction, clicks (browser_exec)",
    tools: ["browser_exec"]
  },
  {
    id: "vision",
    name: "Vision & Image Analysis",
    icon: "eye",
    category: "Web & Research",
    description: "Analyze images, OCR, diagrams, visual attachments (vision_analyze)",
    tools: ["vision_analyze"]
  },
  {
    id: "memory",
    name: "Long-term Memory",
    icon: "brain",
    category: "Intelligence & State",
    description: "Persistent cross-session memory and user profile notes (memory)",
    tools: ["memory"]
  },
  {
    id: "session_search",
    name: "Session Recall",
    icon: "history",
    category: "Intelligence & State",
    description: "Recall past conversations, topics, and decisions across sessions (session_search)",
    tools: ["session_search"]
  },
  {
    id: "todo",
    name: "Task Planning & Checklist",
    icon: "check-circle",
    category: "Intelligence & State",
    description: "Structured multi-step task list tracking and progress (todo_list)",
    tools: ["todo_list"]
  },
  {
    id: "delegation",
    name: "Subagent Delegation",
    icon: "users",
    category: "Multi-Agent & Workflow",
    description: "Spawn parallel subagent tasks with isolated context (delegate_task)",
    tools: ["delegate_task"]
  },
  {
    id: "cronjob",
    name: "Cronjob Scheduler",
    icon: "clock",
    category: "Multi-Agent & Workflow",
    description: "Manage scheduled recurring jobs and autonomous triggers (cronjob_manage)",
    tools: ["cronjob_manage"]
  },
  {
    id: "clarify",
    name: "Interactive Clarification",
    icon: "help-circle",
    category: "Multi-Agent & Workflow",
    description: "Prompt user with single/multi-choice questions mid-turn (clarify)",
    tools: ["clarify"]
  },
  {
    id: "skills",
    name: "Skill Toolset & Management",
    icon: "zap",
    category: "System Execution",
    description: "View, create, patch, and execute procedural SKILL.md files (skills_list, skill_view, skill_manage)",
    tools: ["skills_list", "skill_view", "skill_manage"]
  },
  {
    id: "computer_use",
    name: "Desktop GUI (CUA)",
    icon: "mouse-pointer",
    category: "System Execution",
    description: "Background desktop control via cua-driver (computer_use)",
    tools: ["computer_use"]
  },
  {
    id: "tts",
    name: "Text to Speech (Audio)",
    icon: "volume-2",
    category: "Media & Output",
    description: "Synthesize speech audio bubbles and voice memos (text_to_speech)",
    tools: ["text_to_speech"]
  },
  {
    id: "image_gen",
    name: "Image Generation",
    icon: "image",
    category: "Media & Output",
    description: "Generate images from text prompts (image_generate)",
    tools: ["image_generate"]
  }
];

app.get('/api/profiles/:name/abilities', (req, res) => {
  try {
    const { name } = req.params;
    const pDir = getProfileDir(name);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const configPath = path.join(pDir, 'config.yaml');
    const config = safeReadYaml(configPath, {});

    // 1. Toolsets
    const disabledToolsetsRaw = (config.agent && config.agent.disabled_toolsets) || [];
    const disabledToolsets = Array.isArray(disabledToolsetsRaw) ? disabledToolsetsRaw : [disabledToolsetsRaw].filter(Boolean);

    const toolsets = HERMES_CONFIGURABLE_TOOLSETS.map(ts => ({
      ...ts,
      enabled: !disabledToolsets.includes(ts.id)
    }));

    // 2. Skills
    const allSkills = scanSkills(SKILLS_DIR);
    const disabledSkillsRaw = (config.skills && config.skills.disabled) || [];
    const disabledSkills = Array.isArray(disabledSkillsRaw) ? disabledSkillsRaw : [disabledSkillsRaw].filter(Boolean);

    const skills = allSkills.map(sk => ({
      name: sk.name,
      category: sk.category,
      description: sk.description,
      isBuiltin: sk.isBuiltin,
      isEssential: sk.name === 'hermes-agent',
      enabled: sk.name === 'hermes-agent' ? true : !disabledSkills.includes(sk.name)
    }));

    const enabledSkillsCount = skills.filter(s => s.enabled).length;
    const enabledToolsetsCount = toolsets.filter(t => t.enabled).length;

    res.json({
      success: true,
      profile: name,
      stats: {
        totalSkills: skills.length,
        enabledSkills: enabledSkillsCount,
        disabledSkills: skills.length - enabledSkillsCount,
        totalToolsets: toolsets.length,
        enabledToolsets: enabledToolsetsCount,
        disabledToolsets: toolsets.length - enabledToolsetsCount
      },
      toolsets,
      skills,
      disabledSkills,
      disabledToolsets
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/profiles/:name/abilities', (req, res) => {
  try {
    const { name } = req.params;
    const pDir = getProfileDir(name);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const { disabledSkills = [], disabledToolsets = [] } = req.body;

    const configPath = path.join(pDir, 'config.yaml');
    const config = safeReadYaml(configPath, {});

    if (!config.agent) config.agent = {};

    // Filter out essential skills like 'hermes-agent' from disabled
    const filteredDisabledSkills = Array.from(new Set(disabledSkills)).filter(s => s !== 'hermes-agent').sort();
    const filteredDisabledToolsets = Array.from(new Set(disabledToolsets)).sort();

    if (filteredDisabledSkills.length > 0) {
      if (!config.skills) config.skills = {};
      config.skills.disabled = filteredDisabledSkills;
    } else if (config.skills) {
      delete config.skills.disabled;
      if (Object.keys(config.skills).length === 0) {
        delete config.skills;
      }
    }

    if (filteredDisabledToolsets.length > 0) {
      config.agent.disabled_toolsets = filteredDisabledToolsets;
    } else if (config.agent) {
      delete config.agent.disabled_toolsets;
    }

    safeWriteYaml(configPath, config);

    res.json({
      success: true,
      message: `Abilities updated for agent ${name}`,
      disabledSkills: filteredDisabledSkills,
      disabledToolsets: filteredDisabledToolsets
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= MODELS CATALOG & AUTO-DETECTION API =================

function getOmniRouteApiKey() {
  const envFile = path.join(HERMES_HOME, '.env');
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('HERMES_CUSTOM_47_84_189_232_20128_API_KEY=')) {
        return line.split('=')[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return process.env.HERMES_CUSTOM_47_84_189_232_20128_API_KEY || '';
}

async function fetchLiveOmniRouteModels() {
  const apiKey = getOmniRouteApiKey();
  if (!apiKey) return [];
  try {
    const response = await fetch('http://127.0.0.1:20128/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.data)) {
        return data.data.map(m => m.id);
      }
    }
  } catch (err) {
    console.error('Failed to query live OmniRoute:', err.message);
  }
  return [];
}

app.get('/api/models/available', async (req, res) => {
  try {
    const nineRouterModels = [
      'ag/gemini-3.8-flash-high',
      'ag/gemini-3.8-flash-medium',
      'ag/gemini-3.8-flash-low',
      'ag/gemini-3.8-flash',
      'ag/gemini-3.7-flash-high',
      'ag/gemini-3.7-flash-medium',
      'ag/gemini-3.7-flash-low',
      'ag/gemini-3.6-flash-high',
      'ag/gemini-3.6-flash-medium',
      'ag/gemini-3.6-flash-low',
      'ag/gemini-3.5-flash-high',
      'ag/gemini-3-flash-agent',
      'ag/gemini-3.5-flash-low',
      'ag/gemini-3.5-flash-extra-low',
      'ag/gemini-pro-agent',
      'ag/gemini-3.1-pro-low',
      'ag/claude-sonnet-4-6',
      'ag/claude-opus-4-6-thinking',
      'ag/gpt-oss-120b-medium',
      'ag/gemini-3-flash',
      'exp/deepseek-v4-flash',
      'exp/deepseek-v4.1-flash',
      'exp/gpt-5.6-luna',
      'exp/qwen3.8-27b'
    ];

    const openCodeFreeModels = [
      'opencode-free/deepseek-v4-flash-free',
      'opencode-free/muse-spark-1.3-contributor-free',
      'opencode-free/muse-spark-1.2-contributor-free',
      'opencode-free/nemotron-3-ultra-free',
      'opencode-free/nemotron-3.5-lightning-free',
      'opencode-free/mimo-v2.5-free',
      'opencode-free/glm-5.2',
      'opencode-free/kimi-k2.5',
      'opencode-free/qwen3.6-plus',
      'opencode-free/big-pickle',
      'opencode-free/hy3-free'
    ];

    const allModels = [...nineRouterModels, ...openCodeFreeModels];

    const categories = {
      '9router Antigravity (Claude, Gemini, GPT-OSS)': nineRouterModels.filter(m => m.startsWith('ag/')),
      '9router ExperientialLabs Promotional': nineRouterModels.filter(m => m.startsWith('exp/')),
      'OpenCode Free (Zen/Go Models)': openCodeFreeModels
    };

    res.json({
      success: true,
      total: allModels.length,
      nineRouterCount: nineRouterModels.length,
      openCodeCount: openCodeFreeModels.length,
      categories,
      nineRouterModels,
      openCodeFreeModels,
      rawList: allModels
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/models/recommend', (req, res) => {
  try {
    const { name, role, description, persona } = req.body;
    const combined = `${name || ''} ${role || ''} ${description || ''} ${persona || ''}`.toLowerCase();

    let primaryModel = 'ag/gemini-3.7-flash-high';
    let fallbackModel = 'ag/gemini-3.1-flash-lite';
    let reason = 'Antigravity Gemini: Balanced high-speed intelligence with 1M context window';

    if (/\b(engineer|coding|coder|architect|software|backend|frontend|devops|fullstack|debug)\b/.test(combined)) {
      primaryModel = 'ag/claude-sonnet-4-6';
      fallbackModel = 'ag/gemini-3.7-flash-high';
      reason = 'Antigravity Claude Sonnet 4.6 Thinking: Leading coding benchmark and architectural reasoning';
    } else if (/\b(sales|marketing|kol|outreach|copy|copywriting|writer|partnership|campaign)\b/.test(combined)) {
      primaryModel = 'ag/claude-opus-4-6-thinking';
      fallbackModel = 'ag/gemini-3.7-flash-high';
      reason = 'Antigravity Claude Opus 4.6 Thinking: Nuanced tone, persuasive copywriting, and high empathy';
    } else if (/\b(finance|financial|valuation|keuangan|analyst|metrics|runway|accounting)\b/.test(combined)) {
      primaryModel = 'ag/gemini-3.7-flash-high';
      fallbackModel = 'ag/gemini-3.1-pro-high';
      reason = 'Antigravity Gemini 3.7 Flash High: 1M token context window with exact mathematical computations';
    } else if (/\b(research|paper|academic|deep|investigate)\b/.test(combined)) {
      primaryModel = 'ag/gemini-3.1-pro-high';
      fallbackModel = 'ag/gemini-3.7-flash-high';
      reason = 'Antigravity Gemini 3.1 Pro High: Deep multi-step analytical reasoning and research synthesis';
    }

    res.json({
      success: true,
      primaryModel,
      fallbackModel,
      reason
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function formatModelDisplayName(id) {
  if (!id) return '';
  const clean = id.replace(/^(ag\/|exp\/|opencode-free\/)/, '');
  return clean
    .split('-')
    .map(word => {
      if (/^(gpt|oss|glm|kimi|hy3|mimo|pdf)$/i.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

app.get('/api/models/overview', (req, res) => {
  try {
    const configPath = path.join(HERMES_HOME, 'config.yaml');
    const hermesConfig = safeReadYaml(configPath, {});
    const customProviders = hermesConfig.custom_providers || [];

    const profiles = [];
    profiles.push(getProfileDetails('default'));
    if (fs.existsSync(PROFILES_DIR)) {
      const dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'default') {
          profiles.push(getProfileDetails(d.name));
        }
      }
    }

    const assignedMap = {};
    const agentAssignments = [];

    for (const p of profiles) {
      const agentId = p.id;
      const agentName = p.name || p.id;
      const primaryModel = p.model || '';
      const fallbackModel = p.fallbackModel || '';

      agentAssignments.push({
        agentId,
        agentName,
        primaryModel,
        fallbackModel,
        gatewayStatus: p.gatewayStatus,
        active: p.active,
        description: p.description
      });

      if (primaryModel) {
        if (!assignedMap[primaryModel]) assignedMap[primaryModel] = [];
        assignedMap[primaryModel].push({ agentId, agentName, role: 'primary' });
      }
      if (fallbackModel) {
        if (!assignedMap[fallbackModel]) assignedMap[fallbackModel] = [];
        assignedMap[fallbackModel].push({ agentId, agentName, role: 'fallback' });
      }
    }

    const modelsCatalog = [];
    const seenModels = new Set();

    for (const cp of customProviders) {
      const provName = cp.name || 'custom';
      const modelsObj = cp.models || {};
      const modelKeys = Object.keys(modelsObj);

      for (const mKey of modelKeys) {
        if (seenModels.has(mKey)) continue;
        seenModels.add(mKey);

        let category = 'Standard';
        let family = 'General';
        let contextWindow = '128K';
        let tags = [];

        if (provName === '9router' || mKey.startsWith('ag/') || mKey.startsWith('exp/')) {
          if (mKey.startsWith('exp/')) {
            category = '9router ExpLabs Promotional';
            if (mKey.includes('deepseek')) { family = 'DeepSeek'; tags = ['Fast', 'Coding', 'Math']; contextWindow = '64K'; }
            else if (mKey.includes('gpt-5.6')) { family = 'GPT'; tags = ['Advanced Reasoning', 'High Intelligence']; contextWindow = '128K'; }
            else if (mKey.includes('qwen')) { family = 'Qwen'; tags = ['Multilingual', 'Code', 'Math']; contextWindow = '128K'; }
          } else {
            category = '9router Antigravity';
            if (mKey.includes('claude-opus')) { family = 'Claude'; tags = ['Thinking', 'Complex Reasoning', 'Architecture']; contextWindow = '200K'; }
            else if (mKey.includes('claude-sonnet')) { family = 'Claude'; tags = ['Coding', 'Fast Reasoning', 'Agentic']; contextWindow = '200K'; }
            else if (mKey.includes('gemini-3.8')) { family = 'Gemini'; tags = ['Latest Flash', '1M Context', 'Vision', 'Tools']; contextWindow = '1,048,576 (1M)'; }
            else if (mKey.includes('gemini-3.7')) { family = 'Gemini'; tags = ['1M Context', 'High Speed', 'Vision']; contextWindow = '1,048,576 (1M)'; }
            else if (mKey.includes('gemini-pro') || mKey.includes('gemini-3.1-pro')) { family = 'Gemini'; tags = ['Deep Analysis', 'Pro Grade', '1M Context']; contextWindow = '1,048,576 (1M)'; }
            else if (mKey.includes('gemini')) { family = 'Gemini'; tags = ['Flash Speed', '1M Context']; contextWindow = '1,048,576 (1M)'; }
            else if (mKey.includes('gpt-oss')) { family = 'GPT-OSS'; tags = ['Open Weights', 'Fast']; contextWindow = '128K'; }
          }
        } else if (provName === 'opencode-free') {
          category = 'OpenCode Free (Zen/Go)';
          if (mKey.includes('deepseek')) { family = 'DeepSeek'; tags = ['Free', 'Fast']; }
          else if (mKey.includes('nemotron')) { family = 'Nemotron'; tags = ['Free', 'NVIDIA']; }
          else if (mKey.includes('muse-spark')) { family = 'Muse'; tags = ['Free', 'Creative']; }
          else if (mKey.includes('kimi')) { family = 'Kimi'; tags = ['Free', 'Long Context']; }
          else if (mKey.includes('glm')) { family = 'GLM'; tags = ['Free', 'General']; }
          else if (mKey.includes('qwen')) { family = 'Qwen'; tags = ['Free', 'Code/Math']; }
          else { family = 'OpenCode'; tags = ['Free']; }
        }

        const assigned = assignedMap[mKey] || [];
        const isSet = assigned.length > 0;

        modelsCatalog.push({
          id: mKey,
          name: formatModelDisplayName(mKey),
          provider: provName,
          category,
          family,
          contextWindow,
          tags,
          isSet,
          assigned
        });
      }
    }

    const totalModels = modelsCatalog.length;
    const setModels = modelsCatalog.filter(m => m.isSet).length;
    const unsetModels = totalModels - setModels;

    res.json({
      success: true,
      stats: {
        total: totalModels,
        setCount: setModels,
        unsetCount: unsetModels,
        agentCount: profiles.length,
        nineRouterCount: modelsCatalog.filter(m => m.provider === '9router').length,
        openCodeCount: modelsCatalog.filter(m => m.provider === 'opencode-free').length
      },
      agentAssignments,
      models: modelsCatalog
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/models/assign', (req, res) => {
  try {
    const { agentId, model, role } = req.body;
    if (!agentId || !model) {
      return res.status(400).json({ success: false, error: 'agentId and model are required' });
    }
    const pDir = getProfileDir(agentId);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: `Profile ${agentId} not found` });
    }

    const configPath = path.join(pDir, 'config.yaml');
    const config = safeReadYaml(configPath, {});

    if (role === 'fallback') {
      config.fallback_providers = [{ provider: '9router', model: String(model).trim() }];
      delete config.fallback_model;
      delete config.fallback;
    } else {
      setProfileModel(config, model);
      syncActiveSessionsModel(agentId, String(model).trim());
    }

    safeWriteYaml(configPath, config);
    res.json({
      success: true,
      message: `Model ${model} assigned to ${agentId} as ${role || 'primary'}`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= OBSIDIAN VAULT & GIT APIS =================

function scanVaultFiles(dir, baseDir = VAULT_DIR) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    if (item.name.startsWith('.git') || item.name.startsWith('.obsidian')) continue;
    const fullPath = path.join(dir, item.name);
    const relPath = path.relative(baseDir, fullPath);

    if (item.isDirectory()) {
      results = results.concat(scanVaultFiles(fullPath, baseDir));
    } else if (item.isFile() && item.name.endsWith('.md')) {
      const stats = fs.statSync(fullPath);
      const content = safeReadFile(fullPath, '');
      const { metadata } = parseFrontmatter(content);

      results.push({
        name: item.name,
        path: relPath,
        fullPath: fullPath,
        size: stats.size,
        mtime: stats.mtime,
        title: metadata.title || item.name.replace(/\.md$/, ''),
        tags: Array.isArray(metadata.tags) ? metadata.tags : (metadata.tags ? [metadata.tags] : []),
        date: metadata.date || stats.mtime.toISOString().split('T')[0]
      });
    }
  }
  return results;
}

app.get('/api/vault/files', (req, res) => {
  try {
    const files = scanVaultFiles(VAULT_DIR);
    res.json({
      success: true,
      vaultPath: VAULT_DIR,
      total: files.length,
      files
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/vault/file', (req, res) => {
  try {
    const fileRel = req.query.path;
    if (!fileRel) return res.status(400).json({ success: false, error: 'Path is required' });

    const safePath = path.resolve(VAULT_DIR, fileRel);
    if (!safePath.startsWith(VAULT_DIR)) {
      return res.status(403).json({ success: false, error: 'Access denied: outside vault' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const content = fs.readFileSync(safePath, 'utf8');
    const { metadata, body } = parseFrontmatter(content);
    const stats = fs.statSync(safePath);

    res.json({
      success: true,
      path: fileRel,
      name: path.basename(safePath),
      content,
      metadata,
      body,
      size: stats.size,
      mtime: stats.mtime
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/vault/file', (req, res) => {
  try {
    const { path: fileRel, content } = req.body;
    if (!fileRel || content === undefined) {
      return res.status(400).json({ success: false, error: 'Path and content are required' });
    }

    let targetRel = fileRel.endsWith('.md') ? fileRel : `${fileRel}.md`;
    const safePath = path.resolve(VAULT_DIR, targetRel);
    if (!safePath.startsWith(VAULT_DIR)) {
      return res.status(403).json({ success: false, error: 'Access denied: outside vault' });
    }

    const dir = path.dirname(safePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(safePath, content, 'utf8');
    res.json({ success: true, message: 'Note saved successfully', path: targetRel });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: list documents for a profile
app.get('/api/agent-docs', (req, res) => {
  try {
    const agentName = req.query.agent || 'default';
    const pDir = getProfileDir(agentName);
    if (!fs.existsSync(pDir)) {
      return res.status(404).json({ success: false, error: 'Agent profile directory not found' });
    }

    const foldersToScan = ['gateway', 'memories', 'secrets', 'logs', 'skills', 'sessions'];
    const docs = {
      folders: {},
      rootFiles: [],
      taskWorkspaces: []
    };

    // Scan standard folders
    foldersToScan.forEach(folder => {
      const fPath = path.join(pDir, folder);
      if (fs.existsSync(fPath) && fs.statSync(fPath).isDirectory()) {
        try {
          const files = fs.readdirSync(fPath, { withFileTypes: true })
            .filter(item => item.isFile() && !item.name.startsWith('.'))
            .map(item => {
              const fullP = path.join(fPath, item.name);
              const stat = fs.statSync(fullP);
              return { name: item.name, relPath: `${folder}/${item.name}`, size: stat.size, mtime: stat.mtime };
            });
          if (files.length > 0) {
            docs.folders[folder] = files;
          }
        } catch (e) {}
      }
    });

    // Scan root profile files
    try {
      docs.rootFiles = fs.readdirSync(pDir, { withFileTypes: true })
        .filter(item => item.isFile() && !item.name.startsWith('.') && !item.name.endsWith('.db') && !item.name.endsWith('.lock') && !item.name.endsWith('.pid'))
        .map(item => {
          const fullP = path.join(pDir, item.name);
          const stat = fs.statSync(fullP);
          return { name: item.name, relPath: item.name, size: stat.size, mtime: stat.mtime };
        });
    } catch (e) {}

    // Scan task workspaces
    const wsDir = path.join(pDir, 'kanban', 'workspaces');
    if (fs.existsSync(wsDir) && fs.statSync(wsDir).isDirectory()) {
      try {
        docs.taskWorkspaces = fs.readdirSync(wsDir, { withFileTypes: true })
          .filter(item => item.isDirectory() && !item.name.startsWith('.'))
          .map(item => item.name);
      } catch (e) {}
    }

    res.json({
      success: true,
      agent: agentName,
      basePath: pDir,
      docs
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/agent-doc-content', (req, res) => {
  try {
    const agentName = req.query.agent || 'default';
    const relPath = req.query.path;
    if (!relPath) return res.status(400).json({ success: false, error: 'Path is required' });

    const pDir = getProfileDir(agentName);
    const safePath = path.resolve(pDir, relPath);
    if (!safePath.startsWith(pDir)) {
      return res.status(403).json({ success: false, error: 'Access denied: outside agent profile' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    const stat = fs.statSync(safePath);
    if (stat.size > 2 * 1024 * 1024) {
      return res.json({ success: true, path: relPath, name: path.basename(safePath), content: 'File exceeds 2MB preview limit.', isBinary: false, size: stat.size });
    }

    const content = fs.readFileSync(safePath, 'utf8');
    res.json({
      success: true,
      path: relPath,
      name: path.basename(safePath),
      content,
      size: stat.size,
      mtime: stat.mtime
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/agent-doc-content', (req, res) => {
  try {
    const { agent, path: relPath, content } = req.body;
    if (!relPath || content === undefined) {
      return res.status(400).json({ success: false, error: 'Path and content are required' });
    }

    const agentName = agent || 'default';
    const pDir = getProfileDir(agentName);
    const safePath = path.resolve(pDir, relPath);
    if (!safePath.startsWith(pDir)) {
      return res.status(403).json({ success: false, error: 'Access denied: outside agent profile' });
    }

    fs.mkdirSync(path.dirname(safePath), { recursive: true });
    fs.writeFileSync(safePath, content, 'utf8');

    const stat = fs.statSync(safePath);
    res.json({
      success: true,
      message: 'File saved successfully',
      path: relPath,
      name: path.basename(safePath),
      size: stat.size,
      mtime: stat.mtime
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= WORKSPACE DRIVE (LOCAL VPS STORAGE) APIS =================

if (!fs.existsSync(WORKSPACE_DIR)) fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

function getAgentWorkspaceDir(agent) {
  const p = path.resolve(WORKSPACE_DIR, agent || 'default');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  return p;
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) return 'audio';
  if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) return 'image';
  if (['.py', '.sh', '.js', '.ts', '.patch', '.diff', '.sql'].includes(ext)) return 'code';
  if (['.zip', '.tar', '.gz', '.7z'].includes(ext)) return 'archive';
  if (['.pdf'].includes(ext)) return 'pdf';
  return 'document';
}

function scanDirFiles(dirPath, baseDir = dirPath) {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(scanDirFiles(full, baseDir));
    } else if (entry.isFile()) {
      results.push({
        fullPath: full,
        relPath: path.relative(baseDir, full),
        name: entry.name,
        stat: fs.statSync(full)
      });
    }
  }
  return results;
}

app.get('/api/drive/deliverables', (req, res) => {
  try {
    const deliverables = [];
    // Profiles follow this machine: default + every workspace / profile dir present.
    const profiles = ['default'];
    for (const src of [WORKSPACE_DIR, PROFILES_DIR]) {
      try {
        if (fs.existsSync(src)) {
          for (const d of fs.readdirSync(src, { withFileTypes: true })) {
            if (d.isDirectory() && !d.name.startsWith('.') && !profiles.includes(d.name)) profiles.push(d.name);
          }
        }
      } catch (e) {}
    }

    const agentLabelFor = (id) => id === 'default' ? 'Default' : id.charAt(0).toUpperCase() + id.slice(1);

    // 1. Scan the configured agent workspace dir
    profiles.forEach(p => {
      const agentDir = getAgentWorkspaceDir(p);
      const agentLabel = agentLabelFor(p);
      const files = scanDirFiles(agentDir);

      files.forEach(f => {
        const fileType = getFileType(f.name);
        let content = '';
        if (['document', 'code'].includes(fileType) && f.stat.size < 500000) {
          try { content = fs.readFileSync(f.fullPath, 'utf8'); } catch (_) {}
        }

        deliverables.push({
          id: `ws:${p}:${f.relPath}`,
          agent: p,
          agentName: agentLabel,
          name: f.name,
          relPath: f.relPath,
          fullPath: f.fullPath,
          vpsFolder: `${WORKSPACE_DIR}/${p}/`,
          size: f.stat.size,
          sizeDisplay: f.stat.size > 1048576 
            ? `${(f.stat.size / 1048576).toFixed(1)} MB` 
            : `${(f.stat.size / 1024).toFixed(1)} KB`,
          mtime: f.stat.mtime.toISOString(),
          type: fileType,
          source: 'Agent Workspace Output',
          storageStatus: 'stored_local',
          downloadUrl: `/api/drive/download?agent=${p}&file=${encodeURIComponent(f.relPath)}`,
          previewUrl: `/api/drive/preview?agent=${p}&file=${encodeURIComponent(f.relPath)}`,
          content: content.slice(0, 10000)
        });
      });
    });

    // 2. Also scan cron outputs
    profiles.forEach(p => {
      const pDir = getProfileDir(p);
      const cronOutputDir = path.join(pDir, 'cron', 'output');
      const agentLabel = agentLabelFor(p);

      let jobMap = {};
      const jobsPath = path.join(pDir, 'cron', 'jobs.json');
      if (fs.existsSync(jobsPath)) {
        try {
          const jd = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
          (jd.jobs || []).forEach(j => { jobMap[j.id] = j.name || j.id; });
        } catch (_) {}
      }

      if (fs.existsSync(cronOutputDir)) {
        try {
          const jobDirs = fs.readdirSync(cronOutputDir, { withFileTypes: true });
          jobDirs.filter(jd => jd.isDirectory()).forEach(jd => {
            const jobId = jd.name;
            const jobName = jobMap[jobId] || `Job ${jobId}`;
            const jobDirPath = path.join(cronOutputDir, jobId);
            const files = fs.readdirSync(jobDirPath, { withFileTypes: true });
            files.filter(f => f.isFile() && (f.name.endsWith('.md') || f.name.endsWith('.txt'))).forEach(f => {
              const filePath = path.join(jobDirPath, f.name);
              const stat = fs.statSync(filePath);
              const fileKey = `cron:${p}:${jobId}:${f.name}`;
              let content = '';
              try { content = fs.readFileSync(filePath, 'utf8'); } catch (_) {}

              deliverables.push({
                id: fileKey,
                agent: p,
                agentName: agentLabel,
                name: f.name,
                relPath: `cron/output/${jobId}/${f.name}`,
                fullPath: filePath,
                vpsFolder: `${pDir}/cron/output/${jobId}/`,
                size: stat.size,
                sizeDisplay: `${(stat.size / 1024).toFixed(1)} KB`,
                mtime: stat.mtime.toISOString(),
                type: 'document',
                source: `${jobName}`,
                storageStatus: 'stored_local',
                downloadUrl: `/api/drive/download?agent=${p}&cron=true&jobId=${jobId}&file=${encodeURIComponent(f.name)}`,
                previewUrl: `/api/drive/preview?agent=${p}&cron=true&jobId=${jobId}&file=${encodeURIComponent(f.name)}`,
                content: content.slice(0, 10000)
              });
            });
          });
        } catch (_) {}
      }
    });

    deliverables.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));

    res.json({
      success: true,
      rootFolder: `${WORKSPACE_DIR}/`,
      storageType: 'Local VPS Dedicated Storage',
      deliverables
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download endpoint
app.get('/api/drive/download', (req, res) => {
  try {
    const { agent, file, cron, jobId } = req.query;
    if (!agent || !file) {
      return res.status(400).send('Missing agent or file parameter');
    }

    let targetPath;
    if (cron === 'true' && jobId) {
      const pDir = getProfileDir(agent);
      targetPath = path.resolve(pDir, 'cron', 'output', jobId, file);
      if (!targetPath.startsWith(path.join(pDir, 'cron', 'output'))) {
        return res.status(403).send('Access denied');
      }
    } else {
      const agentDir = getAgentWorkspaceDir(agent);
      targetPath = path.resolve(agentDir, file);
      if (!targetPath.startsWith(agentDir)) {
        return res.status(403).send('Access denied');
      }
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).send('File not found');
    }

    res.download(targetPath, path.basename(targetPath));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Preview / Stream endpoint
app.get('/api/drive/preview', (req, res) => {
  try {
    const { agent, file, cron, jobId } = req.query;
    if (!agent || !file) {
      return res.status(400).send('Missing agent or file parameter');
    }

    let targetPath;
    if (cron === 'true' && jobId) {
      const pDir = getProfileDir(agent);
      targetPath = path.resolve(pDir, 'cron', 'output', jobId, file);
      if (!targetPath.startsWith(path.join(pDir, 'cron', 'output'))) {
        return res.status(403).send('Access denied');
      }
    } else {
      const agentDir = getAgentWorkspaceDir(agent);
      targetPath = path.resolve(agentDir, file);
      if (!targetPath.startsWith(agentDir)) {
        return res.status(403).send('Access denied');
      }
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).send('File not found');
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.pdf': 'application/pdf',
      '.md': 'text/markdown; charset=utf-8',
      '.txt': 'text/plain; charset=utf-8',
      '.json': 'application/json',
      '.py': 'text/plain; charset=utf-8'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(targetPath).pipe(res);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Delete drive file endpoint (Workspace outputs and Cron outputs)
app.delete('/api/drive/file', (req, res) => {
  try {
    const { agent, file, cron, jobId, id } = req.body || {};

    let effectiveAgent = agent;
    let effectiveFile = file;
    let effectiveCron = cron === true || cron === 'true';
    let effectiveJobId = jobId;

    if (id && typeof id === 'string') {
      const parts = id.split(':');
      if (parts[0] === 'ws' && parts.length >= 3) {
        effectiveAgent = parts[1];
        effectiveFile = parts.slice(2).join(':');
        effectiveCron = false;
      } else if (parts[0] === 'cron' && parts.length >= 4) {
        effectiveAgent = parts[1];
        effectiveJobId = parts[2];
        effectiveFile = parts.slice(3).join(':');
        effectiveCron = true;
      }
    }

    if (!effectiveAgent || !effectiveFile) {
      return res.status(400).json({ success: false, error: 'Missing agent or file parameter' });
    }

    let targetPath;
    if (effectiveCron && effectiveJobId) {
      const pDir = getProfileDir(effectiveAgent);
      targetPath = path.resolve(pDir, 'cron', 'output', effectiveJobId, effectiveFile);
      if (!targetPath.startsWith(path.join(pDir, 'cron', 'output'))) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    } else {
      const agentDir = getAgentWorkspaceDir(effectiveAgent);
      targetPath = path.resolve(agentDir, effectiveFile);
      if (!targetPath.startsWith(agentDir)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, error: 'File not found' });
    }

    fs.unlinkSync(targetPath);

    // If deleting an agent workspace file that originated from revenue-ops pipeline,
    // also delete the master copy in the revenue-ops pipeline dir and any synced copies in peer agent workspaces.
    // Otherwise, workspace-sync cronjob (runs every 5m) will automatically restore the file via rsync.
    if (!effectiveCron) {
      const revenueOpsPath = path.resolve(REVENUE_OPS_DIR, effectiveFile);
      if (revenueOpsPath.startsWith(REVENUE_OPS_DIR) && fs.existsSync(revenueOpsPath)) {
        try { fs.unlinkSync(revenueOpsPath); } catch (_) {}
      }

      // Also clean up sidecar JSON metadata if present (e.g. for video clips)
      const baseNoExt = effectiveFile.replace(/\.[^/.]+$/, "");
      const sidecarJson = path.resolve(REVENUE_OPS_DIR, baseNoExt + '.json');
      if (sidecarJson.startsWith(REVENUE_OPS_DIR) && fs.existsSync(sidecarJson)) {
        try { fs.unlinkSync(sidecarJson); } catch (_) {}
      }

      // Clean up peer agent workspaces (same derived profile set as the drive scan)
      const allProfiles = ['default'];
      try {
        for (const src of [WORKSPACE_DIR, PROFILES_DIR]) {
          if (fs.existsSync(src)) {
            for (const d of fs.readdirSync(src, { withFileTypes: true })) {
              if (d.isDirectory() && !d.name.startsWith('.') && !allProfiles.includes(d.name)) allProfiles.push(d.name);
            }
          }
        }
      } catch (e) {}
      for (const p of allProfiles) {
        if (p === effectiveAgent) continue;
        const pDir = getAgentWorkspaceDir(p);
        const peerPath = path.resolve(pDir, effectiveFile);
        if (peerPath.startsWith(pDir) && fs.existsSync(peerPath)) {
          try { fs.unlinkSync(peerPath); } catch (_) {}
        }
        const peerJson = path.resolve(pDir, baseNoExt + '.json');
        if (peerJson.startsWith(pDir) && fs.existsSync(peerJson)) {
          try { fs.unlinkSync(peerJson); } catch (_) {}
        }
      }

      // Also clean up sidecar in the current agent workspace
      const localJson = path.resolve(getAgentWorkspaceDir(effectiveAgent), baseNoExt + '.json');
      if (localJson.startsWith(getAgentWorkspaceDir(effectiveAgent)) && fs.existsSync(localJson)) {
        try { fs.unlinkSync(localJson); } catch (_) {}
      }
    }

    return res.json({ 
      success: true, 
      message: `Berkas "${path.basename(targetPath)}" berhasil dihapus permanen`, 
      fileName: path.basename(targetPath) 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/vault/file', (req, res) => {
  try {
    const fileRel = req.body?.path || req.query?.path;
    if (!fileRel) return res.status(400).json({ success: false, error: 'Path is required' });

    let targetRel = fileRel.replace(new RegExp('^' + VAULT_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/'), '').replace(/^\/+/, '');
    if (!targetRel.endsWith('.md') && !path.extname(targetRel)) {
      targetRel += '.md';
    }

    const safePath = path.resolve(VAULT_DIR, targetRel);
    if (!safePath.startsWith(VAULT_DIR)) {
      return res.status(403).json({ success: false, error: 'Access denied: outside vault' });
    }

    if (fs.existsSync(safePath)) {
      fs.unlinkSync(safePath);
      // Remove empty parent directory if inside VAULT_DIR and not VAULT_DIR itself
      const parentDir = path.dirname(safePath);
      if (parentDir !== VAULT_DIR && fs.existsSync(parentDir)) {
        try {
          const files = fs.readdirSync(parentDir);
          if (files.length === 0) {
            fs.rmdirSync(parentDir);
          }
        } catch (_) {}
      }
      return res.json({ success: true, message: `Catatan "${path.basename(safePath)}" berhasil dihapus` });
    } else {
      return res.status(404).json({ success: false, error: 'File catatan tidak ditemukan' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/vault/git-status', (req, res) => {
  try {
    if (!fs.existsSync(path.join(VAULT_DIR, '.git'))) {
      return res.json({ success: true, isGit: false });
    }

    const branch = execSync('git branch --show-current', { cwd: VAULT_DIR, encoding: 'utf8' }).trim();
    const statusRaw = execSync('git status --short', { cwd: VAULT_DIR, encoding: 'utf8' }).trim();
    const lastCommit = execSync('git log -1 --pretty=format:"%h - %s (%cr)"', { cwd: VAULT_DIR, encoding: 'utf8' }).trim();
    const remoteUrl = execSync('git remote get-url origin', { cwd: VAULT_DIR, encoding: 'utf8' }).trim();

    const changedFiles = statusRaw ? statusRaw.split('\n').map(l => l.trim()) : [];

    res.json({
      success: true,
      isGit: true,
      branch,
      clean: changedFiles.length === 0,
      changedFiles,
      lastCommit,
      remoteUrl
    });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/vault/git-sync', (req, res) => {
  try {
    const { action, message } = req.body; // 'pull' or 'push'
    if (action === 'pull') {
      const output = execSync('git pull origin main', { cwd: VAULT_DIR, encoding: 'utf8' });
      return res.json({ success: true, action: 'pull', output });
    } else if (action === 'push') {
      execSync('git add .', { cwd: VAULT_DIR });
      const commitMsg = message || `Update vault notes via Secret Agent [${new Date().toISOString()}]`;
      let commitOutput = '';
      try {
        commitOutput = execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd: VAULT_DIR, encoding: 'utf8' });
      } catch (e) {
        // nothing to commit
      }
      const pushOutput = execSync('git push origin main', { cwd: VAULT_DIR, encoding: 'utf8' });
      return res.json({ success: true, action: 'push', output: `${commitOutput}\n${pushOutput}` });
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action: use "pull" or "push"' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= KANBAN WORKFLOW APIS =================

app.get('/api/kanban', (req, res) => {
  try {
    const output = execFileSync('python3', [KANBAN_HELPER, 'list'], { encoding: 'utf8' });
    const tasks = JSON.parse(output.trim() || '[]');
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kanban/tasks', (req, res) => {
  try {
    const { title, body, assignee, status, priority } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

    const payload = JSON.stringify({ title, body, assignee, status, priority });
    const output = execFileSync('python3', [KANBAN_HELPER, 'add', payload], { encoding: 'utf8' });
    const task = JSON.parse(output.trim());

    // Trigger auto Telegram notification
    telegramNotifier.sendTaskNotification('created', task, { summary: 'New task registered in Kanban backlog' }).catch(() => {});

    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/kanban/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const payload = JSON.stringify(req.body);
    execFileSync('python3', [KANBAN_HELPER, 'update', id, payload], { encoding: 'utf8' });

    // Trigger auto Telegram notification on status change
    if (req.body.status) {
      telegramNotifier.sendTaskNotification(req.body.status, {
        id,
        title: req.body.title || `Task ${id}`,
        assignee: req.body.assignee || 'default',
        priority: req.body.priority || 0,
        body: req.body.body || ''
      }, {
        summary: req.body.summary || req.body.result || '',
        reason: req.body.reason || ''
      }).catch(() => {});
    }

    res.json({ success: true, message: 'Task updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/kanban/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    execFileSync('python3', [KANBAN_HELPER, 'delete', id], { encoding: 'utf8' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/kanban/workers', (req, res) => {
  try {
    const output = execFileSync('hermes', ['kanban', 'assignees', '--json'], { encoding: 'utf8', timeout: 10000 });
    res.json({ success: true, workers: JSON.parse(output.trim() || '[]') });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kanban/dispatch', (req, res) => {
  try {
    const args = ['kanban', 'dispatch', '--json'];
    if (Number.isInteger(req.body?.max) && req.body.max > 0) args.push('--max', String(req.body.max));
    const output = execFileSync('hermes', args, { encoding: 'utf8', timeout: 30000 });
    res.json({ success: true, result: JSON.parse(output.trim() || '{}') });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, output: err.stdout || '' });
  }
});

app.post('/api/kanban/tasks/:id/unblock', (req, res) => {
  try {
    execFileSync('hermes', ['kanban', 'unblock', req.params.id, '--reason', String(req.body?.reason || 'Unblocked from dashboard')], { encoding: 'utf8', timeout: 10000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/kanban/tasks/:id/comment', (req, res) => {
  try {
    const comment = String(req.body?.comment || '').trim();
    if (!comment) return res.status(400).json({ success: false, error: 'Comment is required' });
    execFileSync('hermes', ['kanban', 'comment', req.params.id, comment], { encoding: 'utf8', timeout: 10000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= SCHEDULES & CRON APIS =================

function findJobProfile(jobId) {
  const defaultJobs = path.join(HERMES_HOME, 'cron', 'jobs.json');
  try {
    if (fs.existsSync(defaultJobs)) {
      const d = JSON.parse(fs.readFileSync(defaultJobs, 'utf8'));
      if (d.jobs && d.jobs.some(j => j.id === jobId)) return 'default';
    }
  } catch (_) {}
  if (fs.existsSync(PROFILES_DIR)) {
    try {
      const entries = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
      for (const e of entries) {
        if (e.isDirectory()) {
          const pj = path.join(PROFILES_DIR, e.name, 'cron', 'jobs.json');
          if (fs.existsSync(pj)) {
            const d = JSON.parse(fs.readFileSync(pj, 'utf8'));
            if (d.jobs && d.jobs.some(j => j.id === jobId)) return e.name;
          }
        }
      }
    } catch (_) {}
  }
  return 'default';
}

app.get('/api/schedules', (req, res) => {
  try {
    const pythonCode = `
import json, glob, os
from cron.jobs import use_cron_store, list_jobs

hermes_home = os.path.expanduser("~/.hermes")
profiles = ["default"]
profiles_dir = os.path.join(hermes_home, "profiles")
if os.path.isdir(profiles_dir):
    for d in sorted(os.listdir(profiles_dir)):
        if os.path.isdir(os.path.join(profiles_dir, d)):
            profiles.append(d)

output = []
seen_ids = set()
for p in profiles:
    pdir = hermes_home if p == "default" else os.path.join(profiles_dir, p)
    try:
        with use_cron_store(pdir):
            jobs = list_jobs(include_disabled=True)
            for j in jobs:
                jid = j.get('id')
                if not jid or jid in seen_ids:
                    continue
                seen_ids.add(jid)
                files = sorted(glob.glob(os.path.join(pdir, 'cron', 'output', str(jid), '*.md')), key=os.path.getmtime, reverse=True)
                output_file = files[0] if files else None
                output_text = open(output_file, encoding='utf-8', errors='replace').read() if output_file else ''
                deliver_val = j.get('deliver') or 'local'
                recipient_agent = j.get('recipient_agent') or j.get('agent') or p
                deliver_mode = deliver_val
                if str(deliver_val).startswith('bot-chat:'):
                    deliver_mode = 'bot-chat'
                    if not recipient_agent or recipient_agent == p:
                        recipient_agent = str(deliver_val).split(':', 1)[1]
                elif deliver_val == 'telegram' and not recipient_agent:
                    recipient_agent = p

                output.append({
                    'id': jid,
                    'name': j.get('name') or jid,
                    'schedule': j.get('schedule_display') or (j.get('schedule') or {}).get('expr', '* * * * *'),
                    'schedule_display': j.get('schedule_display'),
                    'prompt': j.get('prompt'),
                    'next_run_at': j.get('next_run_at'),
                    'deliver': deliver_mode,
                    'deliver_raw': deliver_val,
                    'recipient_agent': recipient_agent,
                    'agent': j.get('agent') or p,
                    'profile': p,
                    'enabled': j.get('enabled', True),
                    'last_run_at': j.get('last_run_at'),
                    'last_status': j.get('last_status'),
                    'last_error': j.get('last_error'),
                    'model': j.get('model_snapshot') or j.get('model') or '',
                    'provider': j.get('provider_snapshot') or j.get('provider') or '',
                    'reasoning_effort': j.get('reasoning_effort') or 'default',
                    'last_delivery_error': j.get('last_delivery_error'),
                    'last_delivery_unverified': j.get('last_delivery_unverified'),
                    'last_delivery_queued': j.get('last_delivery_queued'),
                    'execution_state': 'running' if j.get('fire_claim') else ('failed' if j.get('last_status') == 'error' else ('completed' if j.get('last_run_at') else 'idle')),
                    'fire_claim': bool(j.get('fire_claim')),
                    'output_file': output_file,
                    'output': output_text[-5000:],
                })
    except Exception:
        continue
print(json.dumps(output))
`;
    const result = execFileSync('python3', ['-c', pythonCode], { encoding: 'utf8' });
    const schedules = JSON.parse(result.trim() || '[]');
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/schedules/:id/run', (req, res) => {
  try {
    const { id } = req.params;
    const profile = findJobProfile(id);
    const pDir = getProfileDir(profile);
    const output = execFileSync('hermes', ['cron', 'run', '--accept-hooks', id], {
      encoding: 'utf8',
      env: { ...process.env, HERMES_HOME: pDir }
    });
    const alreadyRunning = /already (being )?fired|already running/i.test(output);
    if (alreadyRunning) return res.status(409).json({ success: false, state: 'already_running', message: output.trim() });
    res.status(202).json({ success: true, state: 'queued', message: `Job ${id} queued (${profile})`, output: output.trim() });
  } catch (err) {
    const detail = `${err.stdout || ''}\n${err.stderr || ''}\n${err.message}`.trim();
    const alreadyRunning = /already (being )?fired|already running/i.test(detail);
    res.status(alreadyRunning ? 409 : 500).json({ success: false, state: alreadyRunning ? 'already_running' : 'failed', error: detail });
  }
});

app.post('/api/schedules/:id/pause', (req, res) => {
  try {
    const { id } = req.params;
    const profile = findJobProfile(id);
    const pDir = getProfileDir(profile);
    execFileSync('hermes', ['cron', 'pause', id], {
      encoding: 'utf8',
      env: { ...process.env, HERMES_HOME: pDir }
    });
    res.json({ success: true, message: `Job ${id} paused (${profile})` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/schedules/:id/resume', (req, res) => {
  try {
    const { id } = req.params;
    const profile = findJobProfile(id);
    const pDir = getProfileDir(profile);
    execFileSync('hermes', ['cron', 'resume', id], {
      encoding: 'utf8',
      env: { ...process.env, HERMES_HOME: pDir }
    });
    res.json({ success: true, message: `Job ${id} resumed (${profile})` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/schedules/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, schedule, prompt, deliver, recipient_agent, provider, model, reasoning_effort, enabled } = req.body;

    const payload = JSON.stringify({
      job_id: id,
      name, schedule, prompt, deliver, recipient_agent, provider, model, reasoning_effort, enabled
    });

    const script = `
import json, sys, os, shutil
from cron.jobs import use_cron_store, get_job, update_job, load_jobs, save_jobs, remove_job

data = json.loads(sys.stdin.read())
job_id = data.get('job_id')
hermes_home = os.path.expanduser("~/.hermes")
profiles_dir = os.path.join(hermes_home, "profiles")

def get_pdir(name):
    if not name or name == 'default':
        return hermes_home
    return os.path.join(profiles_dir, name)

all_profiles = ['default']
if os.path.isdir(profiles_dir):
    for d in sorted(os.listdir(profiles_dir)):
        if os.path.isdir(os.path.join(profiles_dir, d)):
            all_profiles.append(d)

current_p = None
for p in all_profiles:
    pdir = get_pdir(p)
    try:
        with use_cron_store(pdir):
            if get_job(job_id) is not None:
                current_p = p
                break
    except Exception:
        pass

if not current_p:
    print(json.dumps({'error': f'Job {job_id} not found across profiles'}))
    sys.exit(1)

updates = {}
target_p = current_p

if data.get('name') is not None and str(data['name']).strip():
    updates['name'] = str(data['name']).strip()
if data.get('prompt') is not None:
    updates['prompt'] = str(data['prompt'])
if data.get('recipient_agent') is not None and str(data['recipient_agent']).strip():
    agent = str(data['recipient_agent']).strip()
    updates['recipient_agent'] = agent
    updates['agent'] = agent
    if agent in all_profiles:
        target_p = agent
if data.get('deliver') is not None and str(data['deliver']).strip():
    deliv = str(data['deliver']).strip()
    if deliv == 'bot-chat':
        agent = updates.get('recipient_agent') or target_p
        updates['deliver'] = f'bot-chat:{agent}'
    else:
        updates['deliver'] = deliv
if data.get('schedule') is not None and str(data['schedule']).strip():
    updates['schedule'] = str(data['schedule']).strip()
if data.get('provider') is not None and str(data['provider']).strip():
    updates['provider'] = str(data['provider']).strip()
if data.get('model') is not None and str(data['model']).strip():
    updates['model'] = str(data['model']).strip()
if data.get('reasoning_effort') is not None:
    r = str(data['reasoning_effort'])
    updates['reasoning_effort'] = r if r != 'default' else None
if data.get('enabled') is not None:
    updates['enabled'] = bool(data['enabled'])

if target_p != current_p:
    cur_pdir = get_pdir(current_p)
    tgt_pdir = get_pdir(target_p)
    
    with use_cron_store(cur_pdir):
        old_job = get_job(job_id)
        remove_job(job_id)
        
    with use_cron_store(tgt_pdir):
        tgt_jobs = load_jobs()
        tgt_jobs = [j for j in tgt_jobs if j.get('id') != job_id]
        tgt_jobs.append(old_job)
        save_jobs(tgt_jobs)
        job = update_job(job_id, updates)
        
    cur_out = os.path.join(cur_pdir, 'cron', 'output', job_id)
    tgt_out = os.path.join(tgt_pdir, 'cron', 'output', job_id)
    if os.path.isdir(cur_out):
        os.makedirs(os.path.dirname(tgt_out), exist_ok=True)
        if os.path.exists(tgt_out):
            shutil.rmtree(tgt_out)
        shutil.move(cur_out, tgt_out)
else:
    with use_cron_store(get_pdir(current_p)):
        job = update_job(job_id, updates)

if not job:
    print(json.dumps({'error': f'Failed to update job {job_id}'}))
    sys.exit(1)

print(json.dumps({
    'success': True,
    'job': {
        'id': job.get('id'),
        'name': job.get('name'),
        'model': job.get('model'),
        'provider': job.get('provider'),
        'deliver': job.get('deliver'),
        'recipient_agent': job.get('recipient_agent'),
        'profile': target_p
    }
}))
`;
    const result = execFileSync('python3', ['-c', script], { input: payload, encoding: 'utf8' });
    const data = JSON.parse(result.trim());
    if (data.error) {
      return res.status(404).json({ success: false, error: data.error });
    }
    if (data.job && data.job.profile && data.job.profile !== 'default') {
      try {
        const pDir = getProfileDir(data.job.profile);
        const st = execSync(`systemctl --user is-active hermes-gateway-${data.job.profile}.service 2>/dev/null || true`, { encoding: 'utf8' }).trim();
        if (st !== 'active') {
          execFileSync('hermes', ['gateway', 'start'], {
            encoding: 'utf8',
            env: { ...process.env, HERMES_HOME: pDir }
          });
        }
      } catch (_) {}
    }
    res.json({ success: true, message: 'Schedule updated successfully', job: data.job });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/schedules/:id', (req, res) => {
  try {
    const { id } = req.params;
    const profile = findJobProfile(id);
    const pDir = getProfileDir(profile);
    execFileSync('hermes', ['cron', 'rm', id], {
      encoding: 'utf8',
      env: { ...process.env, HERMES_HOME: pDir }
    });
    res.json({ success: true, message: `Job ${id} deleted (${profile})` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= OBSIDIAN & MEMORY GRAPH APIS =================
app.get('/api/graph', (req, res) => {
  try {
    const data = graphBuilder.buildGraphData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/graph/node', (req, res) => {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: 'Node ID is required' });
    const detail = graphBuilder.getNodeDetail(id);
    if (!detail) return res.status(404).json({ success: false, error: 'Node not found' });
    res.json({ success: true, ...detail });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= CHANNELS & TELEGRAM MULTI-TOPIC APIS =================

app.get('/api/channels/telegram', async (req, res) => {
  try {
    const config = telegramNotifier.loadConfig();
    const token = telegramNotifier.getEffectiveToken();
    
    let botInfo = null;
    let connected = false;
    if (token) {
      const v = await telegramNotifier.verifyBot(token);
      if (v.success) {
        botInfo = v.bot;
        connected = true;
      }
    }

    const maskedToken = token ? (token.substring(0, 7) + '...' + token.substring(token.length - 5)) : '';

    res.json({
      success: true,
      config: {
        ...config,
        botTokenMasked: maskedToken,
        hasToken: !!token
      },
      connected,
      botInfo
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/channels/telegram', (req, res) => {
  try {
    const { enabled, botToken, chatId, topics, autoNotify } = req.body;
    const current = telegramNotifier.loadConfig();

    if (enabled !== undefined) current.enabled = enabled;
    if (botToken !== undefined && !botToken.includes('...')) {
      current.botToken = botToken.trim();
    }
    if (chatId !== undefined) current.chatId = chatId.trim();
    if (topics !== undefined) current.topics = { ...current.topics, ...topics };
    if (autoNotify !== undefined) current.autoNotify = { ...current.autoNotify, ...autoNotify };

    telegramNotifier.saveConfig(current);
    res.json({ success: true, message: 'Telegram channels configuration saved' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/channels/telegram/verify', async (req, res) => {
  try {
    const { token } = req.body;
    const result = await telegramNotifier.verifyBot(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/channels/telegram/test', async (req, res) => {
  try {
    const { chatId, topicId, text, category } = req.body;
    const topicLabel = topicId ? `Topic #${topicId}` : 'Main Chat / General';
    const messageText = text || [
      `🔔 <b>Secret Agent: Telegram Multi-Topic Test</b>`,
      `━━━━━━━━━━━━━━━━━━━━`,
      `📡 <b>Routing:</b> <code>${topicLabel}</code>`,
      `🏷️ <b>Category:</b> <code>${category || 'Test Dispatch'}</code>`,
      `🟢 <b>Gateway Status:</b> <code>CONNECTED & ACTIVE</code>`,
      ``,
      `🕒 <i>${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB</i>`
    ].join('\n');

    const result = await telegramNotifier.sendMessage({ text: messageText, chatId, topicId });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/channels/telegram/send-status', async (req, res) => {
  try {
    const { topicId } = req.body;
    const result = await telegramNotifier.sendServerStatusNotification(topicId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/channels/telegram/send-alert', async (req, res) => {
  try {
    const { title, message, severity, topicId } = req.body;
    const result = await telegramNotifier.sendSystemAlertNotification(
      title || 'Manual Alert',
      message || 'Alert broadcast triggered manually from Secret Agent Ops Deck.',
      severity || 'WARNING',
      topicId
    );
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/channels/telegram/history', (req, res) => {
  try {
    const config = telegramNotifier.loadConfig();
    res.json({ success: true, history: config.history || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/channels/overview', async (req, res) => {
  try {
    const config = telegramNotifier.loadConfig();
    const token = telegramNotifier.getEffectiveToken();

    const profiles = [];
    profiles.push(getProfileDetails('default'));
    if (fs.existsSync(PROFILES_DIR)) {
      const dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'default') {
          profiles.push(getProfileDetails(d.name));
        }
      }
    }

    const agentTelegramBots = profiles.map(p => {
      const pDir = getProfileDir(p.id);
      const envPath = path.join(pDir, '.env');
      let botToken = '';
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
        if (match) botToken = match[1].trim();
      }
      const masked = botToken ? (botToken.substring(0, 7) + '...' + botToken.substring(botToken.length - 4)) : '';
      const topicId = (config.topics && config.topics.agent_bindings && config.topics.agent_bindings[p.id]) || '';

      return {
        agentId: p.id,
        agentName: p.name || p.id,
        hasBot: !!botToken,
        botTokenMasked: masked,
        topicId: topicId || '(Main Chat)',
        gatewayStatus: p.gatewayStatus
      };
    });

    const rootEnvPath = path.join(HERMES_HOME, '.env');
    let rootEnv = {};
    if (fs.existsSync(rootEnvPath)) {
      const lines = fs.readFileSync(rootEnvPath, 'utf8').split('\n');
      for (const l of lines) {
        const trimmed = l.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...rest] = trimmed.split('=');
          rootEnv[k.trim()] = rest.join('=').trim();
        }
      }
    }

    const otherChannelsDef = [
      {
        id: 'discord',
        name: 'Discord',
        icon: 'message-square',
        category: 'Community & Voice',
        description: 'Server bot integration with slash commands, thread delegation, and role-based permissions.',
        keys: [
          { name: 'DISCORD_BOT_TOKEN', label: 'Bot Token', type: 'password' },
          { name: 'DISCORD_GUILD_ID', label: 'Server / Guild ID', type: 'text' },
          { name: 'DISCORD_CHANNEL_ID', label: 'Default Channel ID', type: 'text' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'hermes-discord'
      },
      {
        id: 'slack',
        name: 'Slack',
        icon: 'hash',
        category: 'Workplace Chat',
        description: 'Slack workspace bot with Socket Mode, Block Kit cards, thread replies, and slash commands.',
        keys: [
          { name: 'SLACK_BOT_TOKEN', label: 'Bot Token (xoxb-...)', type: 'password' },
          { name: 'SLACK_APP_TOKEN', label: 'App-Level Token (xapp-...)', type: 'password' },
          { name: 'SLACK_SIGNING_SECRET', label: 'Signing Secret', type: 'password' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'hermes-slack'
      },
      {
        id: 'whatsapp',
        name: 'WhatsApp Business',
        icon: 'phone-call',
        category: 'Instant Messaging',
        description: 'Meta Cloud API or Baileys multi-device bridge for automated messaging and inbound triage.',
        keys: [
          { name: 'WHATSAPP_PHONE_ID', label: 'Phone Number ID', type: 'text' },
          { name: 'WHATSAPP_API_KEY', label: 'Access Token / API Key', type: 'password' },
          { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', label: 'Business Account ID', type: 'text' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'hermes-whatsapp'
      },
      {
        id: 'twitter',
        name: 'X (Twitter)',
        icon: 'at-sign',
        category: 'Social Network',
        description: 'Automated post publishing, mention replies, and DM handling via xurl CLI & Twitter API v2.',
        keys: [
          { name: 'TWITTER_BEARER_TOKEN', label: 'Bearer Token', type: 'password' },
          { name: 'TWITTER_API_KEY', label: 'API Key', type: 'text' },
          { name: 'TWITTER_API_SECRET', label: 'API Key Secret', type: 'password' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'xurl'
      },
      {
        id: 'signal',
        name: 'Signal Messenger',
        icon: 'shield',
        category: 'Encrypted Chat',
        description: 'End-to-end encrypted messaging via signald daemon and hermes-signal plugin.',
        keys: [
          { name: 'SIGNAL_PHONE_NUMBER', label: 'Registered Phone (+...)', type: 'text' },
          { name: 'SIGNAL_DAEMON_URL', label: 'signald Socket / URL', type: 'text' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'hermes-signal'
      },
      {
        id: 'teams',
        name: 'Microsoft Teams',
        icon: 'users',
        category: 'Enterprise Chat',
        description: 'Enterprise Microsoft Teams channel webhooks and Azure Bot Framework service connector.',
        keys: [
          { name: 'TEAMS_WEBHOOK_URL', label: 'Incoming Webhook URL', type: 'text' },
          { name: 'TEAMS_APP_ID', label: 'Microsoft App ID', type: 'text' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'hermes-teams'
      },
      {
        id: 'google_chat',
        name: 'Google Chat',
        icon: 'message-circle',
        category: 'Enterprise Chat',
        description: 'Google Workspace space webhooks and interactive card messages via incoming webhook.',
        keys: [
          { name: 'GOOGLE_CHAT_WEBHOOK_URL', label: 'Space Webhook URL', type: 'text' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'hermes-google_chat'
      },
      {
        id: 'email',
        name: 'Email (SMTP & IMAP)',
        icon: 'mail',
        category: 'Mail Gateway',
        description: 'Terminal-based inbox triage, filtering, automated drafting, and dispatch using Himalaya CLI.',
        keys: [
          { name: 'SMTP_HOST', label: 'SMTP Server Host', type: 'text' },
          { name: 'SMTP_PORT', label: 'SMTP Port', type: 'text' },
          { name: 'SMTP_USER', label: 'SMTP Username / Email', type: 'text' },
          { name: 'SMTP_PASSWORD', label: 'SMTP Password / App Key', type: 'password' },
          { name: 'IMAP_HOST', label: 'IMAP Server Host', type: 'text' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'himalaya'
      },
      {
        id: 'webhook',
        name: 'Custom HTTP Webhook',
        icon: 'webhook',
        category: 'Developer API',
        description: 'Generic bi-directional HTTP REST webhooks with JSON payload and HMAC signature verification.',
        keys: [
          { name: 'WEBHOOK_ENDPOINT_URL', label: 'Target Webhook URL', type: 'text' },
          { name: 'WEBHOOK_SECRET', label: 'HMAC Secret Key', type: 'password' }
        ],
        docsUrl: 'https://hermes-agent.nousresearch.com/docs',
        plugin: 'builtin-web'
      }
    ];

    const channelsList = [];

    channelsList.push({
      id: 'telegram',
      name: 'Telegram Messenger',
      icon: 'send',
      isConfigured: true,
      category: 'Primary Messaging',
      status: 'active',
      description: 'Multi-Agent Gateway & Notification Bridge via Telegram Bot API with forum topic routing.',
      chatId: config.chatId || TELEGRAM_CHAT_ID,
      hasToken: !!token,
      botTokenMasked: token ? (token.substring(0, 7) + '...' + token.substring(token.length - 4)) : '',
      agentBots: agentTelegramBots,
      topics: config.topics || {},
      autoNotify: config.autoNotify || {},
      historyCount: (config.history || []).length
    });

    for (const ch of otherChannelsDef) {
      const primaryKey = ch.keys[0].name;
      const hasKey = !!(rootEnv[primaryKey] || process.env[primaryKey]);
      channelsList.push({
        ...ch,
        isConfigured: hasKey,
        status: hasKey ? 'active' : 'unconfigured',
        keysStatus: ch.keys.map(k => ({
          name: k.name,
          label: k.label,
          type: k.type,
          isSet: !!(rootEnv[k.name] || process.env[k.name]),
          maskedValue: rootEnv[k.name] ? (rootEnv[k.name].substring(0, 4) + '...') : ''
        }))
      });
    }

    const configuredCount = channelsList.filter(c => c.isConfigured).length;
    const unconfiguredCount = channelsList.length - configuredCount;

    res.json({
      success: true,
      stats: {
        total: channelsList.length,
        configuredCount,
        unconfiguredCount,
        telegramBotsCount: agentTelegramBots.filter(a => a.hasBot).length
      },
      channels: channelsList,
      telegramConfig: {
        enabled: config.enabled !== false,
        chatId: config.chatId || TELEGRAM_CHAT_ID,
        topics: config.topics || {},
        autoNotify: config.autoNotify || {}
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/channels/configure', (req, res) => {
  try {
    const { channelId, keys } = req.body;
    if (!channelId || !keys) {
      return res.status(400).json({ success: false, error: 'channelId and keys are required' });
    }

    const rootEnvPath = path.join(HERMES_HOME, '.env');
    let lines = fs.existsSync(rootEnvPath) ? fs.readFileSync(rootEnvPath, 'utf8').split('\n') : [];

    for (const [keyName, keyValue] of Object.entries(keys)) {
      if (keyValue === undefined || keyValue === null || keyValue.trim() === '') continue;
      let updated = false;
      lines = lines.map(line => {
        if (line.startsWith(`${keyName}=`)) {
          updated = true;
          return `${keyName}=${keyValue.trim()}`;
        }
        return line;
      });
      if (!updated) {
        lines.push(`${keyName}=${keyValue.trim()}`);
      }
    }

    fs.writeFileSync(rootEnvPath, lines.filter(Boolean).join('\n') + '\n', 'utf8');
    res.json({ success: true, message: `Channel ${channelId} configuration saved successfully.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= SKILLS CATALOG APIS =================

function getBundledSkillsSet() {
  const set = new Set();
  try {
    const manifestPath = path.join(SKILLS_DIR, '.bundled_manifest');
    if (fs.existsSync(manifestPath)) {
      const lines = fs.readFileSync(manifestPath, 'utf8').split('\n');
      for (const l of lines) {
        const trimmed = l.trim();
        if (trimmed && trimmed.includes(':')) {
          set.add(trimmed.split(':')[0].trim());
        }
      }
    }
  } catch (e) {}
  return set;
}

function scanSkills(dir, category = '') {
  let list = [];
  if (!fs.existsSync(dir)) return list;

  const bundled = getBundledSkillsSet();
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      const skillFile = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        const content = safeReadFile(skillFile, '');
        const { metadata, body } = parseFrontmatter(content);
        const skillName = metadata.name || item.name;
        const isBuiltin = bundled.has(skillName);
        list.push({
          name: skillName,
          category: category || path.basename(dir),
          description: metadata.description || '',
          version: metadata.version || '1.0.0',
          path: full,
          skillFile: skillFile,
          source: isBuiltin ? 'builtin' : 'local',
          isBuiltin,
          tags: (metadata.metadata && metadata.metadata.hermes && metadata.metadata.hermes.tags) || []
        });
      } else {
        list = list.concat(scanSkills(full, item.name));
      }
    }
  }
  return list;
}

app.get('/api/skills', (req, res) => {
  try {
    const allSkills = scanSkills(SKILLS_DIR);
    const categories = {};
    let builtinCount = 0;
    let localCount = 0;

    allSkills.forEach(s => {
      const cat = s.category || 'General';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(s);
      if (s.isBuiltin) builtinCount++;
      else localCount++;
    });

    res.json({
      success: true,
      stats: {
        total: allSkills.length,
        builtinCount,
        localCount,
        categoriesCount: Object.keys(categories).length
      },
      total: allSkills.length,
      categories,
      skills: allSkills
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/skills/detail', (req, res) => {
  try {
    const skillPath = req.query.path;
    if (!skillPath || !fs.existsSync(skillPath)) {
      return res.status(404).json({ success: false, error: 'Skill not found' });
    }
    const content = fs.readFileSync(skillPath, 'utf8');
    const { metadata, body } = parseFrontmatter(content);
    res.json({ success: true, metadata, content, body });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/mcp', (req, res) => {
  try {
    const cfgPath = path.join(HERMES_HOME, 'config.yaml');
    let servers = {};
    if (fs.existsSync(cfgPath)) {
      const cfg = yaml.load(fs.readFileSync(cfgPath, 'utf8')) || {};
      servers = cfg.mcp_servers || {};
    }
    let toolCounts = {};
    try {
      const cachePath = path.join(HERMES_HOME, 'cache', 'mcp_schema_cache.json');
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        Object.keys(cache).forEach(k => {
          toolCounts[k] = ((cache[k] && cache[k].tools) || []).length;
        });
      }
    } catch (e) { /* schema cache is optional */ }
    const list = Object.keys(servers).map(name => {
      const s = servers[name] || {};
      return {
        name,
        enabled: s.enabled !== false,
        transport: s.url ? 'http' : 'stdio',
        // NOTE: env is intentionally never exposed (may hold secrets)
        command: s.command ? `${s.command} ${(s.args || []).join(' ')}`.trim() : (s.url || ''),
        tools: Object.prototype.hasOwnProperty.call(toolCounts, name) ? toolCounts[name] : null
      };
    });
    res.json({
      success: true,
      stats: { total: list.length, enabled: list.filter(s => s.enabled).length },
      servers: list
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/skills/create', (req, res) => {
  try {
    const { name, category, description, content } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nama skill harus diisi' });
    }

    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-');
    const cleanCategory = (category && category.trim()) ? category.trim().toLowerCase().replace(/[^a-z0-9\-_]/g, '-') : 'custom';
    const targetDir = path.join(SKILLS_DIR, cleanCategory, cleanName);

    if (fs.existsSync(targetDir)) {
      return res.status(400).json({ success: false, error: `Skill "${cleanName}" sudah ada di direktori "${cleanCategory}/${cleanName}"` });
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const descClean = (description || '').trim() || cleanName;
    const frontmatter = [
      '---',
      `name: ${cleanName}`,
      `description: ${JSON.stringify(descClean)}`,
      '---',
      '',
      content && content.trim() ? content.trim() : `# ${cleanName}\n\nInstruksi operasional untuk skill ini.`
    ].join('\n');

    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), frontmatter, 'utf8');

    res.json({
      success: true,
      message: `Skill "${cleanName}" berhasil dibuat di kategori "${cleanCategory}".`,
      path: targetDir
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/skills/delete', (req, res) => {
  try {
    const { name, category, path: requestedPath } = req.body;
    let targetDir = requestedPath;

    if (!targetDir && name) {
      const allSkills = scanSkills(SKILLS_DIR);
      const found = allSkills.find(s => s.name === name && (!category || s.category === category));
      if (found) {
        targetDir = found.path;
      }
    }

    if (!targetDir || !fs.existsSync(targetDir)) {
      return res.status(404).json({ success: false, error: 'Direktori skill tidak ditemukan' });
    }

    const resolvedPath = path.resolve(targetDir);
    const resolvedSkillsDir = path.resolve(SKILLS_DIR);
    if (!resolvedPath.startsWith(resolvedSkillsDir) || resolvedPath === resolvedSkillsDir) {
      return res.status(403).json({ success: false, error: 'Path skill di luar batas SKILLS_DIR tidak diizinkan' });
    }

    fs.rmSync(resolvedPath, { recursive: true, force: true });

    // Also attempt uninstall via hermes CLI if available
    if (name) {
      try {
        const cleanCliName = name.replace(/[^a-zA-Z0-9_\-\/]/g, '');
        execSync(`hermes skills uninstall "${cleanCliName}" --yes`, { stdio: 'pipe' });
      } catch (e) {}
    }

    res.json({
      success: true,
      message: `Skill "${name || path.basename(targetDir)}" berhasil dihapus.`
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/skills/install', (req, res) => {
  try {
    const { identifier, category } = req.body;
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Identifier skill atau Git URL wajib diisi' });
    }

    const cleanId = identifier.trim();
    let cmd = `hermes skills install "${cleanId.replace(/"/g, '\\"')}" --yes`;
    if (category && category.trim()) {
      cmd += ` --category "${category.trim().replace(/"/g, '\\"')}"`;
    }

    const output = execSync(cmd, { encoding: 'utf8', timeout: 45000 });
    res.json({ success: true, message: `Skill berhasil diinstall.`, output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Gagal menginstall skill' });
  }
});

app.post('/api/skills/restore', (req, res) => {
  try {
    const { name } = req.body;
    const target = (name && name.trim()) ? name.trim().replace(/[^a-zA-Z0-9_\-]/g, '') : 'all';
    const cmd = `hermes skills repair-official --restore --yes ${target}`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 45000 });
    res.json({ success: true, message: `Skill default official berhasil dipulihkan.`, output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || 'Gagal restore skill official' });
  }
});

// ================= SESSIONS APIS =================

function getSessionsOverview() {
  const { DatabaseSync } = require('node:sqlite');
  const dbs = [
    { profile: 'default', path: path.join(HERMES_HOME, 'state.db') }
  ];

  if (fs.existsSync(PROFILES_DIR)) {
    try {
      const dirs = fs.readdirSync(PROFILES_DIR);
      for (const p of dirs) {
        if (p === 'default') continue;
        const dbPath = path.join(PROFILES_DIR, p, 'state.db');
        if (fs.existsSync(dbPath)) {
          dbs.push({ profile: p, path: dbPath });
        }
      }
    } catch (e) {}
  }

  let totalSessions = 0;
  let activeSessions = 0;
  let totalMessages = 0;
  let totalTokens = 0;
  const sessionsByProfile = {};
  const allSessions = [];

  for (const { profile, path: dbPath } of dbs) {
    sessionsByProfile[profile] = { total: 0, active: 0, messages: 0, tokens: 0 };
    try {
      const db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db.prepare(`
        SELECT id, profile_name, title, model, message_count, input_tokens, output_tokens, started_at, last_activity_at, ended_at
        FROM sessions
        ORDER BY COALESCE(last_activity_at, started_at) DESC
      `).all();

      sessionsByProfile[profile].total = rows.length;

      for (const r of rows) {
        totalSessions++;
        const isActive = r.ended_at === null;
        if (isActive) {
          activeSessions++;
          sessionsByProfile[profile].active++;
        }

        const msgCount = r.message_count || 0;
        const tokCount = (r.input_tokens || 0) + (r.output_tokens || 0);
        totalMessages += msgCount;
        totalTokens += tokCount;
        sessionsByProfile[profile].messages += msgCount;
        sessionsByProfile[profile].tokens += tokCount;

        allSessions.push({
          id: r.id,
          profile: r.profile_name || profile,
          title: r.title || 'Untitled Session',
          model: r.model || 'default',
          messageCount: msgCount,
          tokens: tokCount,
          startedAt: r.started_at,
          lastActivityAt: r.last_activity_at || r.started_at,
          isActive
        });
      }
      db.close();
    } catch (e) {
      console.error(`Error reading ${dbPath}:`, e.message);
    }
  }

  allSessions.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

  return {
    success: true,
    stats: {
      totalSessions,
      activeSessions,
      totalMessages,
      totalTokens
    },
    sessionsByProfile,
    recentSessions: allSessions.slice(0, 15)
  };
}

app.get('/api/sessions/overview', (req, res) => {
  try {
    const data = getSessionsOverview();
    res.json(data);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= CHAT LOGS & TRANSCRIPTS APIS =================

function getChatLogsDbs() {
  const dbs = [{ profile: 'default', path: path.join(HERMES_HOME, 'state.db') }];
  if (fs.existsSync(PROFILES_DIR)) {
    try {
      const dirs = fs.readdirSync(PROFILES_DIR);
      for (const p of dirs) {
        if (p === 'default') continue;
        const dbPath = path.join(PROFILES_DIR, p, 'state.db');
        if (fs.existsSync(dbPath)) {
          dbs.push({ profile: p, path: dbPath });
        }
      }
    } catch (e) {}
  }
  return dbs;
}

function redactSensitiveData(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/[0-9]{8,10}:[a-zA-Z0-9_-]{35}/g, '[REDACTED_BOT_TOKEN]')
    .replace(/sk-[a-zA-Z0-9]{20,}/g, '[REDACTED_API_KEY]')
    .replace(/HERMES_CUSTOM_[0-9_]+_API_KEY\s*=\s*[^\s]+/g, 'HERMES_CUSTOM_KEY=[REDACTED]');
}

app.get('/api/chat-logs/sessions', (req, res) => {
  try {
    const { profile, type, q, limit } = req.query;
    const dbs = getChatLogsDbs();
    const allSessions = [];
    const maxLimit = parseInt(limit, 10) || 500;

    for (const { profile: pName, path: dbPath } of dbs) {
      if (profile && profile !== 'all' && profile !== pName) continue;
      try {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const rows = db.prepare(`
          SELECT id, source, profile_name, title, model, message_count, input_tokens, output_tokens, started_at, last_activity_at, ended_at
          FROM sessions
          ORDER BY COALESCE(last_activity_at, started_at) DESC
        `).all();

        for (const r of rows) {
          const isActive = r.ended_at === null;
          const sTitle = r.title || 'Untitled Session';
          const prof = r.profile_name || pName;
          const isCron = r.source === 'cron' || (typeof r.id === 'string' && r.id.startsWith('cron_'));
          const sessionSource = r.source || (isCron ? 'cron' : 'chat');

          if (type === 'chat' && isCron) continue;
          if (type === 'cron' && !isCron) continue;

          if (q) {
            const queryLower = q.toLowerCase();
            if (!sTitle.toLowerCase().includes(queryLower) && !r.id.toLowerCase().includes(queryLower)) {
              continue;
            }
          }

          allSessions.push({
            id: r.id,
            source: sessionSource,
            isCron,
            profile: prof,
            title: sTitle,
            model: r.model || 'default',
            messageCount: r.message_count || 0,
            tokens: (r.input_tokens || 0) + (r.output_tokens || 0),
            startedAt: r.started_at,
            lastActivityAt: r.last_activity_at || r.started_at,
            isActive
          });
        }
        db.close();
      } catch (err) {
        console.error(`Error reading ${dbPath} in /api/chat-logs/sessions:`, err.message);
      }
    }

    allSessions.sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

    res.json({
      success: true,
      total: allSessions.length,
      sessions: allSessions.slice(0, maxLimit)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/chat-logs/sessions/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    const { profile: profileHint } = req.query;
    const dbs = getChatLogsDbs();
    let foundSession = null;
    let foundProfile = null;
    let foundDbPath = null;

    for (const { profile: pName, path: dbPath } of dbs) {
      if (profileHint && profileHint !== 'all' && profileHint !== pName) continue;
      try {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
        db.close();
        if (s) {
          foundSession = s;
          foundProfile = s.profile_name || pName;
          foundDbPath = dbPath;
          break;
        }
      } catch (e) {}
    }

    if (!foundSession) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const db = new DatabaseSync(foundDbPath, { readOnly: true });
    const rawMessages = db.prepare(`
      SELECT id, role, content, tool_call_id, tool_calls, tool_name, reasoning_content, timestamp, token_count
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC, id ASC
    `).all(sessionId);
    db.close();

    const messages = rawMessages.map(m => {
      let parsedToolCalls = null;
      if (m.tool_calls) {
        try {
          parsedToolCalls = JSON.parse(m.tool_calls);
        } catch (e) {
          parsedToolCalls = m.tool_calls;
        }
      }

      return {
        id: m.id,
        role: m.role,
        content: redactSensitiveData(m.content || ''),
        tool_name: m.tool_name,
        tool_calls: parsedToolCalls,
        reasoning_content: redactSensitiveData(m.reasoning_content || ''),
        timestamp: m.timestamp,
        token_count: m.token_count
      };
    });

    res.json({
      success: true,
      session: {
        id: foundSession.id,
        source: foundSession.source || (foundSession.id.startsWith('cron_') ? 'cron' : 'chat'),
        isCron: foundSession.source === 'cron' || foundSession.id.startsWith('cron_'),
        profile: foundProfile,
        title: foundSession.title || 'Untitled Session',
        model: foundSession.model || 'default',
        messageCount: foundSession.message_count || messages.length,
        tokens: (foundSession.input_tokens || 0) + (foundSession.output_tokens || 0),
        startedAt: foundSession.started_at,
        lastActivityAt: foundSession.last_activity_at || foundSession.started_at,
        isActive: foundSession.ended_at === null
      },
      messages
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/chat-logs/sessions/:id', (req, res) => {
  try {
    const sessionId = req.params.id;
    const { profile: profileHint } = req.query;
    const dbs = getChatLogsDbs();
    let foundDbPath = null;
    let targetProfile = null;
    let targetSession = null;

    for (const { profile: pName, path: dbPath } of dbs) {
      if (profileHint && profileHint !== 'all' && profileHint !== pName) continue;
      try {
        const db = new DatabaseSync(dbPath, { readOnly: true });
        const s = db.prepare('SELECT id, ended_at FROM sessions WHERE id = ?').get(sessionId);
        db.close();
        if (s) {
          targetSession = s;
          foundDbPath = dbPath;
          targetProfile = pName;
          break;
        }
      } catch (e) {}
    }

    if (!targetSession) {
      return res.status(404).json({ success: false, error: 'Session tidak ditemukan' });
    }

    // Hanya sesi tidak aktif yang boleh dihapus
    if (targetSession.ended_at === null) {
      return res.status(400).json({ success: false, error: 'Sesi aktif tidak boleh dihapus. Tunggu sesi selesai terlebih dahulu.' });
    }

    const db = new DatabaseSync(foundDbPath);
    try {
      db.prepare('UPDATE sessions SET parent_session_id = NULL WHERE parent_session_id = ?').run(sessionId);
      try { db.prepare('DELETE FROM session_model_usage WHERE session_id = ?').run(sessionId); } catch (e) {}
      db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    } finally {
      db.close();
    }

    // Hapus file export jika ada
    const sessDir = targetProfile === 'default'
      ? path.join(HERMES_HOME, 'sessions')
      : path.join(PROFILES_DIR, targetProfile, 'sessions');
    if (fs.existsSync(sessDir)) {
      for (const ext of ['.json', '.jsonl']) {
        const p = path.join(sessDir, `${sessionId}${ext}`);
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) {} }
      }
    }

    res.json({ success: true, message: `Sesi ${sessionId} berhasil dihapus.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat-logs/sessions/prune-inactive', (req, res) => {
  try {
    const { profile, type } = req.body || {};
    const dbs = getChatLogsDbs();
    let totalDeleted = 0;

    for (const { profile: pName, path: dbPath } of dbs) {
      if (profile && profile !== 'all' && profile !== pName) continue;
      try {
        const db = new DatabaseSync(dbPath);
        let query = 'SELECT id, source FROM sessions WHERE ended_at IS NOT NULL';
        if (type === 'cron') {
          query += " AND (source = 'cron' OR id LIKE 'cron_%')";
        } else if (type === 'chat') {
          query += " AND (source != 'cron' AND id NOT LIKE 'cron_%')";
        }
        const rows = db.prepare(query).all();
        for (const row of rows) {
          const sid = row.id;
          try {
            db.prepare('UPDATE sessions SET parent_session_id = NULL WHERE parent_session_id = ?').run(sid);
            try { db.prepare('DELETE FROM session_model_usage WHERE session_id = ?').run(sid); } catch (e) {}
            db.prepare('DELETE FROM messages WHERE session_id = ?').run(sid);
            db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
            totalDeleted++;
          } catch (delErr) {
            console.error(`Error deleting session ${sid}:`, delErr.message);
          }
        }
        db.close();
      } catch (err) {
        console.error(`Error pruning DB ${dbPath}:`, err.message);
      }
    }

    res.json({ success: true, deletedCount: totalDeleted, message: `${totalDeleted} sesi tidak aktif berhasil dibersihkan.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= MEMORY APIS =================

app.get('/api/memory', (req, res) => {
  try {
    const memories = [
      { category: 'Obsidian Vault', key: 'OBSIDIAN_VAULT_PATH', content: `${VAULT_DIR}${OBSIDIAN_GIT_REMOTE ? ' (Synced to ' + OBSIDIAN_GIT_REMOTE + ')' : ''}` },
      { category: 'VPS Infrastructure', key: 'Swap Allocation', content: '4GB swapfile enabled with vm.swappiness=20 in /etc/sysctl.d/99-swappiness.conf' },
      { category: 'Services & Routing', key: 'PM2 Services', content: '9router on port 20128, secret-agent on port 3000' },
      { category: 'User Persona', key: process.env.OPERATOR_NAME || 'Operator', content: TELEGRAM_CHAT_ID ? `Telegram ID: ${TELEGRAM_CHAT_ID}` : 'Not configured' }
    ];
    res.json({ success: true, memories });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================= SYSTEM TELEMETRY API =================

app.get('/api/system/status', (req, res) => {
  try {
    const memRaw = execSync('free -m', { encoding: 'utf8' });
    const lines = memRaw.trim().split('\n');
    const memParts = lines[1].split(/\s+/);
    const swapParts = lines.length > 2 ? lines[2].split(/\s+/) : ['Swap:', '0', '0', '0'];

    const totalMem = parseInt(memParts[1], 10);
    const usedMem = parseInt(memParts[2], 10);
    const totalSwap = parseInt(swapParts[1] || 0, 10);
    const usedSwap = parseInt(swapParts[2] || 0, 10);

    const dfRaw = execSync('df -h /', { encoding: 'utf8' });
    const dfLines = dfRaw.trim().split('\n');
    const dfParts = dfLines[1].split(/\s+/);

    let pm2List = [];
    try {
      const pm2Raw = execSync('pm2 jlist', { encoding: 'utf8' });
      const pm2Parsed = JSON.parse(pm2Raw);
      pm2List = pm2Parsed.map(p => ({
        name: p.name,
        pm_id: p.pm_id,
        status: p.pm2_env.status,
        cpu: p.monit ? p.monit.cpu : 0,
        memory: p.monit ? `${Math.round(p.monit.memory / 1024 / 1024)} MB` : '0 MB',
        uptime: p.pm2_env.pm_uptime
      }));
    } catch (e) {}

    res.json({
      success: true,
      ram: { total: `${totalMem} MB`, used: `${usedMem} MB`, percent: Math.round((usedMem / totalMem) * 100) },
      swap: { total: `${totalSwap} MB`, used: `${usedSwap} MB`, percent: totalSwap > 0 ? Math.round((usedSwap / totalSwap) * 100) : 0 },
      storage: { total: dfParts[1], used: dfParts[2], avail: dfParts[3], percent: dfParts[4] },
      uptime: execSync('uptime -p', { encoding: 'utf8' }).trim(),
      pm2: pm2List
    });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// ================= OFFICE AGENT CHAT APIS =================

app.get('/api/office/agents', (req, res) => {
  try {
    const rawProfiles = [];
    rawProfiles.push(getProfileDetails('default'));

    if (fs.existsSync(PROFILES_DIR)) {
      const dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (d.isDirectory() && !d.name.startsWith('.') && d.name !== 'default') {
          rawProfiles.push(getProfileDetails(d.name));
        }
      }
    }

    // Display metadata derived from live profile data — no hardcoded team.
    // Cloners see their own agents with these generic styles.
    const AVATAR_COLORS = ['from-slate-600 to-slate-800', 'from-blue-600 to-indigo-700', 'from-emerald-600 to-teal-800', 'from-purple-600 to-pink-700', 'from-amber-500 to-orange-600', 'from-cyan-600 to-blue-700'];
    const hashPickMeta = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_COLORS[h % AVATAR_COLORS.length]; };
    const agentMeta = {};
    for (const mp of rawProfiles) {
      agentMeta[mp.id] = {
        displayName: mp.name || mp.id,
        role: mp.description || 'Autonomous Agent',
        group: 'Specialized Agents',
        avatarColor: hashPickMeta(mp.id),
        initials: (mp.name || mp.id).substring(0, 2).toUpperCase(),
        presetPrompts: ['Periksa status tugas saat ini', 'Tampilkan kapabilitas agen']
      };
    }
    const agents = [];

    for (const p of rawProfiles) {
      const pName = p.id;
      const meta = agentMeta[pName] || {
        displayName: p.name || pName,
        role: p.description || 'Autonomous Agent',
        group: 'Specialized Agents',
        avatarColor: 'from-slate-600 to-slate-800',
        initials: (p.name || pName).substring(0, 2).toUpperCase(),
        presetPrompts: ['Periksa status tugas saat ini', 'Tampilkan kapabilitas agen']
      };

      const dbPath = pName === 'default' ? path.join(HERMES_HOME, 'state.db') : path.join(PROFILES_DIR, pName, 'state.db');
      let lastSession = null;
      let lastMessage = null;

      if (fs.existsSync(dbPath)) {
        try {
          const db = new DatabaseSync(dbPath, { readOnly: true });
          const sessRow = db.prepare(`
            SELECT id, title, model, started_at, last_activity_at, ended_at
            FROM sessions
            WHERE (source IS NULL OR source != 'cron') AND (id NOT LIKE 'cron_%')
            ORDER BY COALESCE(last_activity_at, started_at) DESC
            LIMIT 1
          `).get();

          if (sessRow) {
            lastSession = {
              id: sessRow.id,
              title: sessRow.title || 'Interactive Session',
              model: sessRow.model,
              startedAt: sessRow.started_at,
              lastActivityAt: sessRow.last_activity_at || sessRow.started_at,
              isActive: sessRow.ended_at === null
            };

            const msgRow = db.prepare(`
              SELECT role, content, timestamp
              FROM messages
              WHERE session_id = ?
              ORDER BY timestamp DESC, id DESC
              LIMIT 1
            `).get(sessRow.id);

            if (msgRow) {
              let snippet = (msgRow.content || '').replace(/\s+/g, ' ').trim();
              if (snippet.length > 70) snippet = snippet.substring(0, 70) + '...';
              lastMessage = {
                role: msgRow.role,
                content: redactSensitiveData(snippet),
                timestamp: msgRow.timestamp
              };
            }
          }
          db.close();
        } catch (err) {
          console.error(`Error reading ${dbPath} in /api/office/agents:`, err.message);
        }
      }

      agents.push({
        id: pName,
        displayName: meta.displayName,
        role: meta.role,
        group: meta.group,
        model: p.model || 'ag/gemini-3.8-flash-high',
        provider: p.provider || 'custom',
        status: p.gatewayStatus === 'running' ? 'Online' : (p.active ? 'Ready' : 'Offline'),
        gatewayStatus: p.gatewayStatus,
        avatarColor: meta.avatarColor,
        initials: meta.initials,
        presetPrompts: meta.presetPrompts,
        lastSession,
        lastMessage: lastMessage ? lastMessage.content : meta.role,
        lastTime: lastMessage ? lastMessage.timestamp : (lastSession ? lastSession.lastActivityAt : null)
      });
    }

    res.json({ success: true, agents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/office/messages', (req, res) => {
  try {
    const { agent, sessionId } = req.query;
    if (!agent) {
      return res.status(400).json({ success: false, error: 'Agent profile is required' });
    }

    const dbPath = agent === 'default' ? path.join(HERMES_HOME, 'state.db') : path.join(PROFILES_DIR, agent, 'state.db');
    if (!fs.existsSync(dbPath)) {
      return res.json({ success: true, sessionId: null, messages: [] });
    }

    const db = new DatabaseSync(dbPath, { readOnly: true });

    let targetSessionId = sessionId;
    if (!targetSessionId || targetSessionId === 'latest') {
      const latestRow = db.prepare(`
        SELECT id FROM sessions
        WHERE source = 'web'
        ORDER BY COALESCE(last_activity_at, started_at) DESC
        LIMIT 1
      `).get();
      if (latestRow) {
        targetSessionId = latestRow.id;
      }
    }

    if (!targetSessionId) {
      db.close();
      return res.json({ success: true, sessionId: null, messages: [] });
    }

    const sessionInfo = db.prepare('SELECT id, title, model, started_at, last_activity_at, ended_at FROM sessions WHERE id = ?').get(targetSessionId);

    const rows = db.prepare(`
      SELECT id, role, content, tool_call_id, tool_calls, tool_name, reasoning_content, timestamp
      FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC, id ASC
    `).all(targetSessionId);
    db.close();

    const messages = rows.map(m => {
      let parsedToolCalls = null;
      if (m.tool_calls) {
        try { parsedToolCalls = JSON.parse(m.tool_calls); } catch (e) { parsedToolCalls = m.tool_calls; }
      }
      return {
        id: m.id,
        role: m.role,
        content: redactSensitiveData(m.content || ''),
        toolCallId: m.tool_call_id,
        toolCalls: parsedToolCalls,
        toolName: m.tool_name,
        reasoningContent: redactSensitiveData(m.reasoning_content || ''),
        timestamp: m.timestamp
      };
    });

    res.json({
      success: true,
      sessionId: targetSessionId,
      session: sessionInfo,
      messages
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/office/sessions', (req, res) => {
  try {
    const { agent } = req.query;
    if (!agent) return res.status(400).json({ success: false, error: 'Agent required' });
    const dbPath = agent === 'default' ? path.join(HERMES_HOME, 'state.db') : path.join(PROFILES_DIR, agent, 'state.db');
    if (!fs.existsSync(dbPath)) return res.json({ success: true, sessions: [] });
    const db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db.prepare(`
      SELECT id, title, model, message_count, started_at, last_activity_at, ended_at
      FROM sessions
      WHERE source = 'web'
      ORDER BY COALESCE(last_activity_at, started_at) DESC
      LIMIT 30
    `).all();
    db.close();
    res.json({ success: true, sessions: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/office/chat', (req, res) => {
  try {
    const { agent, message, sessionId } = req.body;
    if (!agent || !message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Agent and non-empty message are required' });
    }

    const homeDir = agent === 'default' ? HERMES_HOME : path.join(PROFILES_DIR, agent);
    if (!fs.existsSync(homeDir)) {
      return res.status(404).json({ success: false, error: `Agent profile '${agent}' directory not found` });
    }

    const trimmedMsg = message.trim();
    // --source web: tandai sesi Office agar terpisah dari sesi 'cli' biasa.
    const args = ['chat', '--query-file', '-', '--oneshot', '-Q', '--yolo', '--accept-hooks', '--source', 'web'];
    if (sessionId && sessionId !== 'new') {
      args.push('--resume', sessionId);
    }

    const env = { ...process.env, HERMES_HOME: homeDir };
    env.PATH = `/root/.cargo/bin:/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${env.PATH || ''}`;

    const child = spawn('hermes', args, {
      env,
      timeout: 180000
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', err => {
      console.error(`Error spawning hermes chat for ${agent}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to spawn agent process: ' + err.message });
      }
    });

    child.on('close', code => {
      let matchedSessionId = null;
      const combined = stdout + '\n' + stderr;
      const sessMatch = combined.match(/session_id:\s*([a-zA-Z0-9_-]+)/);
      if (sessMatch) {
        matchedSessionId = sessMatch[1];
      }

      const dbPath = agent === 'default' ? path.join(HERMES_HOME, 'state.db') : path.join(PROFILES_DIR, agent, 'state.db');
      let finalSessionId = matchedSessionId || sessionId;
      let newMessages = [];

      if (fs.existsSync(dbPath)) {
        try {
          const db = new DatabaseSync(dbPath, { readOnly: true });
          if (!finalSessionId) {
            const latest = db.prepare(`
              SELECT id FROM sessions
              WHERE (source IS NULL OR source != 'cron') AND (id NOT LIKE 'cron_%')
              ORDER BY COALESCE(last_activity_at, started_at) DESC
              LIMIT 1
            `).get();
            if (latest) finalSessionId = latest.id;
          }

          if (finalSessionId) {
            const rows = db.prepare(`
              SELECT id, role, content, tool_call_id, tool_calls, tool_name, reasoning_content, timestamp
              FROM messages
              WHERE session_id = ?
              ORDER BY timestamp ASC, id ASC
            `).all(finalSessionId);
            newMessages = rows.map(m => {
              let parsedToolCalls = null;
              if (m.tool_calls) {
                try { parsedToolCalls = JSON.parse(m.tool_calls); } catch (e) { parsedToolCalls = m.tool_calls; }
              }
              return {
                id: m.id,
                role: m.role,
                content: redactSensitiveData(m.content || ''),
                toolCallId: m.tool_call_id,
                toolCalls: parsedToolCalls,
                toolName: m.tool_name,
                reasoningContent: redactSensitiveData(m.reasoning_content || ''),
                timestamp: m.timestamp
              };
            });
          }
          db.close();
        } catch (dbErr) {
          console.error(`Error reading updated messages for ${agent}:`, dbErr.message);
        }
      }

      // Sesi Office adalah thread persisten (seperti sesi telegram), bukan sesi CLI sekali pakai.
      // CLI selalu menutupnya dengan `cli_close` saat exit, sehingga sesi Office tampak "inactive"
      // dan ikut terhapus oleh Clear Inactive di Chat Logs.
      // Hanya SATU sesi web yang boleh aktif — sesi web lain milik profil ini ditutup,
      // jadi memulai thread baru otomatis menonaktifkan thread lama.
      if (finalSessionId) {
        try {
          const writeDb = new DatabaseSync(dbPath);
          writeDb.prepare(
            "UPDATE sessions SET ended_at = NULL, end_reason = NULL WHERE id = ?"
          ).run(finalSessionId);
          writeDb.prepare(
            "UPDATE sessions SET ended_at = ?, end_reason = 'superseded_by_resume' " +
            "WHERE source = 'web' AND id != ? AND ended_at IS NULL"
          ).run(Date.now() / 1000, finalSessionId);
          writeDb.close();
        } catch (reopenErr) {
          console.error(`Could not reopen office session ${finalSessionId}:`, reopenErr.message);
        }
      }

      const lastAssistantMsg = [...newMessages].reverse().find(m => m.role === 'assistant');
      const replyText = lastAssistantMsg ? lastAssistantMsg.content : stdout.trim();

      res.json({
        success: code === 0 || newMessages.length > 0,
        exitCode: code,
        sessionId: finalSessionId,
        reply: replyText,
        messages: newMessages,
        error: code !== 0 && !replyText ? stderr.trim() : null
      });
    });

    child.stdin.write(trimmedMsg);
    child.stdin.end();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Periodic Watchdog (every 60 seconds)
setInterval(() => {
  try {
    telegramNotifier.runWatchdogCheck();
  } catch (e) {}
}, 60000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Secret Agent Ops Deck server running on http://0.0.0.0:${PORT}`);
});
